import type { Client } from 'pg';
import { expect, it } from 'vitest';

import { quoteIdentifier } from '../database/identifiers.ts';
import { sqlStates } from './rejections.ts';
import type { Rejection } from './rejections.ts';

/**
 * What the suite holds every CHECK constraint in the schema to, read from the
 * catalog rather than from a list of what is believed to exist.
 *
 * A check constraint refuses a row only when its expression evaluates to
 * false. Null is not false, so a constraint that can evaluate to null is
 * vacuous for exactly the rows it exists to refuse. This schema wrote that
 * shape twice, in 0004 and 0006, and the migrations README says so. A rule
 * that is only written down fires only on an author who reads it, so the two
 * reads below are what fire on one who does not:
 *
 * - The registry. Every CHECK constraint has a refusal test, declared with
 *   refusalTest, that plants the row it exists to refuse and sees it refused
 *   by the constraint's own name. That fails on the constraint nobody thought
 *   to test.
 * - The null probe. Every CHECK constraint answers true or false, never null,
 *   on rows whose nullable columns are null and whose enum columns take every
 *   label the enum has. That fails on a constraint written in a shape that
 *   answers null, including one whose refusal tests all pass.
 *
 * Neither waits for anybody to remember it: a constraint added in a migration
 * is read by both the moment it exists.
 */

/** Every constraint a refusal test has been declared for, in this test file. */
const declared = new Set<string>();

/**
 * Declares a refusal test for one CHECK constraint.
 *
 * The constraint's name is given once and used twice: it is recorded where the
 * registry reads it, and it is the name the refusal is asserted to come from.
 * A test therefore cannot be counted as covering one constraint while it
 * asserts about another, and a reader holding a constraint's name finds its
 * refusal tests by searching for that name.
 *
 * The name is recorded when the test is declared rather than when it runs, so
 * the registry sees every refusal test in the file however many of them run
 * and in whatever order.
 *
 * Declare them in database/schema.test.ts, beside the registry test that reads
 * them. A test file sees only what was declared while that file was being
 * collected, so a refusal test declared anywhere else is one the registry
 * cannot count on seeing, and it fails rather than assume the test exists.
 */
export function refusalTest(
  constraint: string,
  title: string,
  refuse: () => Promise<Rejection>,
): void {
  declared.add(constraint);

  it(title, async () => {
    expect(await refuse()).toEqual({
      code: sqlStates.checkViolation,
      constraint,
    });
  });
}

/** The constraints refusal tests have been declared for, sorted by name. */
export function constraintsWithARefusalTest(): string[] {
  return [...declared].sort();
}

/**
 * Every CHECK constraint in the schema, by name, sorted.
 *
 * Limited to the public schema because pg_constraint also lists the CHECK
 * constraints PostgreSQL puts on information_schema's own domains, which are
 * not this schema's. A domain this schema creates is in public and is read.
 */
export async function checkConstraintNames(client: Client): Promise<string[]> {
  const found = await client.query<{ name: string }>(
    `SELECT conname AS name
       FROM pg_constraint
      WHERE contype = 'c'
        AND connamespace = 'public'::regnamespace`,
  );
  return found.rows.map((row) => row.name).sort();
}

/**
 * The values a probe row gives a column that is not an enum, by type.
 *
 * Every nullable column is also given null, which is the point of the probe.
 * An enum column is given every label its enum has, read from the catalog, so
 * a label added later is probed the moment it exists: that is what finds a
 * CASE with no ELSE, which answers null for a label it does not list.
 *
 * Only the types a CHECK constraint in this schema reads are here. A constraint
 * that reads a column of any other type stops the probe with an error naming
 * the type, rather than being probed with nothing and passing.
 */
const probeValues: Readonly<Record<string, readonly string[]>> = {
  // Empty and nothing but spaces as well as ordinary text, because those are
  // the values btrim exists for, and nullif turns them into null.
  text: ['', '   ', 'Not empty'],
  date: ['2026-01-01'],
  'timestamp with time zone': ['2026-01-01 00:00:00+00'],
};

interface ProbedColumn {
  readonly name: string;
  /** The type as format_type spells it, which is valid SQL for a cast. */
  readonly type: string;
  readonly nullable: boolean;
  /** Every label of the column's enum in order, or null when it is not one. */
  readonly labels: readonly string[] | null;
}

