import { STATUSES } from '@seen-to-fail/filter';

import type { StatusTotals } from '../database/checks.ts';
import { outcomeSettlesSomething } from '../database/rows.ts';
import type { IsoDate } from '../database/rows.ts';
import type { CheckSummary } from '../database/summaries.ts';
import { ledgerCheckUuid } from './identity.ts';
import { escapeHtml } from './page.ts';
import type { LedgerContents } from './load.ts';
import type { PublishedLedger } from './snapshot.ts';

/**
 * The check that runs between building the published output and writing it.
 *
 * Every step from a file on disk to a row in a table is a chance to lose a
 * record, and losing one is invisible: a page listing nine runs where the ledger
 * holds ten looks exactly like a page listing ten. Nothing about it is wrong on
 * its face, no error is raised, and the only reader who could notice is one who
 * already knows the answer. That is the failure this project exists to describe,
 * so the build is not allowed to have it.
 *
 * What is compared here is deliberately not what was copied. Copying the
 * database's status into the export and then comparing the two would be an
 * assertion that a variable equals itself: it cannot fail, so it says nothing.
 * Each comparison below has two sides that were worked out by different code:
 *
 *  - the files on disk against the rows the database now holds, which catches an
 *    insert that dropped a record,
 *  - the files on disk against the export, which catches an export that dropped
 *    one, counted it twice, or published a run saying something other than what
 *    its own file says about what the check did or where the run came from,
 *  - the export's own tally of statuses against the database's independent
 *    count of them,
 *  - the export against the rendered page, which catches a renderer that left a
 *    check out,
 *  - the first settled run in each check's exported table against the run the
 *    derivation says its status was read from, which catches the table and the
 *    status being headed by two different runs. The order is sorted in
 *    TypeScript and the pick is made in SQL, so the two are separate answers
 *    to one question.
 *
 * The one thing that genuinely is a copy, a check's status, is held to the
 * database by a test rather than by a comparison here, because a test can ask
 * the database a second time and this cannot.
 */

/** What the database holds, counted after the records were inserted. */
export interface DatabaseTotals {
  readonly checks: number;
  readonly runs: number;
  readonly observations: number;
}

export interface VerificationInput {
  readonly contents: LedgerContents;
  readonly snapshot: PublishedLedger;
  readonly page: string;
  /** Where the ledger sits in the repository, such as `ledger`. */
  readonly ledgerPath: string;
  /** Counted straight off the tables, not from the summaries. */
  readonly databaseTotals: DatabaseTotals;
  /** The database's own count of checks by status. */
  readonly statusTotals: StatusTotals;
  /** What the derivation worked out for each check, keyed inside by its uuid. */
  readonly summaries: readonly CheckSummary[];
}

/** The latest of a set of days, or null when the set is empty. */
function latest(days: readonly IsoDate[]): IsoDate | null {
  return days.length === 0
    ? null
    : days.reduce((newest, day) => (day > newest ? day : newest));
}

/**
 * A run named in a refusal, or what its absence means. No run means no run
 * settled anything, which is a statement, not a missing value to print as
 * "null".
 */
function describeRun(id: string | null): string {
  return id === null
    ? 'no run, because none settled anything'
    : `the run ${id}`;
}

function compare(
  disagreements: string[],
  what: string,
  recorded: number | string | null,
  published: number | string | null,
): void {
  if (recorded !== published) {
    disagreements.push(
      `${what}: the record says ${String(recorded)} and the export says ${String(published)}.`,
    );
  }
}

/**
 * Everything the recorded ledger and the built output disagree about. An empty
 * list is the only result that allows a publish.
 */
