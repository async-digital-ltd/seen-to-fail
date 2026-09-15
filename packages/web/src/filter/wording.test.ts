import type { Condition } from '@seen-to-fail/filter';
import { describe, expect, it } from 'vitest';

import {
  conditionPhrase,
  describeCondition,
  FIELDS,
  operatorsOf,
} from './wording';

/** Every field-and-operator pair the language has, as a chip reads it. */
const everyOperator: readonly (readonly [Condition, string])[] = [
  [{ field: 'status', op: 'is', value: 'Proven' }, 'status is Proven'],
  [{ field: 'status', op: 'isNot', value: 'Proven' }, 'status is not Proven'],
  [{ field: 'area', op: 'is', value: 'CI' }, 'area is CI'],
  [
    { field: 'area', op: 'isNot', value: 'smoke tests' },
    'area is not smoke tests',
  ],
  [{ field: 'lastCaught', op: 'never' }, 'last caught never'],
  [
    { field: 'lastCaught', op: 'before', days: 30 },
    'last caught longer ago than 30 days',
  ],
  [
    { field: 'lastCaught', op: 'after', days: 1 },
    'last caught within the last 1 day',
  ],
  [{ field: 'runs', op: 'moreThan', count: 5 }, 'runs more than 5'],
  [{ field: 'runs', op: 'fewerThan', count: 0 }, 'runs fewer than 0'],
];

describe('a condition in words', () => {
  it.each(everyOperator)('reads %j as "%s"', (condition, phrase) => {
    expect(conditionPhrase(condition)).toBe(phrase);
  });

  it('has no value for never, and a value for everything else', () => {
    for (const [condition] of everyOperator) {
      const { value } = describeCondition(condition);
      if (condition.field === 'lastCaught' && condition.op === 'never') {
        expect(value).toBeUndefined();
      } else {
        expect(value).toBeDefined();
      }
    }
  });

  it('gives every operator a phrase of its own', () => {
    const phrases = everyOperator.map(([condition]) =>
      conditionPhrase(condition),
    );
    expect(new Set(phrases).size).toBe(everyOperator.length);
  });
});

describe("the picker's choices", () => {
  it('offer every operator of every field, and no others', () => {
    const offered = FIELDS.flatMap((field) =>
      operatorsOf(field).map((op) => `${field}.${op}`),
    );
    const inTheLanguage = everyOperator.map(
      ([condition]) => `${condition.field}.${condition.op}`,
    );
    expect(offered.sort()).toEqual(inTheLanguage.sort());
  });
});