interface ConstraintToProbe {
  readonly name: string;
  /** False for a constraint on a domain, which has no row to probe. */
  readonly onTable: boolean;
  readonly expression: string;
  readonly columns: readonly ProbedColumn[];
}

export interface NullVerdict {
  readonly constraint: string;
  /** The probe rows the constraint evaluated to null on, column by column. */
  readonly nullOn: readonly Record<string, unknown>[];
}

/**
 * Evaluates every CHECK constraint's own expression, as pg_get_expr gives it
 * back, against every combination of its columns' probe values, and reports
 * the rows each one evaluated to null on.
 *
 * The expression is evaluated rather than inserted against, because an insert
 * cannot tell the two answers apart that matter here: a row the expression
 * calls true and a row it calls null are both accepted.
 */
export async function nullVerdicts(client: Client): Promise<NullVerdict[]> {
  const constraints = await client.query<ConstraintToProbe>(
    `SELECT constraints.conname AS name,
            constraints.conrelid <> 0 AS "onTable",
            pg_get_expr(constraints.conbin, constraints.conrelid) AS expression,
            columns.list AS columns
       FROM pg_constraint AS constraints
      CROSS JOIN LATERAL (
        SELECT coalesce(
                 json_agg(
                   json_build_object(
                     'name', attributes.attname,
                     'type', format_type(attributes.atttypid,
                                         attributes.atttypmod),
                     'nullable', NOT attributes.attnotnull,
                     'labels', (SELECT array_agg(enumlabel
                                                 ORDER BY enumsortorder)
                                  FROM pg_enum
                                 WHERE enumtypid = attributes.atttypid))
                   ORDER BY attributes.attnum),
                 '[]'::json) AS list
          FROM pg_attribute AS attributes
         WHERE attributes.attrelid = constraints.conrelid
           AND attributes.attnum = ANY (constraints.conkey)
      ) AS columns
      WHERE constraints.contype = 'c'
        AND constraints.connamespace = 'public'::regnamespace
      ORDER BY constraints.conname`,
  );

  const verdicts: NullVerdict[] = [];
  for (const constraint of constraints.rows) {
    verdicts.push({
      constraint: constraint.name,
      nullOn: await nullOn(client, constraint),
    });
  }
  return verdicts.sort((a, b) => (a.constraint < b.constraint ? -1 : 1));
}

async function nullOn(
  client: Client,
  constraint: ConstraintToProbe,
): Promise<Record<string, unknown>[]> {
  if (!constraint.onTable) {
    throw new Error(
      `${constraint.name} is a constraint on a domain, and the null probe ` +
        `only knows how to build rows for a table. Teach it domains before ` +
        `adding one, so the constraint is probed rather than skipped.`,
    );
  }

  const values: (string | null)[][] = [];
  const sources = constraint.columns.map((column, index) => {
    const probed = column.labels ?? probeValues[column.type];
    if (probed === undefined) {
      throw new Error(
        `${constraint.name} reads ${column.name}, of type ${column.type}, ` +
          `and the null probe has no values for that type. Add some to ` +
          `probeValues so the constraint is probed rather than skipped.`,
      );
    }
    values.push(column.nullable ? [...probed, null] : [...probed]);

    // The type is spliced because a cast cannot take a parameter. It is the
    // catalog's own spelling of a type this schema declared, not input.
    return (
      `(SELECT value::${column.type} AS ${quoteIdentifier(column.name)} ` +
      `FROM unnest($${String(index + 1)}::text[]) AS value) AS probe_${String(index)}`
    );
  });

  // quoteIdentifier refuses anything but a plain lower-case name, so the name
  // is safe to write as the key's literal once it has passed.
  const row = constraint.columns
    .map((column) => `'${column.name}', ${quoteIdentifier(column.name)}`)
    .join(', ');
  const from =
    sources.length === 0 ? '' : `FROM ${sources.join(' CROSS JOIN ')}`;

  const evaluated = await client.query<{ probe: Record<string, unknown> }>(
    `SELECT probe
       FROM (SELECT jsonb_build_object(${row}) AS probe,
                    (${constraint.expression}) AS verdict
             ${from}) AS evaluated
      WHERE verdict IS NULL
      ORDER BY probe::text`,
    values,
  );
  return evaluated.rows.map((result) => result.probe);
}
