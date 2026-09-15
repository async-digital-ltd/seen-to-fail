import { STATUSES } from '@seen-to-fail/filter';
import type { Status } from '@seen-to-fail/filter';

import { STALE_AFTER_DAYS } from '../staleness.ts';
import {
  armingObservationColumns,
  checkColumnsFrom,
  selectRows,
  testRunColumns,
} from './rows.ts';
import type {
  ArmingObservation,
  Check,
  IsoDate,
  Queryable,
  TestRun,
} from './rows.ts';
import { checkSummariesFrom, derivedSummaryColumnsFrom } from './summaries.ts';
import type { CheckSummary } from './summaries.ts';

/**
 * The reads the API is built out of, and the only place the number of queries a
 * request makes is decided.
 *
 * Two rules shape everything here. A check and its derived status come back
 * together, in one statement, because they are one thing to a reader and
 * fetching them separately would mean a list of eight checks asking twice.
 * And anything belonging to many checks is fetched for all of them at once,
 * keyed by check id, because the alternative is a query per row: the shape that
 * looks fine against a seeded workspace of eight and falls over against a real
 * one. The loader in front of these is what turns a field asked for on every
 * row of a list into one call of the functions below.
 *
 * Nothing here works a status out. The derivation is a function in the
 * migrations, and these queries join onto it.
 */

/**
 * A check and its status, read as of a day.
 *
 * The two halves are written as an intersection rather than as a fresh list of
 * fields, so a column added to either side arrives here without being retyped.
 * The summary's own check id is dropped because the check's id is the same
 * value and this row already has it.
 */
export type CheckRecord = Check & Omit<CheckSummary, 'checkId'>;

/** The checks table joined onto the derivation, as one FROM clause. */
function checksWithSummaries(
  asOfParameter: string,
  staleAfterDaysParameter: string,
): string {
  return (
    `FROM checks JOIN ${checkSummariesFrom(asOfParameter, staleAfterDaysParameter)} ` +
    `ON summaries.check_id = checks.id`
  );
}

/** The columns a check-with-status query selects, named as CheckRecord. */
const checkRecordColumns = `${checkColumnsFrom('checks')}, ${derivedSummaryColumnsFrom('summaries')}`;

/**
 * Whether a string could be an id this database issued.
 *
 * The id columns are uuid, and PostgreSQL raises on text that is not one rather
 * than returning no rows, so a caller asking for a check by a mistyped id would
 * otherwise get a database error where it asked a reasonable question. Checked
 * here so that the answer to "is there a check under this id" is no, which is
 * both true and the thing the caller can act on.
 */
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every check with its status, ordered by name.
 *
 * Ordered here rather than by the caller, because the order a list is read in
 * is part of what the list is and two callers ordering it differently would be
 * two different lists. By name because a name is the only field a reader of the
 * list can predict; ordering by status would move a row the moment somebody
 * logged a run against it.
 */
export async function listChecks(
  database: Queryable,
  asOf: IsoDate,
  staleAfterDays: number = STALE_AFTER_DAYS,
): Promise<CheckRecord[]> {
  return selectRows<CheckRecord>(
    database,
    `SELECT ${checkRecordColumns} ${checksWithSummaries('$1', '$2')} ORDER BY checks.name`,
    [asOf, staleAfterDays],
  );
}

/**
 * One check with its status, or null when nothing is recorded under that id.
 *
 * Null rather than an error, for both a well formed id nobody has used and a
 * string that is not an id at all. The two are the same answer to the reader
 * standing in front of a page that is not there.
 */
export async function findCheck(
  database: Queryable,
  id: string,
  asOf: IsoDate,
  staleAfterDays: number = STALE_AFTER_DAYS,
): Promise<CheckRecord | null> {
  if (!uuidPattern.test(id)) {
    return null;
  }

  const rows = await selectRows<CheckRecord>(
    database,
    `SELECT ${checkRecordColumns} ${checksWithSummaries('$1', '$2')} WHERE checks.id = $3`,
    [asOf, staleAfterDays, id],
  );
  return rows[0] ?? null;
}

/**
 * Every run recorded against any of the given checks, newest first.
 *
 * One statement for the whole set, which is what stops a list of checks asking
 * once per row. The caller gets them back in one array and groups them, rather
 * than this function returning a map, because grouping is the loader's job and
 * a second function here that also grouped would be a second place the shape
 * could be got wrong.
 *
 * Newest first is by the day it happened, then by the order it was written
 * down, then by id. Two runs can share a day, and without the last two keys the
 * planner is free to return them in either order, so the same rows could read
 * differently from one call to the next. The derivation picks its latest run
 * the same way, so the first row here for a check is the run its status was
 * worked out from.
 */
export async function listRunsForChecks(
  database: Queryable,
  checkIds: readonly string[],
): Promise<TestRun[]> {
  if (checkIds.length === 0) {
    return [];
  }

  return selectRows<TestRun>(
    database,
    `SELECT ${testRunColumns} FROM test_runs
      WHERE check_id = ANY($1)
      ORDER BY run_on DESC, created_at DESC, id DESC`,
    [[...checkIds]],
  );
}

/**
 * Every arming observation recorded about any of the given checks, newest
 * first, under the same batching and ordering rules as the runs above.
 */
export async function listArmingObservationsForChecks(
  database: Queryable,
  checkIds: readonly string[],
): Promise<ArmingObservation[]> {
  if (checkIds.length === 0) {
    return [];
  }

  return selectRows<ArmingObservation>(
    database,
    `SELECT ${armingObservationColumns} FROM arming_observations
      WHERE check_id = ANY($1)
      ORDER BY observed_on DESC, created_at DESC, id DESC`,
    [[...checkIds]],
  );
}

/**
 * How many checks hold each status, as of a day.
 *
 * Every status is present whether or not any check holds it, so a caller can
 * show five tiles without deciding what an absent one means. The keys are the
 * filter language's statuses, so a status this cannot count is one the rest of
 * the product cannot express either.
 */
export type StatusTotals = Record<Status, number>;

/** Every status at zero, which is what an empty workspace counts to. */
function noChecks(): StatusTotals {
  const totals = {} as Record<Status, number>;
  for (const status of STATUSES) {
    totals[status] = 0;
  }
  return totals;
}

/**
 * The counts, in one grouped query rather than five counting queries or one
 * query per status.
 *
 * It counts rather than reading the list and tallying it, because the tiles are
 * shown beside a list that may later be filtered and the totals are about the
 * workspace either way.
 */
export async function countChecksByStatus(
  database: Queryable,
  asOf: IsoDate,
  staleAfterDays: number = STALE_AFTER_DAYS,
): Promise<StatusTotals> {
  const rows = await selectRows<{ status: Status; total: string }>(
    database,
    `SELECT summaries.status, count(*) AS total
       FROM ${checkSummariesFrom('$1', '$2')}
      GROUP BY summaries.status`,
    [asOf, staleAfterDays],
  );

  const totals = noChecks();
  for (const row of rows) {
    // count() is bigint, and the driver hands a bigint back as text rather than
    // risk a number that cannot hold it. A workspace with more checks than a
    // double can count is not a thing, so this is safe, and parsing it here is
    // what keeps the rest of the code working in numbers.
    totals[row.status] = Number(row.total);
  }
  return totals;
}