export function disagreements(input: VerificationInput): string[] {
  const found: string[] = [];
  const { contents, snapshot, page } = input;

  compare(
    found,
    'The number of checks in the database',
    contents.checks.length,
    input.databaseTotals.checks,
  );
  compare(
    found,
    'The number of runs in the database',
    contents.runs.length,
    input.databaseTotals.runs,
  );
  compare(
    found,
    'The number of observations in the database',
    contents.observations.length,
    input.databaseTotals.observations,
  );

  compare(
    found,
    'The number of checks published',
    contents.checks.length,
    snapshot.checks.length,
  );

  const publishedRuns = snapshot.checks.reduce(
    (total, check) => total + check.runs.length,
    0,
  );
  compare(
    found,
    'The number of runs published',
    contents.runs.length,
    publishedRuns,
  );

  const publishedObservations = snapshot.checks.reduce(
    (total, check) => total + check.observations.length,
    0,
  );
  compare(
    found,
    'The number of observations published',
    contents.observations.length,
    publishedObservations,
  );

  const published = new Map(snapshot.checks.map((check) => [check.id, check]));
  const summaries = new Map(
    input.summaries.map((summary) => [summary.checkId, summary]),
  );

  for (const entry of contents.checks) {
    const check = published.get(entry.record.id);
    if (check === undefined) {
      found.push(`The check ${entry.record.id} is recorded and not published.`);
      continue;
    }

    const runs = contents.runs.filter(
      (run) => run.record.checkId === entry.record.id,
    );
    const caught = runs.filter((run) => run.record.outcome === 'caught');
    const missed = runs.filter((run) => run.record.outcome === 'missed');
    // Counted from the files by the same rule the derivation uses, rather than
    // as "everything that is not caught or missed". A run that settled nothing
    // is kept out of the status rules, so a build that started counting one as
    // a catch would publish a status nothing recorded supports, and this is the
    // comparison that would say so.
    const settledNothing = runs.filter(
      (run) => !outcomeSettlesSomething[run.record.outcome],
    );
    const settled = runs.filter(
      (run) => outcomeSettlesSomething[run.record.outcome],
    );

    const label = `The check ${entry.record.id}`;
    compare(found, `${label}: runs`, runs.length, check.runCount);
    compare(found, `${label}: caught`, caught.length, check.caughtCount);
    compare(found, `${label}: missed`, missed.length, check.missedCount);
    compare(
      found,
      `${label}: settled nothing`,
      settledNothing.length,
      check.inconclusiveCount,
    );
    compare(
      found,
      `${label}: last run`,
      latest(runs.map((run) => run.record.runOn)),
      check.lastRunOn,
    );
    compare(
      found,
      `${label}: last settled`,
      latest(settled.map((run) => run.record.runOn)),
      check.lastSettledOn,
    );
    compare(
      found,
      `${label}: last caught`,
      latest(caught.map((run) => run.record.runOn)),
      check.lastCaughtOn,
    );
    compare(
      found,
      `${label}: runs on the page`,
      runs.length,
      check.runs.length,
    );

    // Which run the status was read from, derivation against export. The
    // status comes from the run the derivation picked, and the table under it
    // is headed by whichever settled run the exporter sorted first. Nothing
    // above can see the two naming different runs: every count and every date
    // still agrees when they do, because two runs tied on the day and the
    // outcome carry the same day and the same outcome. Only their identities
    // differ, so identity is what is compared.
    //
    // A check with no summary at all is refused here too, although the build
    // never reaches this with one: buildSnapshot throws first. This function
    // is the guard over whatever it is handed, and a missing summary would
    // otherwise pass the comparison below by never making it.
    const summary = summaries.get(ledgerCheckUuid(entry.record.id));
    if (summary === undefined) {
      found.push(`${label} has no status derived for it.`);
    } else {
      const headedBy =
        check.runs.find((run) => outcomeSettlesSomething[run.outcome])?.id ??
        null;
      if (headedBy !== summary.latestSettledRunId) {
        found.push(
          `${label}: the status was read from ${describeRun(summary.latestSettledRunId)}, and the first run in the export that settled anything is ${describeRun(headedBy)}.`,
        );
      }
    }

    if (!page.includes(escapeHtml(entry.record.name))) {
      found.push(`${label} is published and its name is not on the page.`);
    }
  }

  for (const check of snapshot.checks) {
    if (!contents.checks.some((entry) => entry.record.id === check.id)) {
      found.push(`The check ${check.id} is published and is not recorded.`);
    }
  }

  const recordedFiles = new Set([
    ...contents.runs.map((entry) => entry.file),
    ...contents.observations.map((entry) => entry.file),
  ]);
  const prefix = `${input.ledgerPath}/`;
  for (const check of snapshot.checks) {
    for (const record of [...check.runs, ...check.observations]) {
      const file = record.sourceFile.startsWith(prefix)
        ? record.sourceFile.slice(prefix.length)
        : record.sourceFile;
      if (!recordedFiles.has(file)) {
        found.push(
          `The export names ${record.sourceFile}, which is not a file in the ledger.`,
        );
      }
    }
  }

  // Where each run came from, file against export.
  //
  // The counts above catch a record that was dropped on the way through. They
  // cannot catch one that arrived saying something other than what it says on
  // disk, and a run published as hand-written when a job recorded it is a
  // wrong answer to the question this whole story exists to answer. The two
  // sides here were produced by different code: the left is what the loader
  // parsed out of the file, the right is what the renderer was handed.
  const recordedRuns = new Map(
    contents.runs.map((entry) => [`${prefix}${entry.file}`, entry.record]),
  );
  for (const check of snapshot.checks) {
    for (const run of check.runs) {
      const record = recordedRuns.get(run.sourceFile);
      if (record === undefined) {
        // Already reported just above, as a file that is not in the ledger.
        continue;
      }
      const where = `The run recorded in ${run.sourceFile}`;
      // What the run said the check did, and why it said nothing when it said
      // nothing. The counts above compare the files with what the database
      // derived from them, so they cannot see a row that reached the export
      // saying something other than what its own file says. A run published as
      // a catch when its file says it settled nothing is exactly that, and it
      // is the failure this outcome exists to stop.
      compare(
        found,
        `${where}: what the check did`,
        record.outcome,
        run.outcome,
      );
      compare(
        found,
        `${where}: why it settled nothing`,
        record.inconclusiveReason,
        run.inconclusiveReason,
      );
      compare(found, `${where}: where it came from`, record.source, run.source);
      compare(
        found,
        `${where}: the commit it ran against`,
        record.sourceCommit,
        run.sourceCommit,
      );
      compare(
        found,
        `${where}: the run that produced it`,
        record.sourceRunUrl,
        run.sourceRunUrl,
      );
    }
  }

  for (const status of STATUSES) {
    compare(
      found,
      `Checks holding the status ${status}`,
      input.statusTotals[status],
      snapshot.statusCounts[status],
    );
  }

  if (!page.includes(snapshot.builtFrom.slice(0, 7))) {
    found.push('The page does not name the commit it was built from.');
  }

  // The published page is a document, not an application. A script tag in it
  // would mean something on the page is worked out in the reader's browser
  // rather than at build time, which is the one property the whole publishing
  // route exists to have.
  if (/<script/i.test(page)) {
    found.push('The page carries a script, so it is not a static record.');
  }

  return found;
}

/** Raised when the build refuses to publish, naming every disagreement. */
export class LedgerDisagreementError extends Error {
  readonly disagreements: readonly string[];

  constructor(found: readonly string[]) {
    super(
      `The recorded ledger and the built output disagree, so nothing was published:\n${found.map((line) => `  ${line}`).join('\n')}`,
    );
    this.name = 'LedgerDisagreementError';
    this.disagreements = found;
  }
}
