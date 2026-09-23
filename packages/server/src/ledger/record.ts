import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IsoDate } from '../database/rows.ts';
import { todayInUtc } from '../day.ts';
import { describeIssues, loadLedger, runsDirectory } from './load.ts';
import { parseLedgerRun } from './records.ts';
import type { LedgerRun, RecordIssue } from './records.ts';

/**
 * Adding a run to the ledger, which is what a job does when it has replayed a
 * plant and has a result.
 *
 * One record, one file, and the file's name is fixed by what is in it. Two jobs
 * finishing at the same moment therefore write two different paths and never
 * touch each other's work: there is nothing to merge, so there is nothing for a
 * merge to get wrong. The same job run twice writes the same path with the same
 * bytes, so a retry records one run rather than two.
 *
 * The cost of naming a file after its contents is that two runs that are
 * identical in every field, on the same day, are one file and therefore one
 * run. That is the honest reading of two records that say exactly the same
 * thing about the same day, and a note is enough to separate them when they are
 * genuinely two.
 *
 * Nothing is written when the record is refused. A record that reaches the
 * repository and is rejected afterwards has already been committed, and this is
 * the step the workflow relies on to stop that.
 */

/** How much of the digest goes in the filename. */
const digestLength = 12;

/**
 * The record as text, with its keys in a fixed order.
 *
 * JSON.stringify follows insertion order, so two records with the same fields
 * written in a different order would otherwise digest differently and land in
 * two files. Sorting the keys is what makes the name a function of the record
 * rather than of how the record was built.
 */
function canonical(record: LedgerRun): string {
  return JSON.stringify(record, Object.keys(record).sort());
}

/**
 * Where a run is written: the day it happened, the check it is about, and a
 * digest of the whole record.
 *
 * The first two are for a person scanning the directory; the digest is what
 * makes the name unique. A day and a check alone would collide the second time
 * a check is replayed in a day, which is the ordinary case rather than a rare
 * one.
 */
export function runFilename(record: LedgerRun): string {
  const digest = createHash('sha256')
    .update(canonical(record))
    .digest('hex')
    .slice(0, digestLength);
  return `${runsDirectory}/${record.runOn}-${record.checkId}-${digest}.json`;
}

/** The file that was written, or every rule the record broke. */
export type RecordResult =
  | {
      readonly ok: true;
      /** The file, relative to the ledger directory. */
      readonly file: string;
      /** False when the identical record was already recorded. */
      readonly created: boolean;
    }
  | { readonly ok: false; readonly errors: readonly RecordIssue[] };

export interface RecordOptions {
  /** The ledger directory, as a path this process can write. */
  readonly directory: string;
  /** The run to record, as it arrived, before any of it is trusted. */
  readonly input: unknown;
  /** The day it is being recorded on. Passed in so a test can pin it. */
  readonly today?: IsoDate;
}

/**
 * Records a run, or refuses it and writes nothing.
 *
 * The ledger is read first, because whether the check exists is a rule about
 * the ledger rather than about the record, and a run against a check nobody has
 * written down would otherwise be committed and then refused by a foreign key
 * at build time. A ledger that does not load at all stops this outright: adding
 * a record to a ledger already known to be wrong would bury the original fault
 * under a second one.
 */
export async function recordRun(options: RecordOptions): Promise<RecordResult> {
  const today = options.today ?? todayInUtc();

  const loaded = await loadLedger({
    directory: options.directory,
    today,
  });
  if (!loaded.ok) {
    throw new Error(
      `The ledger has to be sound before a run is added to it:\n${describeIssues(loaded.issues)}`,
    );
  }

  const parsed = parseLedgerRun(options.input, today);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors };
  }

  // An address that matches nothing is refused, and nothing is created to
  // receive the run. The id is the whole of what a recording workflow's input
  // says about the check it is recording against, so a misspelt one is far
  // more likely than a check that has yet to be written down, and a recorder
  // that answered it by creating the check would publish a status nobody
  // recorded. The refusal names the id, which has already been held to lower
  // case letters, digits and hyphens by the schema, so echoing it is safe.
  const known = loaded.contents.checks.some(
    (entry) => entry.record.id === parsed.value.checkId,
  );
  if (!known) {
    return {
      ok: false,
      errors: [
        {
          path: 'checkId',
          message: `There is no check in the ledger with the id ${parsed.value.checkId}.`,
        },
      ],
    };
  }

  const file = runFilename(parsed.value);
  const path = join(options.directory, file);
  const text = `${JSON.stringify(parsed.value, null, 2)}\n`;

  const existing = await readIfPresent(path);
  if (existing === text) {
    return { ok: true, file, created: false };
  }

  await mkdir(join(options.directory, runsDirectory), { recursive: true });
  await writeFile(path, text, 'utf8');
  return { ok: true, file, created: true };
}

/** The file's contents, or null when it is not there. */
async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return null;
    }
    throw cause;
  }
}
