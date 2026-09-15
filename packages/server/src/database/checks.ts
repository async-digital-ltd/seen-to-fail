import { compileFilter, STATUSES } from '@seen-to-fail/filter';
import type { CompileOptions, Filter, Status } from '@seen-to-fail/filter';

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

/**
 * The names the checks table and the derivation go by in a check-with-status
 * query.
 *
 * They are the names the filter compiler writes its predicate against, where
 * `c` is a row of checks and `s` the summary derived for it. The compiler
 * cannot import them from here, because it must not depend on the server, so
 * they are agreed rather than shared. What holds the agreement is the filtered
 * list's tests: a filter on a status reads `s` and a filter on an area reads
 * `c`, and a query using any other name fails in PostgreSQL rather than
 * answering a different question.
 */
const checkName = 'c';
const summaryName = 's';

/** The checks table joined onto the derivation, as one FROM clause. */
function checksWithSummaries(
  asOfParameter: string,
  staleAfterDaysParameter: string,
): string {
  return (
    `FROM checks AS ${checkName} ` +
    `JOIN ${checkSummariesFrom(asOfParameter, staleAfterDaysParameter, summaryName)} ` +
    `ON ${summaryName}.check_id = ${checkName}.id`
  );
}

/** The columns a check-with-status query selects, named as CheckRecord. */
const checkRecordColumns = `${checkColumnsFrom(checkName)}, ${derivedSummaryColumnsFrom(summaryName)}`;

/**
 * Where a compiled filter's placeholders sit in the queries below: `$1` is the
 * as-of day and `$2` the staleness threshold, so the filter's own values start
 * at `$3` and its dated conditions count back from `$1`.
 */
const afterAsOfAndThreshold: CompileOptions = { firstParam: 3, asOfParam: 1 };

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

/** The checks a filter selects, and how many checks there are in all. */
export interface CheckListing {
  /** The checks the filter selects, ordered by name. */
  readonly checks: CheckRecord[];
  /** Every check in the workspace, whether the filter selects it or not. */
  readonly total: number;
}

/**
 * A row of the listing query: a matched check with the workspace total beside
 * it, or the one row that carries the total alone when nothing matched.
 */
type ListingRow =
  | (CheckRecord & { readonly total: string })
  | { readonly id: null; readonly total: string };

/**
 * The checks a filter selects, with their statuses, ordered by name, and how
 * many checks there are in all.
 *
 * Ordered here rather than by the caller, because the order a list is read in
 * is part of what the list is and two callers ordering it differently would be
 * two different lists. By name because a name is the only field a reader of the
 * list can predict; ordering by status would move a row the moment somebody
 * logged a run against it.
 *
 * It takes a `Filter` and never raw input, so the only way to reach this query
 * is through `parseFilter`. The compiled predicate goes into the text and its
 * values go into the parameters, after the as-of day and the threshold.
 *
 * The list and the total are one statement, so the number of checks a filter
 * hides is worked out from a single reading of the workspace and cannot be
 * thrown off by a check written between two. The total is counted on its own
 * and the matched checks are joined onto it with a left join, which is what
 * keeps the total when the filter matches nothing: there is then one row, with
 * the total and nothing else, rather than no rows and no total.
 */
export async function listChecks(
  database: Queryable,
  filter: Filter,
  asOf: IsoDate,
  staleAfterDays: number = STALE_AFTER_DAYS,
): Promise<CheckListing> {
  const compiled = compileFilter(filter, afterAsOfAndThreshold);

  const rows = await selectRows<ListingRow>(
    database,
    `SELECT workspace.total, matched.*
       FROM (SELECT count(*) AS total FROM checks) AS workspace
       LEFT JOIN (
         SELECT ${checkRecordColumns} ${checksWithSummaries('$1', '$2')}
          WHERE ${compiled.where}
       ) AS matched ON TRUE
      ORDER BY matched.name`,
    [asOf, staleAfterDays, ...compiled.values],
  );

  const checks: CheckRecord[] = [];
  for (const row of rows) {
    if (row.id !== null) {
      checks.push(row);
    }
  }

  return {
    checks,
    // count() is bigint, which the driver hands back as text; see the note on
    // countChecksByStatus below. Every row carries the same total, and there is
    // always at least one row.
    total: Number(rows[0]?.total ?? 0),
  };
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
    `SELECT ${checkRecordColumns} ${checksWithSummaries('$1', '$2')} WHERE ${checkName}.id = $3`,
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
