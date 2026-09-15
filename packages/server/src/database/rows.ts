import type { Client, QueryResultRow } from 'pg';

/**
 * The shapes a query returns, the SQL that produces them, and the one function
 * that runs it.
 *
 * A row type on its own is a claim about what a query selects, and nothing
 * makes the claim true. So each type here ships with the column list that
 * produces it, aliased to the field names of the type, and the two are asserted
 * against each other by reading a real row back in rows.test.ts. Adding a field
 * without a column, or renaming one on one side only, fails that test rather
 * than reaching the callers as undefined.
 *
 * None of these types carry a status. A status is derived from these rows as of
 * a date; no row stores one.
 */

/**
 * A calendar day, written as YYYY-MM-DD.
 *
 * Days cross this boundary as text rather than as Date. A Date is an instant,
 * and the driver would build one at midnight in whatever zone the process
 * happens to run in, so the day a reader gets back could differ from the day
 * that was stored. The column lists below format the day in SQL so that the
 * text is the same for every reader.
 */
export type IsoDate = string;

/** What a check did with the defect that was planted for it. */
export const testRunOutcomes = ['caught', 'missed'] as const;

/** The outcome column's PostgreSQL enum, as a TypeScript type. */
export type TestRunOutcome = (typeof testRunOutcomes)[number];

/** An automated check: one thing that is supposed to catch something. */
export interface Check {
  readonly id: string;
  readonly name: string;
  /** Where the check runs, in the team's own words. */
  readonly area: string;
  /** What it is there to stop. Empty when nobody has written it down. */
  readonly protects: string;
  /** How a reader can tell it is switched on. Empty when not written down. */
  readonly howToTellArmed: string;
  readonly createdAt: Date;
}

/** One planted defect, and what the check did about it. */
export interface TestRun {
  readonly id: string;
  readonly checkId: string;
  /** The day the defect was planted, which may be before it was recorded. */
  readonly runOn: IsoDate;
  readonly planted: string;
  readonly expected: string;
  readonly outcome: TestRunOutcome;
  readonly note: string | null;
  readonly createdAt: Date;
}

/** Evidence, on one day, about whether a check is switched on at all. */
export interface ArmingObservation {
  readonly id: string;
  readonly checkId: string;
  readonly observedOn: IsoDate;
  readonly armed: boolean;
  readonly note: string | null;
  readonly createdAt: Date;
}

/** A named filter over the list of checks. */
export interface SavedFilter {
  readonly id: string;
  readonly name: string;
  /**
   * The filter tree, as the database stored it. Unknown on purpose: the filter
   * language owns the shape, and a caller has to validate it rather than trust
   * whatever is in the column.
   */
  readonly filter: unknown;
  readonly createdAt: Date;
}

/**
 * Runs a query and returns its rows as the given type.
 *
 * This exists so that the intersection below is written once. The driver wants
 * a row type with a string index signature, and an interface does not have one,
 * so passing Check straight to the driver's generic does not compile. An
 * intersection satisfies it, but it also makes every misspelled field read as
 * any, so it is kept inside this function and never reaches a caller: what
 * comes back is the interface, and a field that is not on it is an error again.
 *
 * Nothing here checks that the rows really have that shape. The column lists
 * above are what make it true, and the read-back tests are what prove it.
 */
export async function selectRows<Row>(
  client: Client,
  sql: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await client.query<Row & QueryResultRow>(sql, [...values]);
  return result.rows;
}

/**
 * Formats a date column as YYYY-MM-DD.
 *
 * to_char rather than a cast to text, because a cast reads DateStyle and would
 * hand back a different string to a session that has changed it.
 */
function isoDate(column: string): string {
  return `to_char(${column}, 'YYYY-MM-DD')`;
}

/** The columns a checks query selects, named as the fields of Check. */
export const checkColumns = [
  'id',
  'name',
  'area',
  'protects',
  'how_to_tell_armed AS "howToTellArmed"',
  'created_at AS "createdAt"',
].join(', ');

/** The columns a test-runs query selects, named as the fields of TestRun. */
export const testRunColumns = [
  'id',
  'check_id AS "checkId"',
  `${isoDate('run_on')} AS "runOn"`,
  'planted',
  'expected',
  'outcome',
  'note',
  'created_at AS "createdAt"',
].join(', ');

/** The columns an arming-observations query selects, as ArmingObservation. */
export const armingObservationColumns = [
  'id',
  'check_id AS "checkId"',
  `${isoDate('observed_on')} AS "observedOn"`,
  'armed',
  'note',
  'created_at AS "createdAt"',
].join(', ');

/** The columns a saved-filters query selects, named as SavedFilter. */
export const savedFilterColumns = [
  'id',
  'name',
  'filter',
  'created_at AS "createdAt"',
].join(', ');
