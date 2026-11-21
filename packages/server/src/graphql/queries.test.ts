import { expect, it } from 'vitest';

import { seedChecks, seedWorkspace } from '../database/seed.ts';
import { get, post, query } from '../testing/graphql.ts';
import { STALE_AFTER_DAYS } from '../staleness.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { statusName } from './enums.ts';
import { createGraphQLServer, healthRoute, readinessRoute } from './server.ts';

/**
 * The three queries, answered over HTTP from a real PostgreSQL holding the
 * invented workspace.
 *
 * The workspace is the seed rather than fixtures written here, because the seed
 * already claims to reach all five statuses and its own test already proves
 * that claim against the derivation. Reusing it means these tests are about the
 * API, not about a second workspace that would have to be kept in step with the
 * first.
 *
 * Nothing pins a day. The seed dates its workspace back from the day it is
 * loaded and returns that day, and the server is told to read as of it, so the
 * two cannot fall either side of midnight.
 */
const database = useTestDatabase();

/** Loads the workspace and points a server at it, reading as of the same day. */
async function seededServer(): Promise<ReturnType<typeof createGraphQLServer>> {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);
  return createGraphQLServer({ database: client, asOf });
}

/** What the list query answers with, for whichever fields of a check it asks. */
interface Listed<Fields> {
  readonly checks: { readonly checks: Fields[] };
}

interface CheckSummaryFields {
  readonly id: string;
  readonly name: string;
  readonly area: string;
  readonly status: string;
  readonly statusFrom: string;
  readonly lastCaughtOn: string | null;
  readonly lastRunOn: string | null;
  readonly runCount: number;
  readonly caughtCount: number;
  readonly missedCount: number;
  readonly lastSeenArmedOn: string | null;
  readonly lastArmed: boolean | null;
}

const checkSummaryFields = `
  id
  name
  area
  status
  statusFrom
  lastCaughtOn
  lastRunOn
  runCount
  caughtCount
  missedCount
  lastSeenArmedOn
  lastArmed
`;

const aDayWrittenOut = /^\d{4}-\d{2}-\d{2}$/;

it('lists the eight checks of the workspace, with the statuses it claims', async () => {
  const server = await seededServer();

  const {
    checks: { checks },
  } = await query<Listed<CheckSummaryFields>>(
    server,
    `{ checks { checks { ${checkSummaryFields} } } }`,
  );

  expect(checks).toHaveLength(seedChecks.length);

  const statusByName = new Map(
    checks.map((check) => [check.name, check.status]),
  );
  for (const seeded of seedChecks) {
    expect(statusByName.get(seeded.name)).toBe(
      statusName(seeded.intendedStatus),
    );
  }
});

it('lists the checks by name', async () => {
  const server = await seededServer();

  const {
    checks: { checks },
  } = await query<Listed<{ name: string }>>(
    server,
    '{ checks { checks { name } } }',
  );

  const names = checks.map((check) => check.name);
  expect(names).toStrictEqual([...names].sort());
});

it('reports the counts and dates that travel beside a status', async () => {
  const server = await seededServer();

  const {
    checks: { checks },
  } = await query<Listed<CheckSummaryFields>>(
    server,
    `{ checks { checks { ${checkSummaryFields} } } }`,
  );

  const broken = checks.find(
    (check) => check.name === 'No focused tests left behind',
  );
  // Two runs, the first caught and the latest missed, so the check is Broken
  // and still has a catch to report from before it was.
  expect(broken).toMatchObject({
    status: 'BROKEN',
    statusFrom: 'TEST_RUN',
    runCount: 2,
    caughtCount: 1,
    missedCount: 1,
    lastArmed: true,
  });
  expect(broken?.lastCaughtOn).toMatch(aDayWrittenOut);
  expect(broken?.lastRunOn).toMatch(aDayWrittenOut);
  expect(broken?.lastCaughtOn).not.toBe(broken?.lastRunOn);

  const neverRun = checks.find(
    (check) => check.name === 'Commit message format',
  );
  // Seen switched on and never planted for, so every run field is empty and
  // null means "nothing recorded" rather than zero.
  expect(neverRun).toMatchObject({
    status: 'UNPROVEN',
    statusFrom: 'OBSERVATION',
    runCount: 0,
    caughtCount: 0,
    missedCount: 0,
    lastCaughtOn: null,
    lastRunOn: null,
    lastArmed: true,
  });

  const nothingRecorded = checks.find(
    (check) => check.name === 'Release notes present',
  );
  // Nobody has ever looked at this one, which is not the same as looking and
  // finding it off. Null is what says so.
  expect(nothingRecorded).toMatchObject({
    status: 'UNARMED',
    statusFrom: 'NOTHING',
    lastArmed: null,
    lastSeenArmedOn: null,
  });
});

