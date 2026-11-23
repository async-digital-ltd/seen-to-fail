// pnpm db:test:reset
//
// Drops the test database, creates it again empty, and reapplies every
// migration. Everything in it is lost. The development database is not touched.
//
// Vitest applies migrations in fresh worker databases. This command resets
// the persistent database named in the configuration.

import '../environment.ts';

import { loadDatabaseConfig } from '../config.ts';
import { databaseName, recreateDatabase } from '../database/databases.ts';
import { applyMigrations } from '../database/migrations.ts';
import { describeApplied } from './report.ts';

const { testDatabaseUrl } = loadDatabaseConfig();
const name = databaseName(testDatabaseUrl);

await recreateDatabase(testDatabaseUrl);
console.log(`Dropped and recreated ${name}.`);
console.log(
  describeApplied(await applyMigrations({ databaseUrl: testDatabaseUrl })),
);
