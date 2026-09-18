import type { Status } from '@seen-to-fail/filter';

import type { IsoDate, TestRunOutcome } from '../database/rows.ts';
import type { CheckSummary } from '../database/summaries.ts';
import { ledgerCheckUuid, ledgerFileUuid } from './identity.ts';
import type { LedgerContents, LedgerEntry } from './load.ts';

/**
 * What the published page reads: the whole ledger, with a status against every
 * check, as one JSON document.
 *
 * It is written beside the page rather than only inside it, so that the record
 * can be read by something other than a browser without anybody having to parse
 * HTML for it. The page is rendered from this object and nothing else, which is
 * what makes "the page and the export agree" checkable rather than hoped for.
 *
 * No status is worked out here. Every status and every count comes from the
 * summaries the database derived with the SQL in the migrations, and this file
 * copies them across. A second derivation, however small, would be a second
 * answer that could disagree with the first, and the whole point of the record
 * is that there is one.
 */

/** One planted defect, as the page shows it. */
export interface PublishedRun {
  readonly id: string;
  readonly runOn: IsoDate;
  readonly planted: string;
  readonly expected: string;
  readonly outcome: TestRunOutcome;
  readonly note: string | null;
  /** The file it was recorded in, relative to the repository root. */
  readonly sourceFile: string;
  /** The commit that added that file, or null when it is not committed yet. */
  readonly recordedIn: string | null;
}

/** One dated observation about whether a check is switched on. */
export interface PublishedObservation {
  readonly id: string;
  readonly observedOn: IsoDate;
  readonly armed: boolean;
  readonly note: string | null;
  readonly sourceFile: string;
  readonly recordedIn: string | null;
}

/** A check, its status, and everything recorded against it. */
export interface PublishedCheck {
  /** The ledger's own id for the check, which is what a job quotes. */
  readonly id: string;
  readonly name: string;
  readonly area: string;
  readonly protects: string;
  readonly howToTellArmed: string;
  readonly status: Status;
  readonly runCount: number;
  readonly caughtCount: number;
  readonly missedCount: number;
  readonly lastCaughtOn: IsoDate | null;
  readonly lastRunOn: IsoDate | null;
  readonly lastSeenArmedOn: IsoDate | null;
  readonly lastArmed: boolean | null;
  /** Newest first. */
  readonly runs: readonly PublishedRun[];
  /** Newest first. */
  readonly observations: readonly PublishedObservation[];
}

/** The published ledger, as the page and the export both hold it. */
export interface PublishedLedger {
  /** The commit the build ran against. */
  readonly builtFrom: string;
  /** The day the statuses were read as of. */
  readonly builtOn: IsoDate;
  /** The threshold those statuses were read against. */
  readonly staleAfterDays: number;
  /** The owner and repository, which is what the commit links are built from. */
  readonly repository: string;
  /** Ordered by name, as the app orders its list. */
  readonly checks: readonly PublishedCheck[];
  /** How many checks hold each status, tallied from the checks above. */
  readonly statusCounts: Readonly<Record<Status, number>>;
}

export interface SnapshotInput {
  readonly contents: LedgerContents;
  /** What the database derived, one row per check, keyed by its uuid. */
  readonly summaries: readonly CheckSummary[];
  /** Where the ledger sits in the repository, such as `ledger`. */
  readonly ledgerPath: string;
  readonly repository: string;
  readonly builtFrom: string;
  readonly builtOn: IsoDate;
  readonly staleAfterDays: number;
  /** The commit that added each file, keyed by its path in the repository. */
  readonly recordingCommits: ReadonlyMap<string, string>;
}

/** Where a record's file sits in the repository. */
function sourceFileOf(ledgerPath: string, entry: LedgerEntry<unknown>): string {
  return `${ledgerPath}/${entry.file}`;
}

/**
 * Newest first, by the day it happened and then by the file it is recorded in.
 *
 * The second key is what makes the order the same on every build. Two runs can
 * share a day, and sorting by the day alone leaves the order to whatever the
 * directory listing happened to give, so the same records could publish in two
 * different orders and a reader comparing two builds would see a change that is
 * not one.
 */