it('returns one check by id, with its runs newest first', async () => {
  const server = await seededServer();

  const {
    checks: { checks },
  } = await query<Listed<{ id: string; name: string }>>(
    server,
    '{ checks { checks { id name } } }',
  );
  const wanted = checks.find(
    (check) => check.name === 'Translations complete before release',
  );
  expect(wanted).toBeDefined();

  const { check } = await query<{
    check: {
      name: string;
      status: string;
      runs: { runOn: string; outcome: string; note: string | null }[];
    } | null;
  }>(
    server,
    `{ check(id: "${wanted?.id ?? ''}") {
        name
        status
        runs { runOn outcome note }
      } }`,
  );

  expect(check?.name).toBe('Translations complete before release');
  // Seeded as a missed run and then a catch fifteen days later. Newest first
  // puts the catch in front, which is also the run the status was derived from.
  expect(check?.runs.map((run) => run.outcome)).toStrictEqual([
    'CAUGHT',
    'MISSED',
  ]);
  const days = check?.runs.map((run) => run.runOn) ?? [];
  expect(days).toHaveLength(2);
  expect(days.every((day) => aDayWrittenOut.test(day))).toBe(true);
  expect([...days].sort().reverse()).toStrictEqual(days);
  expect(check?.runs[1]?.note).toBe('It went out untranslated.');
});

it('returns arming observations newest first, and an empty list for none', async () => {
  const server = await seededServer();

  const {
    checks: { checks },
  } = await query<
    Listed<{
      name: string;
      armingObservations: { observedOn: string; armed: boolean }[];
    }>
  >(
    server,
    '{ checks { checks { name armingObservations { observedOn armed } } } }',
  );

  const switchedOff = checks.find(
    (check) => check.name === 'Dependency licence allow-list',
  );
  // Seen on forty-one days ago and off ten days ago. Newest first puts the
  // observation that decided the status in front.
  expect(
    switchedOff?.armingObservations.map((seen) => seen.armed),
  ).toStrictEqual([false, true]);

  const neverLookedAt = checks.find(
    (check) => check.name === 'Release notes present',
  );
  expect(neverLookedAt?.armingObservations).toStrictEqual([]);
});

it('returns an empty list of runs for a check nothing was planted for', async () => {
  const server = await seededServer();

  const {
    checks: { checks },
  } = await query<Listed<{ name: string; runs: { id: string }[] }>>(
    server,
    '{ checks { checks { name runs { id } } } }',
  );

  const neverRun = checks.find(
    (check) => check.name === 'Commit message format',
  );
  expect(neverRun?.runs).toStrictEqual([]);
});

it('counts the statuses, and the five add up to the total', async () => {
  const server = await seededServer();

  const {
    statusCounts,
    checks: { checks },
  } = await query<
    {
      statusCounts: {
        proven: number;
        unproven: number;
        stale: number;
        unarmed: number;
        broken: number;
        total: number;
      };
    } & Listed<{ status: string }>
  >(
    server,
    `{
       statusCounts { proven unproven stale unarmed broken total }
       checks { checks { status } }
     }`,
  );

  const { proven, unproven, stale, unarmed, broken, total } = statusCounts;
  expect(proven + unproven + stale + unarmed + broken).toBe(total);
  expect(total).toBe(seedChecks.length);

  // The counts are a second reading of the same workspace, so they have to
  // agree with the list rather than merely add up.
  const tally = new Map<string, number>();
  for (const check of checks) {
    tally.set(check.status, (tally.get(check.status) ?? 0) + 1);
  }
  expect(proven).toBe(tally.get('PROVEN') ?? 0);
  expect(unproven).toBe(tally.get('UNPROVEN') ?? 0);
  expect(stale).toBe(tally.get('STALE') ?? 0);
  expect(unarmed).toBe(tally.get('UNARMED') ?? 0);
  expect(broken).toBe(tally.get('BROKEN') ?? 0);
});

