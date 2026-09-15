import { expect, it } from 'vitest';

import { seedChecks, seedWorkspace } from '../database/seed.ts';
import { get, post, query } from '../testing/graphql.ts';
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

interface CheckSummaryFields {
  readonly id: string;
  readonly name: string;
  readonly area: string;
  readonly status: string;
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

  const { checks } = await query<{ checks: CheckSummaryFields[] }>(
    server,
    `{ checks { ${checkSummaryFields} } }`,
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

  const { checks } = await query<{ checks: { name: string }[] }>(
    server,
    '{ checks { name } }',
  );

  const names = checks.map((check) => check.name);
  expect(names).toStrictEqual([...names].sort());
});

it('reports the counts and dates that travel beside a status', async () => {
  const server = await seededServer();

  const { checks } = await query<{ checks: CheckSummaryFields[] }>(
    server,
    `{ checks { ${checkSummaryFields} } }`,
  );

  const broken = checks.find(
    (check) => check.name === 'No focused tests left behind',
  );
  // Two runs, the first caught and the latest missed, so the check is Broken
  // and still has a catch to report from before it was.
  expect(broken).toMatchObject({
    status: 'BROKEN',
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
    lastArmed: null,
    lastSeenArmedOn: null,
  });
});

it('returns one check by id, with its runs newest first', async () => {
  const server = await seededServer();

  const { checks } = await query<{ checks: { id: string; name: string }[] }>(
    server,
    '{ checks { id name } }',
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

  const { checks } = await query<{
    checks: {
      name: string;
      armingObservations: { observedOn: string; armed: boolean }[];
    }[];
  }>(server, '{ checks { name armingObservations { observedOn armed } } }');

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

  const { checks } = await query<{
    checks: { name: string; runs: { id: string }[] }[];
  }>(server, '{ checks { name runs { id } } }');

  const neverRun = checks.find(
    (check) => check.name === 'Commit message format',
  );
  expect(neverRun?.runs).toStrictEqual([]);
});

it('counts the statuses, and the five add up to the total', async () => {
  const server = await seededServer();

  const { statusCounts, checks } = await query<{
    statusCounts: {
      proven: number;
      unproven: number;
      stale: number;
      unarmed: number;
      broken: number;
      total: number;
    };
    checks: { status: string }[];
  }>(
    server,
    `{
       statusCounts { proven unproven stale unarmed broken total }
       checks { status }
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

  const { body } = await post(server, '{ checks { opinion } }');

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
