// pnpm ledger:build [-- --out <directory>]
//
// Turns the recorded ledger into the published page. It loads the records into
// the development database, reads every status back out of the same SQL
// function the running app reads, renders the page and the export, checks them
// against the records they came from, and only then writes anything.
//
// It replaces what is in that database, exactly as `pnpm db:seed` does. The
// ledger is the record in full, so a row left over from before would be
// published as though somebody had recorded it.

import '../environment.ts';

import { parseArgs } from 'node:util';

import { Client } from 'pg';

import { loadDatabaseConfig } from '../config.ts';
import { databaseName } from '../database/databases.ts';
import { todayInUtc } from '../day.ts';
import { buildLedger } from '../ledger/build.ts';
import {
  commitsThatAdded,
  currentCommit,
  repositoryFromOrigin,
} from '../ledger/commits.ts';
import {
  defaultOutputDirectory,
  ledgerDirectory,
  ledgerPath,
  repositoryRoot,
} from '../ledger/location.ts';
import { forwardedArguments } from './arguments.ts';

const { values } = parseArgs({
  args: forwardedArguments(),
  options: {
    out: { type: 'string' },
  },
});

/**
 * Which repository the commit links point into.
 *
 * GitHub Actions says so directly; a person running this locally has an origin
 * remote that says the same thing. A checkout with neither cannot be published
 * from, because every run's link back to the commit that recorded it would be
 * to nowhere.
 */
const repository =
  process.env.GITHUB_REPOSITORY ?? (await repositoryFromOrigin(repositoryRoot));
if (repository === null) {
  throw new Error(
    'This checkout has no origin remote and GITHUB_REPOSITORY is not set, so ' +
      'the published page has no repository to link its commits into.',
  );
}

const { databaseUrl } = loadDatabaseConfig();
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  const result = await buildLedger(client, {
    directory: ledgerDirectory,
    ledgerPath,
    outputDirectory: values.out ?? defaultOutputDirectory,
    repository,
    builtFrom: await currentCommit(repositoryRoot),
    recordingCommits: await commitsThatAdded(repositoryRoot, ledgerPath),
    asOf: todayInUtc(),
  });

  const runCount = result.ledger.checks.reduce(
    (total, check) => total + check.runs.length,
    0,
  );
  console.log(
    `Built ${String(result.ledger.checks.length)} checks and ` +
      `${String(runCount)} runs from ${ledgerPath}, ` +
      `derived in ${databaseName(databaseUrl)}, as of ${result.ledger.builtOn}.`,
  );
  for (const file of result.written) {
    console.log(`  ${file}`);
  }
} finally {
  await client.end();
}
