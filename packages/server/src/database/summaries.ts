import type { Status } from '@seen-to-fail/filter';

import { STALE_AFTER_DAYS } from '../staleness.ts';
import { isoDate, selectRows } from './rows.ts';
import type { IsoDate, Queryable } from './rows.ts';

/**
 * The one route from the record to a status.
 *
 * Nothing here works a status out. The whole derivation is the check_summaries
 * function in the migrations, and this file is the typed way to call it, so
 * there is one answer rather than one per caller. Anything that needs a status,
 * a count or a last-caught date reads it from here.
 */

/** One check, read as of a day. */
export interface CheckSummary {
  readonly checkId: string;
  /**
   * The derived status. The type comes from the filter language, so a status
   * the filter cannot express is one the server cannot return.
   */
  readonly status: Status;
  /** The last day a run caught, or null when none ever has. */
  readonly lastCaughtOn: IsoDate | null;
  /** The day of the latest run, or null when there are none. */
  readonly lastRunOn: IsoDate | null;
  /**
   * The day of the latest run that settled anything, or null when none has.
   *
   * The day the status was read from. On a check whose recent runs have all
   * settled nothing it is the figure a reader needs beside the status: the
   * status is as old as this, whatever has been attempted since.
   */
  readonly lastSettledOn: IsoDate | null;
  /**
   * The run the status was read from, or null when no run has settled
   * anything. The build holds it against the first settled run in the
   * published table, which is worked out by different code.
   */
  readonly latestSettledRunId: string | null;
  readonly runCount: number;
  readonly caughtCount: number;
  readonly missedCount: number;
  /**
   * How many runs settled nothing. With the two above it adds up to runCount,
   * so a reader can see that none of them has been quietly absorbed into
   * another.
   */
  readonly inconclusiveCount: number;
  /** The last day an observation said it was on, or null if none has. */
  readonly lastSeenArmedOn: IsoDate | null;
  /**
   * What the latest observation said, or null when there has never been one.
   * Null is "nobody has looked" and false is "somebody looked and it was off",
   * which are different things to show a reader.
   */
  readonly lastArmed: boolean | null;
  /**
   * The observation lastArmed was read from, or null when there has never
   * been one. The build holds it against the first observation in the
   * published list, which is worked out by different code.
   */
  readonly latestObservationId: string | null;
}

/**
 * Everything the derivation works out, without the id of the check it worked it
 * out for, qualified with the name the derivation was given in the query.
 *
 * Qualified for the same reason the checks list is: a query that joins these
 * onto the checks themselves has two sources of column names, and an
 * unqualified list would silently start reading the wrong one the day a column
 * is added on either side.
 *
 * Split out from the list below so that a joined query can leave the id behind.
 * It already has the check's own id, and selecting the same value twice under
 * two names is a row that carries its own contradiction the moment one of them
 * is joined wrongly.
 */
export function derivedSummaryColumnsFrom(source: string): string {
  return [
    `${source}.status`,
    `${isoDate(`${source}.last_caught_on`)} AS "lastCaughtOn"`,
    `${isoDate(`${source}.last_run_on`)} AS "lastRunOn"`,
    `${isoDate(`${source}.last_settled_on`)} AS "lastSettledOn"`,
    `${source}.latest_settled_run_id AS "latestSettledRunId"`,
    `${source}.run_count AS "runCount"`,
    `${source}.caught_count AS "caughtCount"`,
    `${source}.missed_count AS "missedCount"`,
    `${source}.inconclusive_count AS "inconclusiveCount"`,
    `${isoDate(`${source}.last_seen_armed_on`)} AS "lastSeenArmedOn"`,
    `${source}.last_armed AS "lastArmed"`,
    `${source}.latest_observation_id AS "latestObservationId"`,
  ].join(', ');
}

/** The columns a summary query selects, named as the fields of CheckSummary. */
export function checkSummaryColumnsFrom(source: string): string {
  return `${source}.check_id AS "checkId", ${derivedSummaryColumnsFrom(source)}`;
}

/** The name the derivation is given wherever it is selected from. */
export const summarySource = 'summaries';

/** The columns a summary query selects, named as the fields of CheckSummary. */
export const checkSummaryColumns = checkSummaryColumnsFrom(summarySource);

/**
 * The derivation, as a FROM item, with its two parameters left to the caller.
 *
 * The name it goes by defaults to the one the column lists above assume. A
 * query that names it something else, as the filtered list does to match the
 * name the filter compiler writes against, says so here.
 */
export function checkSummariesFrom(
  asOfParameter: string,
  staleAfterDaysParameter: string,
  name: string = summarySource,
): string {
  return `check_summaries(${asOfParameter}, ${staleAfterDaysParameter}) AS ${name}`;
}

/**
 * Every check, with its status as of a day.
 *
 * The day is passed in rather than taken from the clock, because a status is a
 * reading as of a day and a caller that could not say which day would be
 * reading a moving target. The threshold defaults to the one the application
 * runs on, so a caller states it only to ask a different question, which is
 * what the tests at the Proven and Stale boundary do.
 *
 * The day drives the staleness arithmetic and nothing else. It is not a cutoff:
 * a run or an observation dated after it still counts, and still decides which
 * row is the latest. Reading the workspace as of last Tuesday therefore answers
 * "how old would this catch have been then", not "what did the record look like
 * then", and a row written since is neither hidden nor filtered out. Ruled that
 * way because the record is what somebody has got round to writing down rather
 * than a log of events as they happened, so a run entered late is evidence about
 * the day it was planted and not about the day it was typed.
 *
 * The rows come back in no particular order. A summary carries an id and no
 * name, so there is nothing here worth ordering by; the query that joins these
 * onto the checks themselves is where an order belongs.
 */
export async function listCheckSummaries(
  database: Queryable,
  asOf: IsoDate,
  staleAfterDays: number = STALE_AFTER_DAYS,
): Promise<CheckSummary[]> {
  return selectRows<CheckSummary>(
    database,
    `SELECT ${checkSummaryColumns} FROM ${checkSummariesFrom('$1', '$2')}`,
    [asOf, staleAfterDays],
  );
}
