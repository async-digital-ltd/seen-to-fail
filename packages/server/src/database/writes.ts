import { DatabaseError } from 'pg';

import { nameTaken, noSuchCheck } from './new-records.ts';
import type {
  NewArmingObservation,
  NewCheck,
  NewTestRun,
  RecordIssue,
} from './new-records.ts';
import {
  armingObservationColumns,
  selectRows,
  testRunColumns,
} from './rows.ts';
import type { ArmingObservation, Queryable, TestRun } from './rows.ts';

/**
 * The three ways the record grows, and the only inserts outside the seed.
 *
 * Each takes a value that has already been through its parse function in
 * new-records.ts, and the branded types are what hold every caller to that.
 * What is left for this file is the two rules only the database can apply:
 * whether a name is in use, and whether a check exists under an id. Neither is
 * looked up first. The constraints already refuse both, inside the insert
 * itself, so there is no moment between a lookup and a write for another
 * request to change the answer in, and a refusal is turned into the issue a
 * form shows rather than into an error.
 *
 * A refusal is recognised by the name of the constraint that raised it. That
 * is why every constraint in the migrations is named: any other failure, from a
 * lost connection to a constraint nobody expected to fire, is not something a
 * person can fix by editing a field, so it is thrown on as it arrived.
 */

/** The row that was written, or the issue that stopped it being written. */
export type WriteResult<Row> =
  | { readonly ok: true; readonly row: Row }
  | { readonly ok: false; readonly errors: readonly RecordIssue[] };

/** The constraints a write expects to be refused by, and what each one means. */
type Refusals = ReadonlyMap<string, RecordIssue>;

/** One insert that returns its row, with the refusals it knows how to explain. */
async function insertReturning<Row>(
  database: Queryable,
  sql: string,
  values: readonly unknown[],
  refusals: Refusals,
): Promise<WriteResult<Row>> {
  let rows: Row[];
  try {
    rows = await selectRows<Row>(database, sql, values);
  } catch (cause) {
    const issue =
      cause instanceof DatabaseError && cause.constraint !== undefined
        ? refusals.get(cause.constraint)
        : undefined;
    if (issue === undefined) {
      throw cause;
    }
    return { ok: false, errors: [issue] };
  }

  const [row] = rows;
  if (row === undefined) {
    throw new Error('An insert with a RETURNING clause returned no row.');
  }
  return { ok: true, row };
}

/** Adds a check, answering with its id, or refusing a name already in use. */
export async function insertCheck(
  database: Queryable,
  check: NewCheck,
): Promise<WriteResult<{ readonly id: string }>> {
  return insertReturning(
    database,
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [check.name, check.area, check.protects, check.howToTellArmed],
    new Map([['checks_name_unique', nameTaken]]),
  );
}

/** Logs a run, answering with it, or refusing a check that does not exist. */
export async function insertTestRun(
  database: Queryable,
  run: NewTestRun,
): Promise<WriteResult<TestRun>> {
  return insertReturning(
    database,
    `INSERT INTO test_runs (check_id, run_on, planted, expected, outcome, note)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${testRunColumns}`,
    [run.checkId, run.runOn, run.planted, run.expected, run.outcome, run.note],
    new Map([['test_runs_check_id_fkey', noSuchCheck]]),
  );
}

/**
 * Records an observation, answering with it, or refusing a check that does not
 * exist.
 */
export async function insertArmingObservation(
  database: Queryable,
  observation: NewArmingObservation,
): Promise<WriteResult<ArmingObservation>> {
  return insertReturning(
    database,
    `INSERT INTO arming_observations (check_id, observed_on, armed, note)
     VALUES ($1, $2, $3, $4)
     RETURNING ${armingObservationColumns}`,
    [
      observation.checkId,
      observation.observedOn,
      observation.armed,
      observation.note,
    ],
    new Map([['arming_observations_check_id_fkey', noSuchCheck]]),
  );
}