function byNewest<Record extends { readonly file: string }>(
  dayOf: (record: Record) => IsoDate,
) {
  return (left: Record, right: Record): number => {
    const days = dayOf(right).localeCompare(dayOf(left));
    return days === 0 ? right.file.localeCompare(left.file) : days;
  };
}

/**
 * The published ledger, built from the records on disk and the statuses the
 * database derived from them.
 *
 * A check the database has no summary for stops the build. It means the loading
 * step and the deriving step disagree about which checks exist, and there is no
 * status to publish for it; guessing one, or leaving the check out, would
 * publish a record that is not the record.
 */
export function buildSnapshot(input: SnapshotInput): PublishedLedger {
  const summariesByUuid = new Map(
    input.summaries.map((summary) => [summary.checkId, summary]),
  );

  const runsByCheck = new Map<string, PublishedRun[]>();
  for (const entry of [...input.contents.runs].sort(
    byNewest((entry) => entry.record.runOn),
  )) {
    const sourceFile = sourceFileOf(input.ledgerPath, entry);
    const runs = runsByCheck.get(entry.record.checkId) ?? [];
    runs.push({
      id: ledgerFileUuid(sourceFile),
      runOn: entry.record.runOn,
      planted: entry.record.planted,
      expected: entry.record.expected,
      outcome: entry.record.outcome,
      note: entry.record.note,
      sourceFile,
      recordedIn: input.recordingCommits.get(sourceFile) ?? null,
    });
    runsByCheck.set(entry.record.checkId, runs);
  }

  const observationsByCheck = new Map<string, PublishedObservation[]>();
  for (const entry of [...input.contents.observations].sort(
    byNewest((entry) => entry.record.observedOn),
  )) {
    const sourceFile = sourceFileOf(input.ledgerPath, entry);
    const observations = observationsByCheck.get(entry.record.checkId) ?? [];
    observations.push({
      id: ledgerFileUuid(sourceFile),
      observedOn: entry.record.observedOn,
      armed: entry.record.armed,
      note: entry.record.note,
      sourceFile,
      recordedIn: input.recordingCommits.get(sourceFile) ?? null,
    });
    observationsByCheck.set(entry.record.checkId, observations);
  }

  const checks: PublishedCheck[] = [];
  for (const entry of [...input.contents.checks].sort((left, right) =>
    left.record.name.localeCompare(right.record.name),
  )) {
    const summary = summariesByUuid.get(ledgerCheckUuid(entry.record.id));
    if (summary === undefined) {
      throw new Error(
        `The database derived no status for the check ${entry.record.id}.`,
      );
    }
    checks.push({
      id: entry.record.id,
      name: entry.record.name,
      area: entry.record.area,
      protects: entry.record.protects,
      howToTellArmed: entry.record.howToTellArmed,
      status: summary.status,
      runCount: summary.runCount,
      caughtCount: summary.caughtCount,
      missedCount: summary.missedCount,
      lastCaughtOn: summary.lastCaughtOn,
      lastRunOn: summary.lastRunOn,
      lastSeenArmedOn: summary.lastSeenArmedOn,
      lastArmed: summary.lastArmed,
      runs: runsByCheck.get(entry.record.id) ?? [],
      observations: observationsByCheck.get(entry.record.id) ?? [],
    });
  }

  return {
    builtFrom: input.builtFrom,
    builtOn: input.builtOn,
    staleAfterDays: input.staleAfterDays,
    repository: input.repository,
    checks,
    statusCounts: tallyStatuses(checks),
  };
}

/**
 * How many checks hold each status, counted from the checks being published.
 *
 * Counted here rather than asked of the database a second time, so that the
 * tiles on the page are a count of the rows beneath them and cannot say five
 * where four are shown. The database is asked separately, and the two answers
 * are compared before anything is written: see verify.ts.
 */
function tallyStatuses(
  checks: readonly PublishedCheck[],
): Record<Status, number> {
  const counts: Record<Status, number> = {
    Unarmed: 0,
    Broken: 0,
    Proven: 0,
    Stale: 0,
    Unproven: 0,
  };
  for (const check of checks) {
    counts[check.status] += 1;
  }
  return counts;
}
