/**
 * The environment the server needs, read in one place and checked when it is
 * read rather than when it is used.
 *
 * A missing variable is a setup mistake, not a runtime condition, so there is
 * no default and no fallback: the failure names the variable that is absent and
 * stops. Every variable read here is listed in .env.example.
 */

/** A read-only view of an environment, so tests can pass one in. */
export type Environment = Readonly<Record<string, string | undefined>>;

export interface DatabaseConfig {
  /** The database the application reads and writes. */
  readonly databaseUrl: string;
  /**
   * The database the tests own. It is truncated between tests, so it must
   * never be the same database as databaseUrl.
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

/**
 * Reads the database configuration, throwing on the first variable that is
 * missing. Both URLs are required together so that a run is either fully
 * configured or stops before it touches a database.
 */
export function loadDatabaseConfig(
  environment: Environment = process.env,
): DatabaseConfig {
  return {
    databaseUrl: readRequired(environment, 'DATABASE_URL'),
    testDatabaseUrl: readRequired(environment, 'TEST_DATABASE_URL'),
  };
}
