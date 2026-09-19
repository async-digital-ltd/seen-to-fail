import type { QueryResult, QueryResultRow } from 'pg';

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
 * Anything that can run one parameterised statement and hand back its rows.
 *
 * Narrower than the driver's Client on purpose. A single statement does not
 * care whether it travels down a connection of its own or one borrowed from a
 * pool, and the two callers differ on exactly that point: the running server
 * holds a pool so that concurrent requests do not queue behind each other,
 * while a test holds one connection it can empty the tables through. Both
 * satisfy this, so the functions below take it and neither caller has to
 * pretend to be the other.
 *
 * Anything that needs several statements to land together still takes a Client,
 * because a transaction belongs to one connection and a pool is free to hand
 * the next statement to a different one. Seeding is the example: it takes a
 * Client, and that is the type saying so rather than a comment asking nicely.
 */
export interface Queryable {
  query<Row extends QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<QueryResult<Row>>;
}

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

/**
 * What a check did with the defect that was planted for it.
 *
 * In the order the database's own enum lists them, because a test reads the
 * labels back and compares the two lists. An outcome added on one side only is
 * then a failing test rather than a value that arrives somewhere nothing has a
 * branch for.
 */
export const testRunOutcomes = ['caught', 'missed', 'inconclusive'] as const;

/** The outcome column's PostgreSQL enum, as a TypeScript type. */
export type TestRunOutcome = (typeof testRunOutcomes)[number];

/**
 * Whether an outcome settles anything about the check, which is the same
 * question as whether the status rules read it.
 *
 * A run that settled nothing is not evidence about the check: the plant no
 * longer applied, or the check was already red, or it never ran. Counting one
 * as a miss would take a working check to Broken on evidence that says nothing
 * about it, so the derivation skips those rows entirely.
 *
 * A map rather than a second list, so that adding an outcome above and not
 * classifying it here is a type error. The answer cannot be guessed from the
 * label, so somebody has to give it.
 */
export const outcomeSettlesSomething = {
  caught: true,
  missed: true,
  inconclusive: false,
} as const satisfies Record<TestRunOutcome, boolean>;

/**
 * Which of two runs on one day is read as the later one.
 *
 * A run is dated to a day and nothing finer, so two runs on one day have no
 * recorded order at all. Something still has to decide which of them a status
 * is read from, and until this map existed that something was a comparison of
 * two uuids: the ledger build writes every record in one transaction, so every
 * row it loads shares a created_at to the microsecond, and the ordering fell
 * through to ids derived from the records' filenames. A check that missed one
 * plant and caught another on the same day published Proven or Broken
 * according to a digest.
 *
 * So the order is by what the run says instead. A miss outranks a catch: a
 * check seen to let a planted defect through that day is broken whether or not
 * something else it was asked about that day went well, and a rule that could
 * hide the miss behind the catch would be this product failing at its own
 * subject. A run that settled nothing outranks neither, because it is not
 * evidence about the check at all; it sorts last so that the first run in a
 * check's log is the run the status was read from.
 *
 * Lower sorts earlier, which is newest-first order. A map rather than a list,
 * so that adding an outcome above and not ranking it here is a type error: the
 * rank cannot be guessed from the label, so somebody has to give it. The SQL in
 * the migrations spells the same order out for its own ORDER BY clauses, and a
 * test reads the order back out of the database and compares it with this map,
 * so the two cannot drift apart unnoticed.
 */
export const outcomePrecedence = {
  missed: 0,
  caught: 1,
  inconclusive: 2,
} as const satisfies Record<TestRunOutcome, number>;

/** The outcomes the status rules read. */
export const settledOutcomes: readonly TestRunOutcome[] =
  testRunOutcomes.filter((outcome) => outcomeSettlesSomething[outcome]);

/** The outcomes that settle nothing, and are kept out of the status rules. */
export const unsettledOutcomes: readonly TestRunOutcome[] =
  testRunOutcomes.filter((outcome) => !outcomeSettlesSomething[outcome]);

/**
 * Where a run came from: a person typed it in, or a replay posted it.
 *
 * A value the run carries rather than something worked out from which of its
 * other fields happen to be filled in. A replay that lost its commit is then a
 * row the database refuses by name, where an inferred source would have quietly
 * read it back as somebody's typing.
 */
export const testRunSources = ['hand', 'replay'] as const;

/** The source column's PostgreSQL enum, as a TypeScript type. */
export type TestRunSource = (typeof testRunSources)[number];

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
  /**
   * Why the run settled nothing, or null when it settled something.
   *
   * The words whoever recorded it wrote, copied and not interpreted. Nothing
   * in this project sorts them into categories: a replay's scoring tool
   * separates its own reasons only inside an English sentence, and a category
   * recovered by matching prose is a guess that would tell a reader to rewrite
   * a plant that is fine.
   */
  readonly inconclusiveReason: string | null;
  readonly note: string | null;
  /** Whether a person typed this run in or a replay posted it. */
  readonly source: TestRunSource;
  /**
   * The commit the plant was replayed against, or null for a run typed in.
   *
   * Not the commit that recorded the run. That one is read back out of the
   * history by the build, because it does not exist until the record has been
   * committed.
   */
  readonly sourceCommit: string | null;
  /** The run that produced it, or null for a run typed in. */
  readonly sourceRunUrl: string | null;
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
  database: Queryable,
  sql: string,
  values: readonly unknown[] = [],
): Promise<Row[]> {
  const result = await database.query<Row & QueryResultRow>(sql, [...values]);
  return result.rows;
}

/**
 * Formats a date column as YYYY-MM-DD.
 *
 * to_char rather than a cast to text, because a cast reads DateStyle and would
 * hand back a different string to a session that has changed it.
 *
 * Exported so that every column list returning a day formats it the same way,
 * including the ones in other files. A null column stays null: to_char of
 * nothing is nothing, rather than an empty string.
 */
export function isoDate(column: string): string {
  return `to_char(${column}, 'YYYY-MM-DD')`;
}

/**
 * The columns a checks query selects, named as the fields of Check and
 * qualified with the table they come from.
 *
 * Qualified because a query that joins the checks table to anything else has
 * two sources of column names, and an unqualified list would be read against
 * whichever of them happened to have the name. That is a query that works until
 * the other side gains a column, which is the kind of breakage nobody sees
 * coming. Taking the table as an argument is what lets one list serve both the
 * plain read and the joined one, so there is no second copy to keep in step.
 */
export function checkColumnsFrom(table: string): string {
  return [
    `${table}.id`,
    `${table}.name`,
    `${table}.area`,
    `${table}.protects`,
    `${table}.how_to_tell_armed AS "howToTellArmed"`,
    `${table}.created_at AS "createdAt"`,
  ].join(', ');
}

/** The columns a checks query selects, read straight from the checks table. */
export const checkColumns = checkColumnsFrom('checks');

/** The columns a test-runs query selects, named as the fields of TestRun. */
export const testRunColumns = [
  'id',
  'check_id AS "checkId"',
  `${isoDate('run_on')} AS "runOn"`,
  'planted',
  'expected',
  'outcome',
  'inconclusive_reason AS "inconclusiveReason"',
  'note',
  'source',
  'source_commit AS "sourceCommit"',
  'source_run_url AS "sourceRunUrl"',
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
