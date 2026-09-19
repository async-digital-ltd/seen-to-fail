import { expect, it } from 'vitest';

import { useTestDatabase } from '../testing/test-database.ts';
import {
  armingObservationColumns,
  checkColumns,
  savedFilterColumns,
  selectRows,
  testRunColumns,
  testRunOutcomes,
  testRunSources,
} from './rows.ts';
import type { ArmingObservation, Check, SavedFilter, TestRun } from './rows.ts';

/**
 * A row of each type, inserted and read back through the column list that is
 * supposed to produce it.
 *
 * Two things are checked, and they catch different mistakes. The field list in
 * each test must name every field of the type and nothing else, so a field
 * added to the type without being added there fails to compile. The keys the
 * query actually returns are then compared against that list, so a field with
 * no column behind it fails here instead of reaching a caller as undefined.
 */
const database = useTestDatabase();

/**
 * The field names of a row type, sorted.
 *
 * Record<keyof Row, true> is what does the work: it is satisfied only by an
 * object naming every field of Row, and it refuses any name that is not one.
 */
function fieldsOf<Row>(fields: Record<keyof Row, true>): string[] {
  return Object.keys(fields).sort();
}

function onlyRow<Row>(rows: readonly Row[]): Row {
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Expected one row and the query returned none.');
  }
  return row;
}

