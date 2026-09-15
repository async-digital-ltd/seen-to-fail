// pnpm db:seed
//
// Loads the invented sample workspace into the development database. It empties
// the four tables first, so whatever was in them is lost and running it again
// is safe. The test database is not touched.

import '../environment.ts';

import { Client } from 'pg';

import { loadDatabaseConfig } from '../config.ts';
import { databaseName } from '../database/databases.ts';
import { seedWorkspace } from '../database/seed.ts';

const { databaseUrl } = loadDatabaseConfig();
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const result = await seedWorkspace(client);
  console.log(
    `Seeded ${databaseName(databaseUrl)} as of ${result.asOf}: ` +
      `${String(result.checkCount)} checks, ` +
      `${String(result.runCount)} test runs, ` +
      `${String(result.observationCount)} arming observations.`,
  );
} finally {
  await client.end();
}