it('counts every status, including the ones no check holds', async () => {
  const server = createGraphQLServer({ database: database.client() });

  const { statusCounts } = await query<{
    statusCounts: Record<string, number>;
  }>(server, '{ statusCounts { proven unproven stale unarmed broken total } }');

  // An empty workspace. Every tile still has a number, so nothing downstream
  // has to decide what a missing count means.
  expect(statusCounts).toStrictEqual({
    proven: 0,
    unproven: 0,
    stale: 0,
    unarmed: 0,
    broken: 0,
    total: 0,
  });
});

it('says the staleness threshold it derived every status with', async () => {
  const read = async (server: ReturnType<typeof createGraphQLServer>) =>
    (await query<{ staleAfterDays: number }>(server, '{ staleAfterDays }'))
      .staleAfterDays;

  expect(await read(createGraphQLServer({ database: database.client() }))).toBe(
    STALE_AFTER_DAYS,
  );
  expect(
    await read(
      createGraphQLServer({ database: database.client(), staleAfterDays: 45 }),
    ),
  ).toBe(45);
});

it('answers with null for an id nothing is recorded under', async () => {
  const server = await seededServer();

  const { status, body } = await post<{ check: unknown }>(
    server,
    '{ check(id: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d") { name } }',
  );

  expect(status).toBe(200);
  expect(body.errors).toBeUndefined();
  expect(body.data?.check).toBeNull();
});

it('answers with null, rather than an error, for an id that is not one', async () => {
  const server = await seededServer();

  const { status, body } = await post<{ check: unknown }>(
    server,
    '{ check(id: "not-an-id") { name } }',
  );

  // The database would refuse text that is not a uuid, and the reader standing
  // in front of a page that is not there gets the same answer either way.
  expect(status).toBe(200);
  expect(body.errors).toBeUndefined();
  expect(body.data?.check).toBeNull();
});

it('refuses a field the schema does not have', async () => {
  const server = await seededServer();

  const { body } = await post(server, '{ checks { checks { opinion } } }');

  expect(body.errors?.[0]?.message).toContain('opinion');
});

it('says it is alive on the health route', async () => {
  const server = await seededServer();

  const response = await get(server, healthRoute);

  expect(response.status).toBe(200);
});

it('says it is ready once the database answers', async () => {
  const server = await seededServer();

  const response = await get(server, readinessRoute);

  expect(response.status).toBe(200);
});

it('says it is not ready when the database does not answer', async () => {
  const server = createGraphQLServer({
    database: {
      query: () => Promise.reject(new Error('the database is not there')),
    },
  });

  const response = await get(server, readinessRoute);

  // The point of the route. A server that answered 200 here while unable to
  // read anything would be a check that has never been seen to catch anything.
  expect(response.status).toBe(503);
});

it('passes on nothing the database said when it is not ready', async () => {
  const server = createGraphQLServer({
    database: {
      query: () =>
        Promise.reject(new Error('database "seen_to_fail_dev" does not exist')),
    },
  });

  const response = await get(server, readinessRoute);

  // The route answers under any name (#192), so whatever is in this body can
  // be read by a page whose own name was pointed at 127.0.0.1. The driver's
  // message names the database; the status already says it is not ready
  // (#197).
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('');
});

/**
 * What each run did and where it came from, read back through the same path a
 * page reads it on: the check's own query, through the loader, rather than out
 * of the write that made it.
 *
 * The answers come from two different checks in the seeded workspace, so a
 * server that answered the same thing to both would fail here. The replayed
 * check's two runs are the other half of it: the newest settled nothing and
 * carries its reason, the one before it caught and carries none, and reading
 * either field off the wrong row would swap two values that are both really
 * there.
 */
it('says what each run did, why, and where it came from', async () => {
  const server = await seededServer();
  const {
    checks: { checks },
  } = await query<
    Listed<{
      name: string;
      runs: {
        outcome: string;
        inconclusiveReason: string | null;
        source: string;
        sourceCommit: string | null;
        sourceRunUrl: string | null;
      }[];
    }>
  >(
    server,
    `{ checks { checks { name runs {
       outcome inconclusiveReason source sourceCommit sourceRunUrl
     } } } }`,
  );

  const replayed = checks.find(
    (check) => check.name === 'Type check on every pull request',
  );
  // Newest first, so the run that settled nothing is the first of the two.
  expect(replayed?.runs).toStrictEqual([
    {
      outcome: 'INCONCLUSIVE',
      inconclusiveReason:
        'The anchor matches 0 times in the file and has to match exactly ' +
        'once, so nothing was broken and the check was never put to the test.',
      source: 'REPLAY',
      sourceCommit: '7c2b8e1d4a6f3b9e0d5c2a8f4b1e7d3c9a6f2b8e',
      sourceRunUrl: 'https://example.com/ci/runs/9037',
    },
    {
      outcome: 'CAUGHT',
      inconclusiveReason: null,
      source: 'REPLAY',
      sourceCommit: '4f1d0c2a9b7e5f3a1c8d6b4e2f0a9c7d5b3e1f0a',
      sourceRunUrl: 'https://example.com/ci/runs/8412',
    },
  ]);

  const typedIn = checks.find(
    (check) => check.name === 'Secrets never committed',
  );
  expect(typedIn?.runs).toStrictEqual([
    {
      outcome: 'CAUGHT',
      inconclusiveReason: null,
      source: 'HAND',
      sourceCommit: null,
      sourceRunUrl: null,
    },
  ]);
});

