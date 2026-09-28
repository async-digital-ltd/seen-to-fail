import { DatabaseError } from 'pg';
import type { Client } from 'pg';

/**
 * Running a statement that a constraint is supposed to refuse, and reporting
 * which constraint refused it.
 *
 * A test that only asserts "the insert threw" passes for the wrong reason as
 * easily as the right one: a typo in a column name throws too, and so does a
 * NOT NULL firing before the check that the test is actually about. So the
 * helper returns the error's SQLSTATE and the constraint that raised it, and
 * the tests assert both. Naming every constraint in the migration is what makes
 * that possible.
 *
 * A statement that is accepted fails here rather than returning something the
 * caller might not look at, because a constraint that has quietly stopped
 * refusing is the failure these tests exist to catch.
 */

/** The SQLSTATE codes these tests expect, named rather than spelled inline. */
export const sqlStates = {
  /** A value that is not one of an enum's labels. */
  invalidTextRepresentation: '22P02',
  /** A value too large for its numeric type, such as `integer`. */
  numericValueOutOfRange: '22003',
  /** A date outside the range PostgreSQL holds: "date out of range". */
  datetimeFieldOverflow: '22008',
  notNullViolation: '23502',
  foreignKeyViolation: '23503',
  uniqueViolation: '23505',
  checkViolation: '23514',
} as const;

export interface Rejection {
  /** The SQLSTATE the database raised. */
  readonly code: string;
  /**
   * The constraint that refused the row, where there was one. An enum refusing
   * a label it does not have is raised by the type rather than a constraint, so
   * that case has no name to report.
   */
  readonly constraint: string | undefined;
}

/**
 * Runs the statement, expecting the database to refuse it, and returns what
 * refused it. Throws if the statement is accepted.
 */
export async function rejectionOf(
  client: Client,
  sql: string,
  values: readonly unknown[] = [],
): Promise<Rejection> {
  try {
    await client.query(sql, [...values]);
  } catch (cause) {
    if (cause instanceof DatabaseError) {
      return { code: cause.code ?? '', constraint: cause.constraint };
    }
    throw cause;
  }

  throw new Error(
    'The database accepted the statement. A constraint was supposed to ' +
      'refuse it, so either the row is not as bad as the test thinks or the ' +
      'constraint is gone.',
  );
}
