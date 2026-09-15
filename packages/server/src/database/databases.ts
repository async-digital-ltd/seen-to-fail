import { setTimeout as delay } from 'node:timers/promises';

import { Client } from 'pg';

import { quoteIdentifier } from './identifiers.ts';

/**
 * Creating or dropping a database has to be done from a connection to some
 * other database on the same server. This is the one every PostgreSQL install
 * has.
 */
const maintenanceDatabase = 'postgres';

interface Target {
  /** The database the URL points at. */
  readonly name: string;
  /** The same server, but connected to the maintenance database. */
  readonly maintenanceUrl: string;
}

/**
 * Splits a connection string into the database it names and a connection string
 * for the same server's maintenance database.
 *
 * Nothing here puts the URL itself into an error or a log, because it carries
 * the password.
 */
function target(databaseUrl: string): Target {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch (cause) {
    throw new Error('The database URL could not be parsed.', { cause });
  }

  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (name === '') {
    throw new Error('The database URL does not name a database.');
  }

  const maintenance = new URL(url);
  maintenance.pathname = `/${maintenanceDatabase}`;
  return { name, maintenanceUrl: maintenance.toString() };
}

/** The database a connection string points at, safe to print. */
export function databaseName(databaseUrl: string): string {
  return target(databaseUrl).name;
}

/**
 * Waits until the server behind the URL accepts a connection, which is not the
 * same moment as the service being asked to start.
 */
export async function waitForServer(
  databaseUrl: string,
  timeoutMilliseconds = 30_000,
): Promise<void> {
  const { maintenanceUrl } = target(databaseUrl);
  const deadline = Date.now() + timeoutMilliseconds;

  for (;;) {
    try {
      const client = new Client({ connectionString: maintenanceUrl });
      await client.connect();
      await client.end();
      return;
    } catch (cause) {
      if (Date.now() >= deadline) {
        throw new Error(
          'PostgreSQL did not accept a connection before the timeout.',
          { cause },
        );
      }
      await delay(250);
    }
  }
}

/**
 * Creates the database if it is not there. Returns whether it created one, so
 * the caller can say which of the two things happened.
 */
export async function createDatabaseIfMissing(
  databaseUrl: string,
): Promise<boolean> {
  const { name, maintenanceUrl } = target(databaseUrl);
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();

  try {
    const existing = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [name],
    );
    if (existing.rowCount !== null && existing.rowCount > 0) {
      return false;
    }
    await client.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
    return true;
  } finally {
    await client.end();
  }
}

/**
 * Drops the database and creates it again, empty.
 *
 * FORCE disconnects whatever is still attached, so a forgotten psql session
 * turns a reset into a dropped connection rather than a hang.
 */
export async function recreateDatabase(databaseUrl: string): Promise<void> {
  const { name, maintenanceUrl } = target(databaseUrl);
  const client = new Client({ connectionString: maintenanceUrl });
  await client.connect();

  try {
    await client.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`,
    );
    await client.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
  } finally {
    await client.end();
  }
}
