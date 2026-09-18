import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Client } from 'pg';

import { countChecksByStatus } from '../database/checks.ts';
import { selectRows } from '../database/rows.ts';
import type { IsoDate } from '../database/rows.ts';
import { listCheckSummaries } from '../database/summaries.ts';
import { STALE_AFTER_DAYS } from '../staleness.ts';
import { ledgerCheckUuid, ledgerFileUuid } from './identity.ts';
import { describeIssues, loadLedger } from './load.ts';
import type { LedgerContents } from './load.ts';
import { renderExport, renderPage } from './page.ts';
import { buildSnapshot } from './snapshot.ts';
import type { PublishedLedger } from './snapshot.ts';
import { disagreements, LedgerDisagreementError } from './verify.ts';
import type { DatabaseTotals } from './verify.ts';

/**
 * The build: files in the repository to a page nothing has to serve.
 *
 * The database is not a store here, it is the derivation. The recorded runs are
 * loaded into it, the status of every check is read back out of the same SQL
 * function the running app reads, and what is published is what that function
 * said. Deriving a status in the exporter instead would be a second
 * implementation of the one rule this product is about, and the two would
 * disagree the first time either was edited.
 *
 * Nothing is written until the whole thing has been checked against itself. The
 * page and the export are built in memory, compared with the records they came
 * from, and only then put on disk, so a build that disagrees with its own record
 * publishes nothing rather than publishing the disagreement.
 */

/** The files the build writes, under the output directory. */
export const pageFilename = 'index.html';
export const exportFilename = 'ledger.json';

/** Thrown when the ledger itself is refused, naming every issue. */
export class LedgerRefusedError extends Error {
  constructor(description: string) {
    super(`The ledger was refused, so nothing was published:\n${description}`);
    this.name = 'LedgerRefusedError';
  }
}

export interface BuildOptions {
  /** The ledger directory, as a path this process can read. */
  readonly directory: string;
  /** Where that directory sits in the repository, such as `ledger`. */
  readonly ledgerPath: string;
  /** Where to write the page and the export. */
  readonly outputDirectory: string;
  /** The owner and repository the commit links point into. */
  readonly repository: string;
  /** The commit the build is running against. */
  readonly builtFrom: string;
  /** The commit that added each file, keyed by its path in the repository. */
  readonly recordingCommits: ReadonlyMap<string, string>;
  /** The day the statuses are read as of. */
  readonly asOf: IsoDate;
  /** The threshold they are read against. Defaults to the app's own. */
  readonly staleAfterDays?: number;
}

export interface BuildResult {
  readonly ledger: PublishedLedger;
  readonly page: string;
  /** The files written, as absolute paths. */
  readonly written: readonly string[];
}

/**
 * Empties the four tables and writes the whole ledger into them, in one
 * transaction.
 *
 * The build owns this database. It replaces what is there rather than adding to
 * it, because the ledger is the record in full and a row left over from a
 * previous build would be published as though somebody had recorded it.
 *
 * The ids are derived from the records' own names rather than generated, so the
 * same ledger always produces the same ids and the export can point a run back
 * at the file it came from.
 */
async function writeLedgerToDatabase(
  client: Client,
  ledgerPath: string,
  contents: LedgerContents,
): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(
      'TRUNCATE TABLE checks, test_runs, arming_observations RESTART IDENTITY CASCADE',
    );

    for (const entry of contents.checks) {
      await client.query(
        `INSERT INTO checks (id, name, area, protects, how_to_tell_armed)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          ledgerCheckUuid(entry.record.id),
          entry.record.name,
          entry.record.area,
          entry.record.protects,
          entry.record.howToTellArmed,
        ],
      );
    }

    for (const entry of contents.runs) {
      await client.query(
        `INSERT INTO test_runs
           (id, check_id, run_on, planted, expected, outcome, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          ledgerFileUuid(`${ledgerPath}/${entry.file}`),
          ledgerCheckUuid(entry.record.checkId),
          entry.record.runOn,
          entry.record.planted,
          entry.record.expected,
          entry.record.outcome,
          entry.record.note,
        ],
      );
    }

    for (const entry of contents.observations) {
      await client.query(
        `INSERT INTO arming_observations
           (id, check_id, observed_on, armed, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          ledgerFileUuid(`${ledgerPath}/${entry.file}`),
          ledgerCheckUuid(entry.record.checkId),
          entry.record.observedOn,
          entry.record.armed,
          entry.record.note,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  }
}

/** How many rows each table holds, counted rather than assumed. */
async function countRows(client: Client): Promise<DatabaseTotals> {
  const [row] = await selectRows<{
    checks: string;
    runs: string;
    observations: string;
  }>(
    client,
    `SELECT
       (SELECT count(*) FROM checks) AS checks,
       (SELECT count(*) FROM test_runs) AS runs,
       (SELECT count(*) FROM arming_observations) AS observations`,
  );
  if (row === undefined) {
    throw new Error('Counting the ledger rows returned nothing.');
  }
  // count() is bigint, which the driver hands back as text rather than risk a
  // number that cannot hold it. A ledger with more records than a double can
  // count is not a thing.
  return {
    checks: Number(row.checks),
    runs: Number(row.runs),
    observations: Number(row.observations),
  };
}

/**
 * Builds the published ledger and writes it, or refuses and writes nothing.
 *
 * The client is passed in rather than opened here, so the tests can hand it the
 * test database and the script can hand it the development one. Whichever it
 * is, its four tables are emptied.
 */
export async function buildLedger(
  client: Client,
  options: BuildOptions,
): Promise<BuildResult> {
  const staleAfterDays = options.staleAfterDays ?? STALE_AFTER_DAYS;

  const loaded = await loadLedger({
    directory: options.directory,
    today: options.asOf,
  });
  if (!loaded.ok) {
    throw new LedgerRefusedError(describeIssues(loaded.issues));
  }

  await writeLedgerToDatabase(client, options.ledgerPath, loaded.contents);

  const snapshot = buildSnapshot({
    contents: loaded.contents,
    summaries: await listCheckSummaries(client, options.asOf, staleAfterDays),
    ledgerPath: options.ledgerPath,
    repository: options.repository,
    builtFrom: options.builtFrom,
    builtOn: options.asOf,
    staleAfterDays,
    recordingCommits: options.recordingCommits,
  });
  const page = renderPage(snapshot);

  const found = disagreements({
    contents: loaded.contents,
    snapshot,
    page,
    ledgerPath: options.ledgerPath,
    databaseTotals: await countRows(client),
    statusTotals: await countChecksByStatus(
      client,
      options.asOf,
      staleAfterDays,
    ),
  });
  if (found.length > 0) {
    throw new LedgerDisagreementError(found);
  }

  await mkdir(options.outputDirectory, { recursive: true });
  const pagePath = join(options.outputDirectory, pageFilename);
  const exportPath = join(options.outputDirectory, exportFilename);
  await writeFile(pagePath, page, 'utf8');
  await writeFile(exportPath, renderExport(snapshot), 'utf8');

  return { ledger: snapshot, page, written: [pagePath, exportPath] };
}
