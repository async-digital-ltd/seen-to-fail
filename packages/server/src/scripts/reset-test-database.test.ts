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
 *
 * The foot of the file holds `pnpm db:reset` beside it to the refusal of two
 * variables that name one database, in the same way.
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

/** Two more, for the refusals at the foot of the file. */
const sharedProbe = probeUrl('reset_probe_shared');
const otherProbe = probeUrl('reset_probe_other');

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
 * Runs a script in this folder with both variables set, which is what it
 * reads. An exported variable wins over the same name in .env, so a
 * developer's .env cannot point the child anywhere else.
 */
async function exitCodeOf(
  script: string,
  databaseUrl: string,
  testDatabaseUrl: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(scripts, script)], {
      stdio: 'ignore',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
      },
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === null) {
        reject(new Error(`${script} was killed rather than exiting.`));
        return;
      }
      resolve(code);
    });
  });
}

/** Creates the database afresh, holding the marker table and nothing else. */
async function plantMarker(databaseUrl: string): Promise<void> {
  await recreateDatabase(databaseUrl);
  await withClient(databaseUrl, async (client) => {
    await client.query(`CREATE TABLE ${quoteIdentifier(marker)} (id int)`);
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
    await plantMarker(url);
  }
  exitCode = await exitCodeOf(
    'reset-test-database.ts',
    developmentProbe,
    testProbe,
  );
});

afterAll(async () => {
  for (const url of [developmentProbe, testProbe, sharedProbe, otherProbe]) {
    await dropDatabase(url);
  }
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

/**
 * Both resets refuse to run when the two variables name one database (#156).
 * The configuration is read through `loadDatabaseConfig`, which refuses it, so
 * the script exits 1 and the database keeps its marker.
 *
 * Each refusal is paired with the same script handed two databases, which
 * drops the one it resets. That is what makes a surviving marker mean the
 * reset was refused, rather than that it never reached the database at all.
 */
const resets = [
  ['pnpm db:reset', 'reset.ts', 'DATABASE_URL'],
  ['pnpm db:test:reset', 'reset-test-database.ts', 'TEST_DATABASE_URL'],
] as const;

for (const [command, script, variable] of resets) {
  it(`${command} drops the database ${variable} names when the two differ`, async () => {
    await plantMarker(sharedProbe);
    await plantMarker(otherProbe);

    const code =
      variable === 'DATABASE_URL'
        ? await exitCodeOf(script, sharedProbe, otherProbe)
        : await exitCodeOf(script, otherProbe, sharedProbe);

    expect(code).toBe(0);
    expect(await tablesNamed(sharedProbe, marker)).toBe(0);
    expect(await tablesNamed(otherProbe, marker)).toBe(1);
  });

  it(`${command} exits 1 and drops nothing when both variables name one database`, async () => {
    await plantMarker(sharedProbe);

    expect(await exitCodeOf(script, sharedProbe, sharedProbe)).toBe(1);
    expect(await tablesNamed(sharedProbe, marker)).toBe(1);
  });
}
