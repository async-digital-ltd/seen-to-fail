import { expect, it } from 'vitest';

import { loadDatabaseConfig } from '../config.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { databaseName } from './databases.ts';

/**
 * The example the other database-backed tests will be written from. One line
 * wires the file to the test database: migrations are applied before the first
 * test, and every table is emptied before each one.
 */
const database = useTestDatabase();

it('has the project migrations applied to the test database', async () => {
  const recorded = await database
    .client()
    .query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename',
    );

  expect(recorded.rows.map((row) => row.filename)).toContain(
    '0001_initial.sql',
  );
});

it('connects to the test database and not the development one', async () => {
  const { databaseUrl, testDatabaseUrl } = loadDatabaseConfig();
  const current = await database
    .client()
    .query<{ name: string }>('SELECT current_database() AS name');

  const connected = current.rows[0]?.name;
  expect(connected).toBe(databaseName(testDatabaseUrl));
  // Fails if both URLs have been pointed at one database, which would let the
  // truncation between tests empty the development data.
  expect(connected).not.toBe(databaseName(databaseUrl));
});
