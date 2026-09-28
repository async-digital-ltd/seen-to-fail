import { expect, it } from 'vitest';

import {
  type Environment,
  InvalidDatabaseUrlError,
  loadDatabaseConfig,
  SharedDatabaseError,
} from './config.ts';

const complete: Environment = {
  DATABASE_URL: 'postgresql://example/dev',
  TEST_DATABASE_URL: 'postgresql://example/test',
};

it('reads both database URLs', () => {
  expect(loadDatabaseConfig(complete)).toEqual({
    databaseUrl: 'postgresql://example/dev',
    testDatabaseUrl: 'postgresql://example/test',
  });
});

it.each(['DATABASE_URL', 'TEST_DATABASE_URL'])(
  'names %s in the error when it is missing',
  (name) => {
    const environment: Environment = { ...complete, [name]: undefined };
    // \b keeps DATABASE_URL from matching inside TEST_DATABASE_URL, so this
    // fails if the error names the wrong variable rather than the absent one.
    expect(() => loadDatabaseConfig(environment)).toThrow(
      new RegExp(`\\b${name}\\b`),
    );
  },
);

it('treats a blank value as missing', () => {
  const environment: Environment = { ...complete, DATABASE_URL: '   ' };
  expect(() => loadDatabaseConfig(environment)).toThrow(/\bDATABASE_URL\b/);
});

/** What loadDatabaseConfig threw, or undefined when it returned. */
function thrownBy(environment: Environment): unknown {
  try {
    loadDatabaseConfig(environment);
  } catch (error) {
    return error;
  }
  return undefined;
}

/**
 * Pairs that name one database however they are written (#156). The first URL
 * is DATABASE_URL and the second TEST_DATABASE_URL.
 */
const oneDatabase: readonly (readonly [string, string, string])[] = [
  [
    'the same URL twice',
    'postgresql://localhost:5432/stf',
    'postgresql://localhost:5432/stf',
  ],
  [
    'two users with two passwords',
    'postgresql://dev:one@localhost:5432/stf',
    'postgresql://test:two@localhost:5432/stf',
  ],
  [
    'the port left out, and the default port',
    'postgresql://localhost/stf',
    'postgresql://localhost:5432/stf',
  ],
  [
    'the host left out, and localhost',
    'postgresql:///stf',
    'postgresql://localhost/stf',
  ],
  [
    'one host in two cases',
    'postgresql://DB.example/stf',
    'postgresql://db.example/stf',
  ],
  [
    'a host given as a query parameter',
    'postgresql://ignored/stf?host=/tmp',
    'postgresql:///stf?host=/tmp',
  ],
  [
    'a port given as a query parameter',
    'postgresql://localhost/stf?port=6543',
    'postgresql://localhost:6543/stf',
  ],
  [
    'a name with an escape in it',
    'postgresql://localhost/st%66',
    'postgresql://localhost/stf',
  ],
  [
    'other settings in the query',
    'postgresql://localhost/stf?sslmode=disable',
    'postgresql://localhost/stf',
  ],
];

for (const [name, databaseUrl, testDatabaseUrl] of oneDatabase) {
  it(`refuses ${name} as one database, naming both variables`, () => {
    const thrown = thrownBy({
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    });

    expect(thrown).toBeInstanceOf(SharedDatabaseError);
    const { message } = thrown as SharedDatabaseError;
    expect(message).toMatch(/\bDATABASE_URL\b/);
    expect(message).toMatch(/\bTEST_DATABASE_URL\b/);
  });
}

/** Pairs that differ in the host, the port or the database name. */
const twoDatabases: readonly (readonly [string, string, string])[] = [
  [
    'two names',
    'postgresql://localhost/stf_dev',
    'postgresql://localhost/stf_test',
  ],
  [
    'two ports',
    'postgresql://localhost:5432/stf',
    'postgresql://localhost:5433/stf',
  ],
  [
    'two hosts',
    'postgresql://db-one.example/stf',
    'postgresql://db-two.example/stf',
  ],
  [
    'one name in two cases, which PostgreSQL holds apart',
    'postgresql://localhost/stf',
    'postgresql://localhost/STF',
  ],
];

for (const [name, databaseUrl, testDatabaseUrl] of twoDatabases) {
  it(`accepts ${name}`, () => {
    expect(
      loadDatabaseConfig({
        DATABASE_URL: databaseUrl,
        TEST_DATABASE_URL: testDatabaseUrl,
      }),
    ).toEqual({ databaseUrl, testDatabaseUrl });
  });
}

it.each(['DATABASE_URL', 'TEST_DATABASE_URL'])(
  'names %s when its value is not a URL, or names no database',
  (name) => {
    for (const value of ['not a url', 'postgresql://localhost']) {
      const thrown = thrownBy({ ...complete, [name]: value });

      expect(thrown).toBeInstanceOf(InvalidDatabaseUrlError);
      expect((thrown as InvalidDatabaseUrlError).variableName).toBe(name);
    }
  },
);
