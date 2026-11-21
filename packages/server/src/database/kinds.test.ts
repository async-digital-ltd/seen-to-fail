import { PLANT_KINDS } from '@seen-to-fail/replay';
import type { PlantKind } from '@seen-to-fail/replay';
import { expect, it } from 'vitest';

import { useTestDatabase } from '../testing/test-database.ts';
import { kindsCaughtIn, listKindsCaughtForChecks } from './kinds.ts';
import type { TestRunOutcome } from './rows.ts';

/**
 * Which kinds of defect a check has been seen to catch (#295), read from the
 * database and from a list of records, which the build holds against each
 * other.
 */
const database = useTestDatabase();

const settledNothingBecause = 'The anchor no longer matches, so nothing broke.';

interface RunFixture {
  readonly outcome: TestRunOutcome;
  readonly kind: PlantKind | null;
}

async function insertCheck(
  name: string,
  runs: readonly RunFixture[],
): Promise<string> {
  const inserted = await database.client().query<{ id: string }>(
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ($1, 'Continuous integration', '', '')
     RETURNING id`,
    [name],
  );
  const id = inserted.rows[0]?.id;
  if (id === undefined) {
    throw new Error('Inserting a check returned no id.');
  }
  for (const run of runs) {
    await database.client().query(
      `INSERT INTO test_runs
         (check_id, run_on, planted, expected, outcome, inconclusive_reason,
          plant_kind, source)
       VALUES ($1, '2026-03-01', 'A plant', 'The job fails', $2, $3, $4,
               'hand')`,
      [
        id,
        run.outcome,
        run.outcome === 'inconclusive' ? settledNothingBecause : null,
        run.kind,
      ],
    );
  }
  return id;
}

/**
 * The database's enum and the replay package's list are the same list, in the
 * same order. The order is part of the claim: the kinds a check has caught are
 * listed by the enum's order in SQL and by PLANT_KINDS in the build's own
 * count, and the build compares the two as strings.
 */
it('holds the plant_kind enum to PLANT_KINDS, order included', async () => {
  const labels = await database
    .client()
    .query<{ label: string }>(
      'SELECT unnest(enum_range(NULL::plant_kind))::text AS label',
    );

  expect(labels.rows.map((row) => row.label)).toEqual([...PLANT_KINDS]);
});

it('refuses a kind outside the fixed list', async () => {
  await expect(
    insertCheck('A check with an unlisted kind', [
      { outcome: 'caught', kind: 'typo' as PlantKind },
    ]),
  ).rejects.toThrow(/invalid input value for enum plant_kind/);
});

it('lists both kinds a check caught, and nothing for one with no catch', async () => {
  const both = await insertCheck('A check that caught two kinds', [
    // Inserted out of the list's order, and one of them twice, so the order
    // and the distinctness are both the query's doing.
    { outcome: 'caught', kind: 'security' },
    { outcome: 'caught', kind: 'wrong-answer' },
    { outcome: 'caught', kind: 'security' },
    // None of these shows a kind caught: a miss, a run that settled nothing,
    // and a catch nobody declared a kind for.
    { outcome: 'missed', kind: 'crash' },
    { outcome: 'inconclusive', kind: 'dependency' },
    { outcome: 'caught', kind: null },
  ]);
  const none = await insertCheck('A check that caught no declared kind', [
    { outcome: 'missed', kind: 'crash' },
    { outcome: 'inconclusive', kind: 'missing-case' },
    { outcome: 'caught', kind: null },
  ]);

  const found = await listKindsCaughtForChecks(database.client(), [both, none]);

  expect(found.get(both)).toEqual(['wrong-answer', 'security']);
  expect(found.has(none)).toBe(false);
});

it('works the same answer out of a list of records', () => {
  expect(
    kindsCaughtIn([
      { outcome: 'caught', kind: 'security' },
      { outcome: 'caught', kind: 'wrong-answer' },
      { outcome: 'caught', kind: 'security' },
      { outcome: 'missed', kind: 'crash' },
      { outcome: 'inconclusive', kind: 'dependency' },
      { outcome: 'caught', kind: null },
    ]),
  ).toEqual(['wrong-answer', 'security']);
  expect(kindsCaughtIn([{ outcome: 'missed', kind: 'crash' }])).toEqual([]);
});
