import type { Status } from '@seen-to-fail/filter';
import type { Client } from 'pg';

import { STALE_AFTER_DAYS } from '../staleness.ts';
import { isoDate, selectRows } from './rows.ts';
import type { IsoDate } from './rows.ts';

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
  readonly runCount: number;
  readonly caughtCount: number;
  readonly missedCount: number;
  /** The last day an observation said it was on, or null if none has. */
  readonly lastSeenArmedOn: IsoDate | null;
  /**
   * What the latest observation said, or null when there has never been one.
   * Null is "nobody has looked" and false is "somebody looked and it was off",
   * which are different things to show a reader.
   */
  readonly lastArmed: boolean | null;
}

/** The columns a summary query selects, named as the fields of CheckSummary. */
export const checkSummaryColumns = [
  'check_id AS "checkId"',
  'status',
  `${isoDate('last_caught_on')} AS "lastCaughtOn"`,
  `${isoDate('last_run_on')} AS "lastRunOn"`,
  'run_count AS "runCount"',
  'caught_count AS "caughtCount"',
  'missed_count AS "missedCount"',
  `${isoDate('last_seen_armed_on')} AS "lastSeenArmedOn"`,
  'last_armed AS "lastArmed"',
].join(', ');

/**
 * Every check, with its status as of a day.
 *
 * The day is passed in rather than taken from the clock, because a status is a
 * reading as of a day and a caller that could not say which day would be
 * reading a moving target. The threshold defaults to the one the application
 * runs on, so a caller states it only to ask a different question, which is
 * what the tests at the Proven and Stale boundary do.
 *
 * The rows come back in no particular order. A summary carries an id and no
 * name, so there is nothing here worth ordering by; the query that joins these
 * onto the checks themselves is where an order belongs.
 */
export async function listCheckSummaries(
  client: Client,
  asOf: IsoDate,
  staleAfterDays: number = STALE_AFTER_DAYS,
): Promise<CheckSummary[]> {
  return selectRows<CheckSummary>(
    client,
    `SELECT ${checkSummaryColumns} FROM check_summaries($1, $2)`,
    [asOf, staleAfterDays],
  );
}
