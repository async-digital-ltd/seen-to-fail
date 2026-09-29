/**
 * The environment the server needs, read in one place and checked when it is
 * read rather than when it is used.
 *
 * A missing variable is a setup mistake, not a runtime condition, so there is
 * no default and no fallback: the failure names the variable that is absent and
 * stops. Every variable read here is listed in .env.example.
 */

import { databaseName } from './database/databases.ts';

/** A read-only view of an environment, so tests can pass one in. */
export type Environment = Readonly<Record<string, string | undefined>>;

export interface DatabaseConfig {
  /** The database the application reads and writes. */
  readonly databaseUrl: string;
  /**
   * The database the tests own. It is truncated between tests, so it must
   * never be the same database as databaseUrl, and `loadDatabaseConfig`
   * refuses the two naming one.
   */
  readonly testDatabaseUrl: string;
}

/** Thrown when a variable the server cannot run without is absent or blank. */
export class MissingEnvironmentVariableError extends Error {
  readonly variableName: string;

  constructor(variableName: string) {
    super(
      `${variableName} is not set. Copy .env.example to .env and fill it in, ` +
        `or set ${variableName} in the environment.`,
    );
    this.name = 'MissingEnvironmentVariableError';
    this.variableName = variableName;
  }
}

function readRequired(environment: Environment, name: string): string {
  const value = environment[name];
  if (value === undefined || value.trim() === '') {
    throw new MissingEnvironmentVariableError(name);
  }
  return value;
}

/** Thrown when a database URL cannot be read as one. */
export class InvalidDatabaseUrlError extends Error {
  readonly variableName: string;

  constructor(variableName: string, cause: unknown) {
    // The URL itself is left out, because it carries the password.
    super(`${variableName} is not a URL that names a database.`, { cause });
    this.name = 'InvalidDatabaseUrlError';
    this.variableName = variableName;
  }
}

/**
 * Thrown when the two URLs name the same database.
 *
 * The suite empties the test database between tests and `pnpm db:test:reset`
 * drops it, so a test database that is also the development one loses the
 * development data to either, and both would exit 0 (#156).
 */
export class SharedDatabaseError extends Error {
  constructor(where: DatabaseAddress) {
    super(
      `DATABASE_URL and TEST_DATABASE_URL both name the database ` +
        `${where.name} on ${where.host}:${where.port}. The test database is ` +
        `emptied between tests and dropped by pnpm db:test:reset, so it has ` +
        `to be a database of its own: point TEST_DATABASE_URL at another one.`,
    );
    this.name = 'SharedDatabaseError';
  }
}

/**
 * The server a URL reaches and the database it names there. Two URLs whose
 * addresses are equal name the same database.
 */
interface DatabaseAddress {
  readonly host: string;
  readonly port: string;
  readonly name: string;
}

/**
 * The driver's own defaults for a URL that leaves the host or the port out,
 * when PGHOST and PGPORT are not set.
 */
const defaultHost = 'localhost';
const defaultPort = '5432';

/**
 * Where a URL points, read the way the driver reads it, so far as that can be
 * done without a connection.
 *
 * - The host is compared in lower case, because a host name is not case
 *   sensitive and a `postgresql:` URL's host is kept as it was typed. A `host`
 *   query parameter stands in for it, because the driver reads that first,
 *   and a URL with neither means localhost.
 * - The port is compared as the URL parser writes it, which drops leading
 *   zeros. A `port` query parameter stands in for it as for the host, and a
 *   URL with neither means 5432.
 * - The database name is read by `databaseName`, the function the resets use
 *   to choose what they drop, so what is compared is what would be dropped.
 *
 * The user and the password are not compared: one database reached as two
 * users is still one database.
 *
 * What this cannot see is two spellings of one server. `localhost`,
 * `127.0.0.1`, `::1`, the machine's own name and a socket directory can all
 * reach the same PostgreSQL, and nothing short of connecting to both would tell.
 * It also takes the two defaults above as fixed, so with PGHOST or PGPORT set
 * a URL that leaves the host or port out is read as localhost or 5432 when the
 * driver would use the variable instead.
 */
function databaseAddress(variableName: string, url: string): DatabaseAddress {
  try {
    const parsed = new URL(url);
    const host =
      parsed.searchParams.get('host') ??
      (parsed.hostname === '' ? defaultHost : parsed.hostname);
    const port =
      parsed.searchParams.get('port') ??
      (parsed.port === '' ? defaultPort : parsed.port);
    return {
      host: host.toLowerCase(),
      port,
      name: databaseName(url),
    };
  } catch (cause) {
    throw new InvalidDatabaseUrlError(variableName, cause);
  }
}

/**
 * Reads the database configuration, throwing on the first variable that is
 * missing. Both URLs are required together so that a run is either fully
 * configured or stops before it touches a database.
 *
 * It also refuses the two URLs naming one database, which is what makes the
 * rule on `testDatabaseUrl` hold rather than rest on a comment. Every command
 * that reaches a database reads its URL here, so the refusal comes before any
 * of them connects.
 */
export function loadDatabaseConfig(
  environment: Environment = process.env,
): DatabaseConfig {
  const databaseUrl = readRequired(environment, 'DATABASE_URL');
  const testDatabaseUrl = readRequired(environment, 'TEST_DATABASE_URL');

  const development = databaseAddress('DATABASE_URL', databaseUrl);
  const test = databaseAddress('TEST_DATABASE_URL', testDatabaseUrl);
  if (
    development.host === test.host &&
    development.port === test.port &&
    development.name === test.name
  ) {
    throw new SharedDatabaseError(test);
  }

  return { databaseUrl, testDatabaseUrl };
}
