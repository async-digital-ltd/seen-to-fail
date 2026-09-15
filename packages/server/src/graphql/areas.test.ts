import { expect, it } from 'vitest';

import { seedChecks, seedWorkspace } from '../database/seed.ts';
import { query } from '../testing/graphql.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { createGraphQLServer } from './server.ts';

/**
 * The areas query: the areas the workspace's checks are in, each once, in
 * order. It reads the same table the list does, so what is worth proving here
 * is the once-each and the order, and that a workspace with no checks answers
 * with nothing rather than with an error.
 */
const database = useTestDatabase();

async function areasOf(
  server: ReturnType<typeof createGraphQLServer>,
): Promise<string[]> {
  const { areas } = await query<{ areas: string[] }>(server, '{ areas }');
  return areas;
}

it('lists each area of the seeded workspace once, ordered by name', async () => {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);
  const server = createGraphQLServer({ database: client, asOf });

  const areas = await areasOf(server);

  const expected = [...new Set(seedChecks.map((check) => check.area))].sort();
  expect(areas).toStrictEqual(expected);
  // The seed puts more than one check in some areas, so once-each is being
  // tested rather than being true of any list of the checks.
  expect(expected.length).toBeLessThan(seedChecks.length);
});

it('orders the areas by name, whatever order the checks were added in', async () => {
  const client = database.client();
  for (const area of ['Web', 'Api', 'Mail']) {
    await client.query(
      `INSERT INTO checks (name, area, protects, how_to_tell_armed)
       VALUES ($1, $2, '', '')`,
      [`A check in ${area}`, area],
    );
  }
  const server = createGraphQLServer({ database: client });

  expect(await areasOf(server)).toStrictEqual(['Api', 'Mail', 'Web']);
});

it('answers a workspace with no checks with no areas', async () => {
  const server = createGraphQLServer({ database: database.client() });

  expect(await areasOf(server)).toStrictEqual([]);
});