/**
 * The kinds of defect a check has been seen to catch (#295), through the API:
 * each kind once, in the order PlantKind lists them, from caught runs only.
 * A run's own kind reads null where nobody declared one.
 */
it('lists the kinds each check has been seen to catch, and none for a check with no catch', async () => {
  const client = database.client();
  const checkIds: string[] = [];
  for (const name of ['Caught two kinds', 'Caught no declared kind']) {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO checks (name, area, protects, how_to_tell_armed)
       VALUES ($1, 'CI', '', '') RETURNING id`,
      [name],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined) {
      throw new Error('Inserting a check returned no id.');
    }
    checkIds.push(id);
  }
  const [both, none] = checkIds;
  const runs: [string | undefined, string, string | null][] = [
    [both, 'caught', 'security'],
    [both, 'caught', 'wrong-answer'],
    [both, 'missed', 'crash'],
    [none, 'missed', 'crash'],
    [none, 'caught', null],
  ];
  for (const [checkId, outcome, kind] of runs) {
    await client.query(
      `INSERT INTO test_runs
         (check_id, run_on, planted, expected, outcome, source, plant_kind)
       VALUES ($1, '2026-03-01', 'A plant', 'It fails', $2, 'hand', $3)`,
      [checkId, outcome, kind],
    );
  }
  const server = createGraphQLServer({ database: client, asOf: '2026-03-02' });

  const {
    checks: { checks },
  } = await query<
    Listed<{
      name: string;
      kindsCaught: string[];
      runs: { kind: string | null }[];
    }>
  >(server, '{ checks { checks { name kindsCaught runs { kind } } } }');

  const byName = new Map(checks.map((check) => [check.name, check]));
  expect(byName.get('Caught two kinds')?.kindsCaught).toStrictEqual([
    'WRONG_ANSWER',
    'SECURITY',
  ]);
  expect(byName.get('Caught no declared kind')?.kindsCaught).toStrictEqual([]);
  expect(
    byName
      .get('Caught no declared kind')
      ?.runs.map((run) => run.kind)
      .sort(),
  ).toStrictEqual(['CRASH', null]);
});

/**
 * The tool and version that scored a replay (#101), through the API, and null
 * for both on a run typed in by hand.
 */
it('reads the tool and version that scored a replay, and null for a hand run', async () => {
  const client = database.client();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ('Replayed', 'CI', '', '') RETURNING id`,
  );
  const checkId = inserted.rows[0]?.id;
  await client.query(
    `INSERT INTO test_runs
       (check_id, run_on, planted, expected, outcome, source,
        source_commit, source_run_url, tool, tool_version)
     VALUES ($1, '2026-03-01', 'Replayed', 'It fails', 'caught', 'replay',
             '1234567890abcdef1234567890abcdef12345678',
             'https://ci.example.com/runs/91', 'canfail', '0.2.1'),
            ($1, '2026-03-01', 'Typed in', 'It fails', 'caught', 'hand',
             NULL, NULL, NULL, NULL)`,
    [checkId],
  );
  const server = createGraphQLServer({ database: client, asOf: '2026-03-02' });

  const {
    checks: { checks },
  } = await query<
    Listed<{
      runs: {
        planted: string;
        tool: string | null;
        toolVersion: string | null;
      }[];
    }>
  >(server, '{ checks { checks { runs { planted tool toolVersion } } } }');

  const runs = new Map(
    checks[0]?.runs.map((run) => [run.planted, [run.tool, run.toolVersion]]),
  );
  expect(runs.get('Replayed')).toStrictEqual(['canfail', '0.2.1']);
  expect(runs.get('Typed in')).toStrictEqual([null, null]);
});
