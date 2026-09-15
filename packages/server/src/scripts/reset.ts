// pnpm db:reset
//
// Drops the development database, creates it again empty, and reapplies every
// migration. Everything in it is lost. The test database is not touched.

import '../environment.ts';

import { loadDatabaseConfig } from '../config.ts';
import { databaseName, recreateDatabase } from '../database/databases.ts';
import { applyMigrations } from '../database/migrations.ts';
import { describeApplied } from './report.ts';

const { databaseUrl } = loadDatabaseConfig();
const name = databaseName(databaseUrl);

await recreateDatabase(databaseUrl);
console.log(`Dropped and recreated ${name}.`);
console.log(describeApplied(await applyMigrations({ databaseUrl })));
