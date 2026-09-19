import { DatabaseError } from 'pg';

import {
  nameTaken,
  noSuchCheck,
  observationDatedAfterToday,
  runDatedAfterToday,
} from './new-records.ts';
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
 * What is left for this file is the three rules only the database can apply:
 * whether a name is in use, whether a check exists under an id, and whether a
 * day is after the database's own today. None is looked up first. The
 * constraints already refuse all three, inside the insert itself, so there is
 * no moment between a lookup and a write for another request to change the
 * answer in, and a refusal is turned into the issue a form shows rather than
 * into an error.
 *
 * Two more constraints hold a run together: its source with its evidence, and
 * its outcome with the reason it settled nothing. Both are deliberately absent
 * from the lists below. Every value reaching here has been through the parse
 * function, which applies the same two rules, so either constraint firing would
 * mean the two readings of it disagree. That is a fault in this server rather
 * than something somebody can fix by editing a field, so it is thrown rather
 * than dressed up as an issue beside a form field.
 *
 * A refusal is recognised by its SQLSTATE and the name of the constraint that
 * raised it, together. The name alone is not enough. A unique index that cannot
 * fit a value raises a program limit error that still names the index's
 * constraint, and a value too long to index is not a value already in use;
 * answering it as one would tell somebody their name is taken when no check has
 * it. Anything that is not one of the refusals listed, from a lost connection to
 * a constraint nobody expected to fire, is not something a person can fix by
 * editing a field, so it is thrown on as it arrived.
 */

/** The row that was written, or the issue that stopped it being written. */
export type WriteResult<Row> =
  | { readonly ok: true; readonly row: Row }
  | { readonly ok: false; readonly errors: readonly RecordIssue[] };

/** The SQLSTATEs of the refusals the writes expect, by what they mean. */
const uniqueViolation = '23505';
const foreignKeyViolation = '23503';
const checkViolation = '23514';

/** A refusal a write expects, by what raises it, and what it means. */
interface ExpectedRefusal {
  readonly code: string;
  readonly constraint: string;
  readonly issue: RecordIssue;
}

/** The issue a failure means, when it is one of the refusals expected. */
function issueFor(
  cause: unknown,
  refusals: readonly ExpectedRefusal[],
): RecordIssue | undefined {
  if (!(cause instanceof DatabaseError)) {
    return undefined;
  }
  return refusals.find(
    (refusal) =>
      refusal.code === cause.code && refusal.constraint === cause.constraint,
  )?.issue;
}

/** One insert that returns its row, with the refusals it knows how to explain. */
async function insertReturning<Row>(
  database: Queryable,
  sql: string,
  values: readonly unknown[],
  refusals: readonly ExpectedRefusal[],
): Promise<WriteResult<Row>> {
  let rows: Row[];
  try {
    rows = await selectRows<Row>(database, sql, values);
  } catch (cause) {
    const issue = issueFor(cause, refusals);
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
    [
      {
        code: uniqueViolation,
        constraint: 'checks_name_unique',
        issue: nameTaken,
      },
    ],
  );
}

/**
 * Logs a run, answering with it, or refusing a check that does not exist or a
 * day after the database's today.
 */
export async function insertTestRun(
  database: Queryable,
  run: NewTestRun,
): Promise<WriteResult<TestRun>> {
  return insertReturning(
    database,
    `INSERT INTO test_runs
       (check_id, run_on, planted, expected, outcome, inconclusive_reason,
        note, source, source_commit, source_run_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${testRunColumns}`,
    [
      run.checkId,
      run.runOn,
      run.planted,
      run.expected,
      run.outcome,
      run.inconclusiveReason,
      run.note,
      run.source,
      run.sourceCommit,
      run.sourceRunUrl,
    ],
    [
      {
        code: foreignKeyViolation,
        constraint: 'test_runs_check_id_fkey',
        issue: noSuchCheck,
      },
      {
        code: checkViolation,
        constraint: 'test_runs_run_on_not_in_the_future',
        issue: runDatedAfterToday,
      },
    ],
  );
}

/**
 * Records an observation, answering with it, or refusing a check that does not
 * exist or a day after the database's today.
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
    [
      {
        code: foreignKeyViolation,
        constraint: 'arming_observations_check_id_fkey',
        issue: noSuchCheck,
      },
      {
        code: checkViolation,
        constraint: 'arming_observations_observed_on_not_in_the_future',
        issue: observationDatedAfterToday,
      },
    ],
  );
}
