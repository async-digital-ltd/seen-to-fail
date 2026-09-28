// pnpm db:test:reset
//
// Drops the test database, creates it again empty, and reapplies every
// migration. Everything in it is lost. The development database is not touched.
//
// It is how an edit to a migration that has already been applied reaches the
// database the tests run against. The runner records applied files by name and
// skips any name it has recorded, so after such an edit `pnpm db:migrate` and
// the test suite both apply nothing and exit 0, and the suite runs against the
// schema from before the edit. A defect planted in a migration to prove a guard
// needs this run first, or the plant never reaches the database and the suite
// passing looks like the guard surviving it.

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