/** A uuid as PostgreSQL writes one. */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function insertCheck(): Promise<string> {
  const inserted = await database.client().query<{ id: string }>(
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ('Formatting check', 'Continuous integration',
             'Unformatted code reaching main', 'The job shows in the run list')
     RETURNING id`,
  );

  const id = inserted.rows[0]?.id;
  if (id === undefined) {
    throw new Error('Inserting a check returned no id.');
  }
  return id;
}

it('reads back a check, selected by its id', async () => {
  const checkId = await insertCheck();

  const checks = await selectRows<Check>(
    database.client(),
    `SELECT ${checkColumns} FROM checks WHERE id = $1`,
    [checkId],
  );
  const check = onlyRow(checks);

  expect(Object.keys(check).sort()).toEqual(
    fieldsOf<Check>({
      id: true,
      name: true,
      area: true,
      protects: true,
      howToTellArmed: true,
      createdAt: true,
    }),
  );
  expect(check.id).toMatch(uuid);
  expect(check.id).toBe(checkId);
  expect(check.name).toBe('Formatting check');
  expect(check.area).toBe('Continuous integration');
  expect(check.protects).toBe('Unformatted code reaching main');
  expect(check.howToTellArmed).toBe('The job shows in the run list');
  expect(check.createdAt).toBeInstanceOf(Date);
});

it('reads back a test run, with its day as text', async () => {
  const checkId = await insertCheck();
  await database.client().query(
    `INSERT INTO test_runs
       (check_id, run_on, planted, expected, outcome, note, source)
     VALUES ($1, '2026-01-09', 'A removed semicolon', 'The job fails',
             'caught', 'Took four minutes to report', 'hand')`,
    [checkId],
  );

  const runs = await selectRows<TestRun>(
    database.client(),
    `SELECT ${testRunColumns} FROM test_runs`,
  );
  const run = onlyRow(runs);

  expect(Object.keys(run).sort()).toEqual(
    fieldsOf<TestRun>({
      id: true,
      checkId: true,
      runOn: true,
      planted: true,
      expected: true,
      outcome: true,
      inconclusiveReason: true,
      note: true,
      source: true,
      sourceCommit: true,
      sourceRunUrl: true,
      createdAt: true,
    }),
  );
  expect(run.checkId).toBe(checkId);
  // A day, not an instant. A Date here would be built at midnight in whatever
  // zone this process runs in, and could read back as the day before.
  expect(typeof run.runOn).toBe('string');
  expect(run.runOn).toBe('2026-01-09');
  expect(run.planted).toBe('A removed semicolon');
  expect(run.expected).toBe('The job fails');
  expect(testRunOutcomes).toContain(run.outcome);
  expect(run.outcome).toBe('caught');
  expect(run.note).toBe('Took four minutes to report');
  // A run that settled the question has no reason to give, and reads back with
  // none rather than with an empty string standing in for one.
  expect(run.inconclusiveReason).toBeNull();
  expect(testRunSources).toContain(run.source);
  expect(run.source).toBe('hand');
  // A run somebody typed in has neither, and reads back with neither rather
  // than with an empty string standing in for a commit nobody named.
  expect(run.sourceCommit).toBeNull();
  expect(run.sourceRunUrl).toBeNull();
  expect(run.createdAt).toBeInstanceOf(Date);
});

it('reads back a test run that has no note', async () => {
  const checkId = await insertCheck();
  await database.client().query(
    `INSERT INTO test_runs
       (check_id, run_on, planted, expected, outcome, source)
     VALUES ($1, '2026-01-09', 'A removed semicolon', 'The job fails',
             'missed', 'hand')`,
    [checkId],
  );

  const runs = await selectRows<TestRun>(
    database.client(),
    `SELECT ${testRunColumns} FROM test_runs`,
  );

  expect(onlyRow(runs).note).toBeNull();
});

it('reads back a replay with the commit and the run it names', async () => {
  const checkId = await insertCheck();
  await database.client().query(
    `INSERT INTO test_runs
       (check_id, run_on, planted, expected, outcome,
        source, source_commit, source_run_url)
     VALUES ($1, '2026-01-09', 'A removed semicolon', 'The job fails',
             'caught', 'replay',
             '1234567890abcdef1234567890abcdef12345678',
             'https://ci.example.com/runs/91')`,
    [checkId],
  );

  const run = onlyRow(
    await selectRows<TestRun>(
      database.client(),
      `SELECT ${testRunColumns} FROM test_runs`,
    ),
  );

  expect(run.source).toBe('replay');
  expect(run.sourceCommit).toBe('1234567890abcdef1234567890abcdef12345678');
  expect(run.sourceRunUrl).toBe('https://ci.example.com/runs/91');
});

it('reads back an arming observation', async () => {
  const checkId = await insertCheck();
  await database.client().query(
    `INSERT INTO arming_observations (check_id, observed_on, armed, note)
     VALUES ($1, '2026-01-09', true, 'Seen in the run list')`,
    [checkId],
  );

  const observations = await selectRows<ArmingObservation>(
    database.client(),
    `SELECT ${armingObservationColumns} FROM arming_observations`,
  );
  const observation = onlyRow(observations);

  expect(Object.keys(observation).sort()).toEqual(
    fieldsOf<ArmingObservation>({
      id: true,
      checkId: true,
      observedOn: true,
      armed: true,
      note: true,
      createdAt: true,
    }),
  );
  expect(observation.checkId).toBe(checkId);
  expect(typeof observation.observedOn).toBe('string');
  expect(observation.observedOn).toBe('2026-01-09');
  expect(observation.armed).toBe(true);
  expect(observation.note).toBe('Seen in the run list');
  expect(observation.createdAt).toBeInstanceOf(Date);
});

it('reads back a saved filter with its tree intact', async () => {
  const filter = {
    any: [
      { field: 'status', is: 'Unproven' },
      { field: 'area', is: 'Pre-commit' },
    ],
  };
  await database
    .client()
    .query('INSERT INTO saved_filters (name, filter) VALUES ($1, $2)', [
      'Needs proving',
      JSON.stringify(filter),
    ]);

  const saved = onlyRow(
    await selectRows<SavedFilter>(
      database.client(),
      `SELECT ${savedFilterColumns} FROM saved_filters`,
    ),
  );

  expect(Object.keys(saved).sort()).toEqual(
    fieldsOf<SavedFilter>({
      id: true,
      name: true,
      filter: true,
      createdAt: true,
    }),
  );
  expect(saved.name).toBe('Needs proving');
  expect(saved.filter).toEqual(filter);
  expect(saved.createdAt).toBeInstanceOf(Date);
});
