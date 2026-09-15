// pnpm db:migrate
//
// Applies every pending migration to the development database. Safe to run
// again: a second run has nothing to apply and says so.

import '../environment.ts';

import { loadDatabaseConfig } from '../config.ts';
import { databaseName } from '../database/databases.ts';
import { applyMigrations } from '../database/migrations.ts';
import { describeApplied } from './report.ts';

const { databaseUrl } = loadDatabaseConfig();

console.log(`Migrating ${databaseName(databaseUrl)}.`);
console.log(describeApplied(await applyMigrations({ databaseUrl })));
