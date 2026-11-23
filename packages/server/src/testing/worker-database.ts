import { randomUUID } from 'node:crypto';

import { Client } from 'pg';
import { it } from 'vitest';

import { loadDatabaseConfig } from '../config.ts';
import { quoteIdentifier } from '../database/identifiers.ts';

const databaseTest = it.extend(
  'workerDatabaseUrl',
  { scope: 'worker' },
  // eslint-disable-next-line no-empty-pattern -- Vitest parses this pattern to find fixture dependencies.
  async ({}, { onCleanup }) => {
    const { testDatabaseUrl } = loadDatabaseConfig();
    const url = new URL(testDatabaseUrl);
    url.searchParams.delete('database');
    url.pathname = '/postgres';
    const admin = new Client({ connectionString: url.toString() });
    await admin.connect();
    const name = 'stf_worker_' + randomUUID().replaceAll('-', '');
    try {
      await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
    } catch (error) {
      await admin.end();
      throw error;
    }
    onCleanup(async () => {
      try {
        await admin.query(
          `DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`,
        );
      } finally {
        await admin.end();
      }
    });
    url.pathname = '/' + name;
    return url.toString();
  },
);

/** Direct clients and the test helper both read the worker's URL inside these hooks. */
export function useWorkerDatabase(): void {
  databaseTest.aroundAll(async (runSuite, { workerDatabaseUrl }) => {
    const { testDatabaseUrl } = loadDatabaseConfig();
    process.env.TEST_DATABASE_URL = workerDatabaseUrl;
    try {
      await runSuite();
    } finally {
      process.env.TEST_DATABASE_URL = testDatabaseUrl;
    }
  });
}
