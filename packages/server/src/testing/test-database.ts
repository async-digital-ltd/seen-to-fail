import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import { type Environment, loadDatabaseConfig } from '../config.ts';
import { quoteIdentifier } from '../database/identifiers.ts';
import { applyMigrations, migrationsTable } from '../database/migrations.ts';

/**
 * Migrations are applied before the first test that asks for a database and not
 * again afterwards. A second call to the runner would apply nothing anyway,
 * this only saves the round trip.
 */
let migration: Promise<void> | undefined;

async function migrateOnce(databaseUrl: string): Promise<void> {
  migration ??= applyMigrations({ databaseUrl }).then(() => undefined);
  await migration;
}

/**
 * Empties every table, leaving the migration bookkeeping alone.
 *
 * Tables whose names start with the migrations table's are skipped: truncating
 * those would tell the runner that nothing had ever been applied, and the next
 * run would try to apply everything again over the top of itself.
 */
export async function truncateAllTables(client: Client): Promise<void> {
  const tables = await client.query<{ name: string }>(
    `SELECT tablename AS name
       FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE $1`,
    [`${migrationsTable}%`],
  );

  if (tables.rows.length === 0) {
    return;
  }

  const names = tables.rows.map((row) => quoteIdentifier(row.name)).join(', ');
  await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
}

/**
 * A connection to the test database, with its migrations applied.
 *
 * The URL is read through `loadDatabaseConfig`, which refuses a test database
 * that is also the development one before anything connects, so the truncation
 * between tests cannot reach development data (#156). The environment is a
 * parameter so that a test can hand it a configuration it has to refuse.
 */
export async function openTestDatabase(
  environment: Environment = process.env,
): Promise<Client> {
  const { testDatabaseUrl } = loadDatabaseConfig(environment);
  await migrateOnce(testDatabaseUrl);
  const connection = new Client({ connectionString: testDatabaseUrl });
  await connection.connect();
  return connection;
}

export interface TestDatabase {
  /** The connected client. Only callable from inside a test. */
  client: () => Client;
}

/**
 * Wires a test file to the test database: migrations applied, one connection
 * for the file, and every table emptied before each test so tests cannot see
 * each other's rows.
 *
 * It reads TEST_DATABASE_URL and never DATABASE_URL, so no test can reach the
 * development database however it is written.
 */
export function useTestDatabase(): TestDatabase {
  let open: Client | null = null;

  function client(): Client {
    if (open === null) {
      throw new Error(
        'The test database connection is only open inside a test.',
      );
    }
    return open;
  }

  beforeAll(async () => {
    open = await openTestDatabase();
  });

  beforeEach(async () => {
    await truncateAllTables(client());
  });

  afterAll(async () => {
    const connection = open;
    open = null;
    if (connection !== null) {
      await connection.end();
    }
  });

  return { client };
}
