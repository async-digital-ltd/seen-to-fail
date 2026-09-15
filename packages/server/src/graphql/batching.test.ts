import { expect, it, vi } from 'vitest';

import { seedChecks, seedWorkspace } from '../database/seed.ts';
import { query } from '../testing/graphql.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { createGraphQLServer } from './server.ts';

/**
 * How many queries a request actually makes.
 *
 * This is the test the loader exists for. Every other test in this package
 * passes just as happily against a server that asks the database once per row,
 * because the answers are identical: the same checks, the same runs, the same
 * order. The only thing that tells the two apart is the count, and the count is
 * the thing that decides whether the list still works against a workspace of a
 * thousand checks rather than eight.
 *
 * Counted by watching the connection the server was handed, so what is measured
 * is statements that actually went to PostgreSQL rather than calls to a
 * function that might or might not have issued one. The spy is installed after
 * seeding, so the workspace being loaded is not counted.
 *
 * The control: switch the loader to dispatching each key on its own and this
 * test fails with a count of one per check plus one. It has been seen to do so.
 */
const database = useTestDatabase();

/** Statements the server issues while answering one document. */
async function queriesFor(document: string): Promise<number> {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);

  const watched = vi.spyOn(client, 'query');
  try {
    await query(createGraphQLServer({ database: client, asOf }), document);
    return watched.mock.calls.length;
  } finally {
    watched.mockRestore();
  }
}

it('reads the list of checks in one query', async () => {
  expect(
    await queriesFor('{ checks { checks { id name status runCount } } }'),
  ).toBe(1);
});

it('reads the list and how many checks it hides in the same one query', async () => {
  expect(await queriesFor('{ checks { checks { id } matching hidden } }')).toBe(
    1,
  );
});

it('reads the list with every run in two queries, not one per check', async () => {
  const queries = await queriesFor(
    '{ checks { checks { id runs { id outcome } } } }',
  );

  expect(queries).toBe(2);
  // Named so that a failure says what the alternative would have been. Eight
  // checks is what the seeded workspace holds, and nine is the count a loader
  // that had stopped batching would produce.
  expect(queries).toBeLessThan(1 + seedChecks.length);
});

it('reads the list with runs and observations in three queries', async () => {
  const queries = await queriesFor(
    '{ checks { checks { id runs { id } armingObservations { id } } } }',
  );

  expect(queries).toBe(3);
  expect(queries).toBeLessThan(1 + seedChecks.length * 2);
});

it('reads one check and everything under it in three queries', async () => {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);
  const server = createGraphQLServer({ database: client, asOf });

  const {
    checks: { checks },
  } = await query<{ checks: { checks: { id: string }[] } }>(
    server,
    '{ checks { checks { id } } }',
  );
  const id = checks[0]?.id ?? '';

  const watched = vi.spyOn(client, 'query');
  try {
    await query(
      server,
      `{ check(id: "${id}") { name runs { id } armingObservations { id } } }`,
    );
    expect(watched.mock.calls.length).toBe(3);
  } finally {
    watched.mockRestore();
  }
});

it('counts the statuses in one query', async () => {
  expect(
    await queriesFor(
      '{ statusCounts { proven unproven stale unarmed broken total } }',
    ),
  ).toBe(1);
});
