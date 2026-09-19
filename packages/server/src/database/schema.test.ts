import { expect, it } from 'vitest';

import { rejectionOf, sqlStates } from '../testing/rejections.ts';
import { useTestDatabase } from '../testing/test-database.ts';

/**
 * Every constraint in the schema, seen to refuse the row it exists for.
 *
 * Each test names the constraint it expects, not just the fact that something
 * threw, so a test cannot pass because an unrelated rule fired first. The tests
 * that expect a refusal are paired with ones that insert the nearest acceptable
 * row: a constraint that has started refusing everything is as broken as one
 * that has stopped refusing anything, and only the pair can tell them apart.
 *
 * The dates come from the database rather than from this process, so a run just
 * after midnight compares the same two clocks the constraint does.
 */
const database = useTestDatabase();

/** The day the database is having, in UTC, as the constraints read it. */
const today = "(now() AT TIME ZONE 'UTC')::date";

/**
 * The columns every insert below names, and the source it gives.
 *
 * source has no default, on purpose: a run that does not say where it came from
 * is refused rather than recorded as somebody's typing. That is a rule of its
 * own, with its own test, and it is why every statement here spells it out.
 */
const runColumns = '(check_id, run_on, planted, expected, outcome, source)';

const insertRun = `
  INSERT INTO test_runs ${runColumns}
  VALUES ($1, ${today}, 'A removed semicolon', 'The job fails', 'caught',
          'hand')
`;

const insertObservation = `
  INSERT INTO arming_observations (check_id, observed_on, armed)
  VALUES ($1, ${today}, true)
`;

/** Inserts a valid check and returns its id, for a test to hang rows off. */
async function insertCheck(name = 'Formatting check'): Promise<string> {
  const inserted = await database.client().query<{ id: string }>(
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ($1, 'Continuous integration', 'Unformatted code reaching main',
             'The job shows in the run list')
     RETURNING id`,
    [name],
  );

  const id = inserted.rows[0]?.id;
  if (id === undefined) {
    throw new Error('Inserting a check returned no id.');
  }
  return id;
}

async function count(table: string): Promise<number> {
  const counted = await database
    .client()
    .query<{ total: string }>(`SELECT count(*)::text AS total FROM ${table}`);

  const total = counted.rows[0]?.total;
  if (total === undefined) {
    throw new Error(`Counting ${table} returned no row at all.`);
  }
  return Number(total);
}

it('creates the four tables and the two indexes', async () => {
  const found = await database.client().query<{ name: string }>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'
     UNION ALL
     SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public'`,
  );
  const names = found.rows.map((row) => row.name);

  expect(names).toEqual(
    expect.arrayContaining([
      'checks',
      'test_runs',
      'arming_observations',
      'saved_filters',
      'test_runs_check_id_run_on_index',
      'arming_observations_check_id_observed_on_index',
    ]),
  );
});

it('refuses a second check with the same name', async () => {
  await insertCheck('Formatting check');

  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ('Formatting check', 'Pre-commit', '', '')`,
  );

  expect(refused).toEqual({
    code: sqlStates.uniqueViolation,
    constraint: 'checks_name_unique',
  });
});

it('accepts two checks with different names', async () => {
  await insertCheck('Formatting check');
  await insertCheck('Secret scanner');

  expect(await count('checks')).toBe(2);
});

// Both forms are the same emptiness to a reader, and only the second one needs
// btrim to be caught at all.
it.each([
  { form: 'empty', name: '' },
  { form: 'nothing but spaces', name: '   ' },
])('refuses a check whose name is $form', async ({ name }) => {
  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ($1, 'Continuous integration', '', '')`,
    [name],
  );

  expect(refused).toEqual({
    code: sqlStates.checkViolation,
    constraint: 'checks_name_not_empty',
  });
});

it('refuses a check whose area is blank', async () => {
  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ('Formatting check', '   ', '', '')`,
  );

  expect(refused).toEqual({
    code: sqlStates.checkViolation,
    constraint: 'checks_area_not_empty',
  });
});

it('refuses a test run against a check that does not exist', async () => {
  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO test_runs ${runColumns}
     VALUES (gen_random_uuid(), ${today}, 'A removed semicolon',
             'The job fails', 'caught', 'hand')`,
  );

  expect(refused).toEqual({
    code: sqlStates.foreignKeyViolation,
    constraint: 'test_runs_check_id_fkey',
  });
});

