import { STATUSES } from '@seen-to-fail/filter';
import { isEnumType } from 'graphql';
import { expect, it } from 'vitest';

import { testRunOutcomes } from '../database/rows.ts';
import { outcomeName, statusName } from './enums.ts';
import { buildSchema } from './schema.ts';

/**
 * The two vocabularies that cross the API boundary, pinned to the schema they
 * cross into.
 *
 * The maps in enums.ts are already held to the domain side by their types: a
 * status added to the filter package and not to the map fails to compile. What
 * a type cannot check is the other side, because the schema is a text file. So
 * these tests read both enums back out of the built schema and compare, which
 * catches the case the compiler cannot see: the map and the domain agreeing
 * with each other while the schema says something else.
 */
const schema = buildSchema();

/** The values of one of the schema's enums, by name. */
function schemaEnumValues(typeName: string): string[] {
  const type = schema.getType(typeName);
  if (!isEnumType(type)) {
    throw new Error(`The schema has no enum called ${typeName}.`);
  }
  return type.getValues().map((value) => value.name);
}

it('spells every status the way the schema does', () => {
  const spelled = STATUSES.map((status) => statusName(status));
  expect([...spelled].sort()).toStrictEqual(schemaEnumValues('Status').sort());
});

it('spells every outcome the way the schema does', () => {
  const spelled = testRunOutcomes.map((outcome) => outcomeName(outcome));
  expect([...spelled].sort()).toStrictEqual(schemaEnumValues('Outcome').sort());
});

it('gives each status a name of its own', () => {
  const spelled = STATUSES.map((status) => statusName(status));
  expect(new Set(spelled).size).toBe(STATUSES.length);
});

it('gives each outcome a name of its own', () => {
  const spelled = testRunOutcomes.map((outcome) => outcomeName(outcome));
  expect(new Set(spelled).size).toBe(testRunOutcomes.length);
});
