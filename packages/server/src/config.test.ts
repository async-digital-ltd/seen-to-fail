import { expect, it } from 'vitest';

import { type Environment, loadDatabaseConfig } from './config.ts';

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