it('refuses a test run whose outcome is not one the enum has', async () => {
  const checkId = await insertCheck();

  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO test_runs ${runColumns}
     VALUES ($1, ${today}, 'A removed semicolon', 'The job fails', 'ignored',
             'hand')`,
    [checkId],
  );

  // Raised by the enum type rather than by a constraint, so there is no
  // constraint name to report.
  expect(refused).toEqual({
    code: sqlStates.invalidTextRepresentation,
    constraint: undefined,
  });
});

it('accepts both outcomes the enum does have', async () => {
  const checkId = await insertCheck();

  await database.client().query(
    `INSERT INTO test_runs ${runColumns}
     VALUES ($1, ${today}, 'A removed semicolon', 'The job fails', 'caught',
             'hand'),
            ($1, ${today}, 'A removed semicolon', 'The job fails', 'missed',
             'hand')`,
    [checkId],
  );

  expect(await count('test_runs')).toBe(2);
});

it('refuses a test run dated after the day it was recorded', async () => {
  const checkId = await insertCheck();

  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO test_runs ${runColumns}
     VALUES ($1, ${today} + 1, 'A removed semicolon', 'The job fails',
             'caught', 'hand')`,
    [checkId],
  );

  expect(refused).toEqual({
    code: sqlStates.checkViolation,
    constraint: 'test_runs_run_on_not_in_the_future',
  });
});

it('accepts a test run dated today and one dated well in the past', async () => {
  const checkId = await insertCheck();

  await database.client().query(
    `INSERT INTO test_runs ${runColumns}
     VALUES ($1, ${today}, 'A removed semicolon', 'The job fails', 'caught',
             'hand'),
            ($1, ${today} - 400, 'A removed semicolon', 'The job fails',
             'missed', 'hand')`,
    [checkId],
  );

  expect(await count('test_runs')).toBe(2);
});

it('refuses an arming observation against a check that does not exist', async () => {
  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO arming_observations (check_id, observed_on, armed)
     VALUES (gen_random_uuid(), ${today}, true)`,
  );

  expect(refused).toEqual({
    code: sqlStates.foreignKeyViolation,
    constraint: 'arming_observations_check_id_fkey',
  });
});

it('refuses an arming observation dated after the day it was recorded', async () => {
  const checkId = await insertCheck();

  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO arming_observations (check_id, observed_on, armed)
     VALUES ($1, ${today} + 1, true)`,
    [checkId],
  );

  expect(refused).toEqual({
    code: sqlStates.checkViolation,
    constraint: 'arming_observations_observed_on_not_in_the_future',
  });
});

it('accepts an arming observation dated today and one dated earlier', async () => {
  const checkId = await insertCheck();

  await database.client().query(
    `INSERT INTO arming_observations (check_id, observed_on, armed)
     VALUES ($1, ${today}, true),
            ($1, ${today} - 400, false)`,
    [checkId],
  );

  expect(await count('arming_observations')).toBe(2);
});

it('records that a check is on and that it is off on separate days', async () => {
  const checkId = await insertCheck();

  await database.client().query(
    `INSERT INTO arming_observations (check_id, observed_on, armed, note)
     VALUES ($1, ${today} - 10, true, 'Seen in the run list'),
            ($1, ${today}, false, 'The job is no longer in the run list')`,
    [checkId],
  );

  const latest = await database.client().query<{ armed: boolean }>(
    `SELECT armed FROM arming_observations
      WHERE check_id = $1 ORDER BY observed_on DESC LIMIT 1`,
    [checkId],
  );

  // The later row does not replace the earlier one. Both stay, and the reading
  // is which of them is latest.
  expect(await count('arming_observations')).toBe(2);
  expect(latest.rows[0]?.armed).toBe(false);
});

it('refuses a second saved filter with the same name', async () => {
  await database
    .client()
    .query(
      `INSERT INTO saved_filters (name, filter) VALUES ('Needs proving', '{}')`,
    );

  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO saved_filters (name, filter)
     VALUES ('Needs proving', '{"area": "Pre-commit"}')`,
  );

  expect(refused).toEqual({
    code: sqlStates.uniqueViolation,
    constraint: 'saved_filters_name_unique',
  });
});

it('refuses a saved filter whose name is blank', async () => {
  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO saved_filters (name, filter) VALUES ('   ', '{}')`,
  );

  expect(refused).toEqual({
    code: sqlStates.checkViolation,
    constraint: 'saved_filters_name_not_empty',
  });
});

