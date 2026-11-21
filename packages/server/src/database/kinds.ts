import { PLANT_KINDS } from '@seen-to-fail/replay';
import type { PlantKind } from '@seen-to-fail/replay';

import { selectRows } from './rows.ts';
import type { Queryable, TestRunOutcome } from './rows.ts';

/**
 * The kinds of defect a check has been seen to catch (#295).
 *
 * A kind is declared by the plant's author and copied onto the runs a replay
 * records. A check has been seen to catch a kind when at least one of its runs
 * of that kind caught. A run that missed or settled nothing shows nothing
 * caught, and a run with no declared kind says nothing about kinds at all, so
 * neither adds one.
 *
 * Nothing here is a status, and nothing that derives one reads this. The two
 * routes below answer the same question from different places, the database
 * and a list of records, so the build can hold the export it publishes against
 * the files it was built from.
 */

/** A run, reduced to the two things that decide whether it adds a kind. */
export interface KindEvidence {
  readonly kind: PlantKind | null;
  readonly outcome: TestRunOutcome;
}

/**
 * The distinct kinds among the runs that caught, in the order of PLANT_KINDS,
 * whatever order the runs arrive in. Empty when none caught a declared kind.
 */
export function kindsCaughtIn(runs: readonly KindEvidence[]): PlantKind[] {
  const caught = new Set<PlantKind>();
  for (const run of runs) {
    if (run.outcome === 'caught' && run.kind !== null) {
      caught.add(run.kind);
    }
  }
  return PLANT_KINDS.filter((kind) => caught.has(kind));
}

/**
 * The kinds each of the given checks has been seen to catch, read from the
 * database, keyed by the check's id. A check that has caught no declared kind
 * is absent from the map, and a caller reads that as an empty list.
 *
 * Ordered by the enum, which orders labels as they were declared. A test holds
 * that declaration to PLANT_KINDS, order included, so this order and the one
 * kindsCaughtIn produces are the same order. The array is cast to text[]
 * because the driver parses an array of a type it knows and hands back an
 * array of an enum it does not as the literal text PostgreSQL wrote.
 */
export async function listKindsCaughtForChecks(
  database: Queryable,
  checkIds: readonly string[],
): Promise<ReadonlyMap<string, PlantKind[]>> {
  if (checkIds.length === 0) {
    return new Map();
  }

  const rows = await selectRows<{ checkId: string; kinds: PlantKind[] }>(
    database,
    `SELECT check_id AS "checkId",
            array_agg(DISTINCT plant_kind ORDER BY plant_kind)::text[] AS kinds
       FROM test_runs
      WHERE check_id = ANY($1)
        AND outcome = 'caught'
        AND plant_kind IS NOT NULL
      GROUP BY check_id`,
    [[...checkIds]],
  );
  return new Map(rows.map((row) => [row.checkId, row.kinds]));
}
