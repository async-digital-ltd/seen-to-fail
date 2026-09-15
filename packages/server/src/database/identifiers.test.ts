import { expect, it } from 'vitest';

import { quoteIdentifier } from './identifiers.ts';

it('quotes a plain lower-case name', () => {
  expect(quoteIdentifier('schema_migrations')).toBe('"schema_migrations"');
});

it.each([
  'Checks',
  'test runs',
  'checks"; DROP TABLE checks --',
  '1checks',
  '',
])('refuses %j', (name) => {
  expect(() => quoteIdentifier(name)).toThrow(/identifier/);
});
