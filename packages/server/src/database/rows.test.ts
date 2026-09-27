import { expect, it } from 'vitest';

import { useTestDatabase } from '../testing/test-database.ts';
import { listRunsForChecks } from './checks.ts';
import {
  armingObservationColumns,
  checkColumns,
  newestRunFirst,
  outcomePrecedence,
  savedFilterColumns,
  selectRows,
  testRunColumns,
  testRunOutcomes,
  testRunSources,
} from './rows.ts';
import type {
  ArmingObservation,
  Check,
  SavedFilter,
  TestRun,
  TestRunOutcome,
} from './rows.ts';
import { listCheckSummaries } from './summaries.ts';

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

/**
 * The rank in outcomePrecedence and the rank the database sorts by, read off
 * each other.
 *
 * listRunsForChecks builds its ORDER BY from the map through
 * newestRunFirstSql, so this holds the generated SQL to the map it was
 * generated from: one run per outcome, all on one day, so the day decides
 * nothing and the outcome is the only key left with anything to say. The
 * derivation's own spelling of the rank, in the migrations, is held by the
 * test after the next one.
 *
 * The three are given ids that ascend in the order they are expected back, so
 * the id, which is the only key below the outcome, puts them in the reverse
 * order. A query that ignored the outcome returns this list reversed. It cannot
 * pass by accident.
 */
it('sorts runs on one day by the precedence outcomePrecedence gives', async () => {
  const checkId = await insertCheck();
  const expected = [...testRunOutcomes].sort(
    (left, right) => outcomePrecedence[left] - outcomePrecedence[right],
  );

  for (const [index, outcome] of expected.entries()) {
    await insertRun(checkId, runIdEndingIn(index + 1), '2026-09-17', outcome);
  }

  const runs = await listRunsForChecks(database.client(), [checkId]);

  expect(runs.map((run) => run.outcome)).toEqual(expected);
  // The control on the fixture rather than on the query: all three really are
  // on one day, so nothing above was decided by the day.
  expect(new Set(runs.map((run) => run.runOn))).toEqual(
    new Set(['2026-09-17']),
  );
});

/** A run id that sorts by the number it ends in. */
function runIdEndingIn(digit: number): string {
  return `00000000-0000-4000-8000-00000000000${String(digit)}`;
}

/** One run, typed in by hand, under an id the test chooses. */
async function insertRun(
  checkId: string,
  id: string,
  runOn: string,
  outcome: TestRunOutcome,
  createdAt: string | null = null,
): Promise<void> {
  await database.client().query(
    `INSERT INTO test_runs
       (id, check_id, run_on, planted, expected, outcome, inconclusive_reason,
        source, created_at)
     VALUES ($1, $2, $3, 'A removed semicolon', 'The job fails', $4, $5,
             'hand', coalesce($6::timestamptz, now()))`,
    [
      id,
      checkId,
      runOn,
      outcome,
      outcome === 'inconclusive'
        ? 'The anchor no longer matches, so nothing broke.'
        : null,
      createdAt,
    ],
  );
}

/**
 * Two runs that share a day and an outcome, read in the order newestRunFirst
 * gives, by the app's query and by the derivation alike.
 *
 * The day and the outcome cannot tell them apart, so the last-resort key
 * decides, and it has to be the same key on every surface or the app's table
 * and the published page's table head with different rows. The page sorts in
 * TypeScript with newestRunFirst; the app's query and the derivation sort in
 * SQL. This reads both SQL answers back and holds them to the TypeScript one.
 *
 * The row written later has the smaller id, so a query that broke the tie by
 * when the row was written, as both used to, returns them the other way round.
 * The times are given rather than left to the clock, so the two cannot share
 * one, and the control below asserts that the fixture still has that shape.
 */
it('breaks a tie on the day and the outcome by the id, in the app and the derivation', async () => {
  const checkId = await insertCheck();
  const writtenFirst = runIdEndingIn(2);
  const writtenSecond = runIdEndingIn(1);
  await insertRun(
    checkId,
    writtenFirst,
    '2026-09-19',
    'caught',
    '2026-09-19T10:00:00Z',
  );
  await insertRun(
    checkId,
    writtenSecond,
    '2026-09-19',
    'caught',
    '2026-09-19T11:00:00Z',
  );

  const written = await selectRows<{ id: string }>(
    database.client(),
    'SELECT id FROM test_runs WHERE check_id = $1 ORDER BY created_at DESC',
    [checkId],
  );
  expect(written.map((row) => row.id)).toEqual([writtenSecond, writtenFirst]);

  const runs = await listRunsForChecks(database.client(), [checkId]);
  const expected = [...runs].sort(newestRunFirst).map((run) => run.id);
  expect(expected).toEqual([writtenFirst, writtenSecond]);
  expect(runs.map((run) => run.id)).toEqual(expected);

  const [summary] = await listCheckSummaries(database.client(), '2026-09-27');
  expect(summary?.latestSettledRunId).toBe(expected[0]);
});

/**
 * The run the derivation picks on a day with a miss and a catch, held to
 * newestRunFirst.
 *
 * check_summaries spells the outcome rank in its own ORDER BY, in the
 * migrations, rather than reading it from outcomePrecedence, so it is a second
 * copy of the rule and this is what would say the copies had drifted. The
 * catch is given the larger id, so the id alone would pick it: only the
 * outcome rank can make the miss the run the status was read from.
 */
it('picks the run newestRunFirst puts first when a miss and a catch share a day', async () => {
  const checkId = await insertCheck();
  const caught = runIdEndingIn(2);
  const missed = runIdEndingIn(1);
  await insertRun(checkId, caught, '2026-09-19', 'caught');
  await insertRun(checkId, missed, '2026-09-19', 'missed');

  const runs = await listRunsForChecks(database.client(), [checkId]);
  const [first] = [...runs].sort(newestRunFirst);
  expect(first?.id).toBe(missed);

  const [summary] = await listCheckSummaries(database.client(), '2026-09-27');
  expect(summary?.latestSettledRunId).toBe(first?.id);
});

/**
 * Two ids written in different cases, ordered as PostgreSQL orders the same
 * two values.
 *
 * The id check at the API boundary accepts either case, and PostgreSQL
 * compares a uuid's sixteen bytes, so case says nothing about its order. Text
 * comparison does not work that way: an upper-case B sorts before a
 * lower-case a, while the byte b sorts after the byte a. The two ids below are
 * chosen so that raw text comparison and byte order disagree, which the first
 * assertion checks so the fixture cannot quietly stop discriminating.
 */
/**
 * A uuid whose first character is the one given.
 *
 * Built by a function rather than written as literals so that the control in
 * the test below is a comparison made when the test runs. Narrowed to their
 * literal types, the compiler works the answer out itself and the lint rule
 * against a condition with a known answer refuses the assertion.
 */
function idStartingWith(first: string): string {
  return `${first}0000000-0000-4000-8000-000000000000`;
}

it('orders ids written in either case as PostgreSQL orders them', async () => {
  const upper = idStartingWith('B');
  const lower = idStartingWith('a');
  expect(upper < lower).toBe(true);

  const byDatabase = await selectRows<{ id: string }>(
    database.client(),
    `SELECT id FROM (VALUES ($1::uuid), ($2::uuid)) AS ids (id)
      ORDER BY id DESC`,
    [upper, lower],
  );
  const byFunction = [upper, lower]
    .map((id) => ({ id, runOn: '2026-09-19', outcome: 'caught' as const }))
    .sort(newestRunFirst)
    .map((run) => run.id.toLowerCase());

  expect(byFunction).toEqual(byDatabase.map((row) => row.id));
});
