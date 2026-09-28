import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { loadDatabaseConfig } from '../config.ts';
import { databaseName, recreateDatabase } from '../database/databases.ts';
import { quoteIdentifier } from '../database/identifiers.ts';
import {
  migrationsDirectory,
  migrationsTable,
} from '../database/migrations.ts';

/**
 * `pnpm db:test:reset` drops a database with FORCE, so which database it drops
 * is the whole of what can go wrong with it. Pointed at DATABASE_URL instead of
 * TEST_DATABASE_URL it would still exit 0 and still print a database name, and
 * the development data would be gone.
 *
 * So the real script runs as its own process, handed two databases made for
 * this file as its two variables, each carrying a marker table. The one it was
 * told is the test database has to come back without the marker and with every
 * migration recorded; the one it was told is the development database has to
 * keep its marker.
 *
 * Neither is the suite's own test database, which the script would otherwise
 * drop out from under the file running it. Both are named after it with a
 * suffix, so they cannot be anybody else's.
 */

const scripts = fileURLToPath(new URL('.', import.meta.url));

const marker = 'reset_probe_marker';

/** The same server as the test database, with a database of its own. */
function probeUrl(suffix: string): string {
  const { testDatabaseUrl } = loadDatabaseConfig();
  const url = new URL(testDatabaseUrl);
  url.pathname = `/${databaseName(testDatabaseUrl)}_${suffix}`;
  return url.toString();
}

const developmentProbe = probeUrl('reset_probe_dev');
const testProbe = probeUrl('reset_probe_test');

async function withClient<T>(
  databaseUrl: string,
  work: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** How many tables in the database carry this name: 0 or 1. */
async function tablesNamed(
  databaseUrl: string,
  table: string,
): Promise<number> {
  return withClient(databaseUrl, async (client) => {
    const found = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM pg_tables
        WHERE schemaname = 'public' AND tablename = $1`,
      [table],
    );
    return Number(found.rows[0]?.count);
  });
}

/**
 * Runs the script with both variables set, which is what it reads. An exported
 * variable wins over the same name in .env, so a developer's .env cannot point
 * the child anywhere else.
 */
async function exitCodeOfReset(): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(scripts, 'reset-test-database.ts')],
      {
        stdio: 'ignore',
        env: {
          ...process.env,
          DATABASE_URL: developmentProbe,
          TEST_DATABASE_URL: testProbe,
        },
      },
    );
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === null) {
        reject(new Error('The reset was killed rather than exiting.'));
        return;
      }
      resolve(code);
    });
  });
}

async function dropDatabase(databaseUrl: string): Promise<void> {
  const maintenance = new URL(databaseUrl);
  maintenance.pathname = '/postgres';
  await withClient(maintenance.toString(), async (client) => {
    await client.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName(databaseUrl))} WITH (FORCE)`,
    );
  });
}

let exitCode: number | undefined;

beforeAll(async () => {
  for (const url of [developmentProbe, testProbe]) {
    await recreateDatabase(url);
    await withClient(url, async (client) => {
      await client.query(`CREATE TABLE ${quoteIdentifier(marker)} (id int)`);
    });
  }
  exitCode = await exitCodeOfReset();
});

afterAll(async () => {
  await dropDatabase(developmentProbe);
  await dropDatabase(testProbe);
});

it('exits 0', () => {
  expect(exitCode).toBe(0);
});

it('recreates the database TEST_DATABASE_URL names and records every migration in it', async () => {
  const files = (await readdir(migrationsDirectory)).filter((name) =>
    name.endsWith('.sql'),
  );

  expect(await tablesNamed(testProbe, marker)).toBe(0);
  const recorded = await withClient(testProbe, (client) =>
    client.query(`SELECT filename FROM ${quoteIdentifier(migrationsTable)}`),
  );
  expect(recorded.rowCount).toBe(files.length);
});

it('leaves the database DATABASE_URL names alone', async () => {
  expect(await tablesNamed(developmentProbe, marker)).toBe(1);
});
