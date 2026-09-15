// Run by scripts/db-up.sh, after the PostgreSQL service has been asked to
// start. Creates the development and test databases named in .env if the
// server does not have them yet, and leaves them alone if it does.

import '../environment.ts';

import { loadDatabaseConfig } from '../config.ts';
import {
  createDatabaseIfMissing,
  databaseName,
  waitForServer,
} from '../database/databases.ts';

const { databaseUrl, testDatabaseUrl } = loadDatabaseConfig();

await waitForServer(databaseUrl);

for (const url of [databaseUrl, testDatabaseUrl]) {
  const name = databaseName(url);
  const created = await createDatabaseIfMissing(url);
  console.log(created ? `Created ${name}.` : `${name} was already there.`);
}

console.log('Now run: pnpm db:migrate');