it('refuses a saved filter whose filter is not JSON', async () => {
  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO saved_filters (name, filter) VALUES ('Needs proving', 'not')`,
  );

  expect(refused.code).toBe(sqlStates.invalidTextRepresentation);
});

it('deletes a check together with its runs and its observations', async () => {
  const checkId = await insertCheck();
  await database.client().query(insertRun, [checkId]);
  await database.client().query(insertObservation, [checkId]);

  await database.client().query('DELETE FROM checks WHERE id = $1', [checkId]);

  expect(await count('test_runs')).toBe(0);
  expect(await count('arming_observations')).toBe(0);
});

/**
 * A run's source and the evidence that has to travel with it.
 *
 * Four statements, because the rule has four ways to be broken and each one
 * publishes a different lie: a replay with no commit is a claim nobody can
 * check, a replay with no run link is a claim nobody can go and look at, and a
 * run typed in by hand carrying either is evidence nobody produced. The pair
 * of accepting statements underneath is what tells a constraint that refuses
 * everything apart from one that refuses the right things.
 */
it.each([
  [
    'a replay with no commit',
    `'replay', NULL, 'https://ci.example.com/runs/91'`,
  ],
  [
    'a replay with no run to link to',
    `'replay', '1234567890abcdef1234567890abcdef12345678', NULL`,
  ],
  [
    'a run typed in by hand carrying a commit',
    `'hand', '1234567890abcdef1234567890abcdef12345678', NULL`,
  ],
  [
    'a run typed in by hand carrying a run link',
    `'hand', NULL, 'https://ci.example.com/runs/91'`,
  ],
])('refuses %s', async (_description, evidence) => {
  const checkId = await insertCheck();

  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO test_runs
       (check_id, run_on, planted, expected, outcome,
        source, source_commit, source_run_url)
     VALUES ($1, ${today}, 'A removed semicolon', 'The job fails', 'caught',
             ${evidence})`,
    [checkId],
  );

  expect(refused).toEqual({
    code: sqlStates.checkViolation,
    constraint: 'test_runs_source_carries_its_evidence',
  });
});

it('accepts a hand run with nothing beside it and a replay with both', async () => {
  const checkId = await insertCheck();

  await database.client().query(
    `INSERT INTO test_runs
       (check_id, run_on, planted, expected, outcome,
        source, source_commit, source_run_url)
     VALUES ($1, ${today}, 'A removed semicolon', 'The job fails', 'caught',
             'hand', NULL, NULL),
            ($1, ${today}, 'A removed semicolon', 'The job fails', 'caught',
             'replay', '1234567890abcdef1234567890abcdef12345678',
             'https://ci.example.com/runs/91')`,
    [checkId],
  );

  expect(await count('test_runs')).toBe(2);
});

/**
 * No default on the source column, and that is the point of this test rather
 * than an incidental fact about it.
 *
 * A default would have made a writer that forgot to say where a run came from
 * record it as somebody's typing, silently and in a column whose whole job is
 * to say who wrote the row. With none, the same omission is a refusal.
 */
it('refuses a run that does not say where it came from', async () => {
  const checkId = await insertCheck();

  const refused = await rejectionOf(
    database.client(),
    `INSERT INTO test_runs (check_id, run_on, planted, expected, outcome)
     VALUES ($1, ${today}, 'A removed semicolon', 'The job fails', 'caught')`,
    [checkId],
  );

  expect(refused.code).toBe(sqlStates.notNullViolation);
});

/**
 * The runs recorded before the source column existed.
 *
 * The migration backfilled them as hand, which is true of every one of them:
 * nothing but the form could write a run until this story. The test inserts a
 * row through the table as it stands, then reads back what the migration would
 * have left, which is the closest a test against the current schema can get to
 * a row that predates it.
 */
it('reads a run recorded before sources existed as one typed in', async () => {
  const checkId = await insertCheck();
  await database.client().query(insertRun, [checkId]);

  const rows = await database
    .client()
    .query<{ source: string }>('SELECT source FROM test_runs');

  expect(rows.rows.map((row) => row.source)).toEqual(['hand']);
});
