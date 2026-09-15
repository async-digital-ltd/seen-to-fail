import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { loadDatabaseConfig } from '../config.ts';
import { quoteIdentifier } from './identifiers.ts';
import { applyMigrations } from './migrations.ts';

/**
 * The runner is exercised against fixture migrations in a temporary directory,
 * so these tests say nothing about the project's own migrations and do not
 * disturb them.
 *
 * Each test books its applied filenames into its own table. The names start
 * with schema_migrations because the test helper skips those when it empties
 * the database between tests, which is exactly what these tables need.
 */
const bookkeepingTables = [
  'schema_migrations_records',
  'schema_migrations_repeat',
  'schema_migrations_failure',
];

/** Tables the fixture migrations below create. */
const fixtureTables = ['fixture_widgets', 'fixture_broken_effect'];

let connection: Client | undefined;

function client(): Client {
  if (connection === undefined) {
    throw new Error('The test database connection is not open.');
  }
  return connection;
}

async function dropFixtures(): Promise<void> {
  for (const table of [...fixtureTables, ...bookkeepingTables]) {
    await client().query(`DROP TABLE IF EXISTS ${quoteIdentifier(table)}`);
  }
}

/** Writes fixture migrations to a fresh temporary directory. */
async function migrationDirectory(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'seen-to-fail-migrations-'));
  for (const [filename, sql] of Object.entries(files)) {
    await writeFile(join(directory, filename), sql, 'utf8');
  }
  return directory;
}

async function recordedFilenames(table: string): Promise<string[]> {
  const recorded = await client().query<{ filename: string }>(
    `SELECT filename FROM ${quoteIdentifier(table)} ORDER BY filename`,
  );
  return recorded.rows.map((row) => row.filename);
}

async function tableExists(name: string): Promise<boolean> {
  const found = await client().query<{ oid: string | null }>(
    'SELECT to_regclass($1)::text AS oid',
    [`public.${name}`],
  );
  return found.rows[0]?.oid != null;
}

beforeAll(async () => {
  const { testDatabaseUrl } = loadDatabaseConfig();
  const opened = new Client({ connectionString: testDatabaseUrl });
  await opened.connect();
  connection = opened;
  // A previous run that was killed part way through leaves tables behind, and
  // these tests have to pass twice in a row without anyone tidying up by hand.
  await dropFixtures();
});

afterAll(async () => {
  await dropFixtures();
  await client().end();
  connection = undefined;
});

it('applies a pending migration and records the filename', async () => {
  const { testDatabaseUrl } = loadDatabaseConfig();
  const directory = await migrationDirectory({
    '0001_widgets.sql':
      'CREATE TABLE fixture_widgets (id integer PRIMARY KEY);',
  });

  const applied = await applyMigrations({
    databaseUrl: testDatabaseUrl,
    directory,
    table: 'schema_migrations_records',
  });

  expect(applied).toEqual(['0001_widgets.sql']);
  expect(await recordedFilenames('schema_migrations_records')).toEqual([
    '0001_widgets.sql',
  ]);
  expect(await tableExists('fixture_widgets')).toBe(true);
});

it('applies nothing on a second run', async () => {
  const { testDatabaseUrl } = loadDatabaseConfig();
  const directory = await migrationDirectory({
    // A migration that creates nothing, like the project's own first one.
    '0001_marker.sql': '-- Creates nothing.\n',
  });
  const options = {
    databaseUrl: testDatabaseUrl,
    directory,
    table: 'schema_migrations_repeat',
  };

  expect(await applyMigrations(options)).toEqual(['0001_marker.sql']);
  expect(await applyMigrations(options)).toEqual([]);
  expect(await recordedFilenames('schema_migrations_repeat')).toEqual([
    '0001_marker.sql',
  ]);
});

it('rolls back a migration that fails and does not record it', async () => {
  const { testDatabaseUrl } = loadDatabaseConfig();
  const directory = await migrationDirectory({
    '0001_marker.sql': '-- Creates nothing.\n',
    // Creates a table, then fails. Both statements are in one transaction, so
    // neither the table nor the bookkeeping row should survive.
    '0002_broken.sql':
      'CREATE TABLE fixture_broken_effect (id integer PRIMARY KEY);\n' +
      'SELECT this_function_does_not_exist();\n',
  });

  await expect(
    applyMigrations({
      databaseUrl: testDatabaseUrl,
      directory,
      table: 'schema_migrations_failure',
    }),
  ).rejects.toThrow(/0002_broken\.sql/);

  expect(await recordedFilenames('schema_migrations_failure')).toEqual([
    '0001_marker.sql',
  ]);
  expect(await tableExists('fixture_broken_effect')).toBe(false);
});
