import { expect, it } from 'vitest';

import { parseFilter, type FilterIssue } from './parse.ts';
import {
  MAX_CONDITIONS_PER_GROUP,
  MAX_DAYS,
  MAX_GROUPS,
  MAX_RUN_COUNT,
  type Condition,
  type Filter,
} from './types.ts';

/**
 * Everything here goes in as `unknown`, the way a decoded request body or a
 * parsed query string arrives, so the tests exercise the same door the API
 * does rather than a typed shortcut past it.
 */

/** One `and` group holding the given conditions, wrapped in an `and` filter. */
function groupedFilter(...conditions: unknown[]): unknown {
  return {
    kind: 'groups',
    joiner: 'and',
    groups: [{ joiner: 'and', conditions }],
  };
}

const neverCaught = { field: 'lastCaught', op: 'never' };

function repeat(count: number, value: unknown): unknown[] {
  return Array.from({ length: count }, () => value);
}

function parsedOrThrow(input: unknown): Filter {
  const result = parseFilter(input);
  if (!result.ok) {
    throw new Error(
      `Expected the filter to parse, but it was rejected: ${JSON.stringify(
        result.errors,
      )}`,
    );
  }
  return result.filter;
}

function rejectionPaths(input: unknown): string[] {
  const result = parseFilter(input);
  if (result.ok) {
    throw new Error('Expected the filter to be rejected, but it parsed.');
  }
  return result.errors.map((issue) => issue.path);
}

const validConditions: readonly (readonly [string, Condition])[] = [
  [
    'a status that is one of the five',
    { field: 'status', op: 'is', value: 'Proven' },
  ],
  [
    'a status that is anything but one',
    { field: 'status', op: 'isNot', value: 'Unarmed' },
  ],
  ['an area that matches', { field: 'area', op: 'is', value: 'ci' }],
  [
    'an area that does not match',
    { field: 'area', op: 'isNot', value: 'lint' },
  ],
  ['a defect never caught', { field: 'lastCaught', op: 'never' }],
  [
    'a catch before a day count',
    { field: 'lastCaught', op: 'before', days: 30 },
  ],
  ['a catch after a day count', { field: 'lastCaught', op: 'after', days: 7 }],
  ['a day count of zero', { field: 'lastCaught', op: 'after', days: 0 }],
  ['more runs than a count', { field: 'runs', op: 'moreThan', count: 5 }],
  ['fewer runs than a count', { field: 'runs', op: 'fewerThan', count: 2 }],
  [
    'the largest day count',
    { field: 'lastCaught', op: 'before', days: MAX_DAYS },
  ],
  [
    'the largest run count',
    { field: 'runs', op: 'fewerThan', count: MAX_RUN_COUNT },
  ],
];

for (const [name, condition] of validConditions) {
  it(`accepts ${name}`, () => {
    expect(parsedOrThrow(groupedFilter(condition))).toEqual({
      kind: 'groups',
      joiner: 'and',
      groups: [{ joiner: 'and', conditions: [condition] }],
    });
  });
}

it('accepts the empty filter, which hides nothing', () => {
  expect(parsedOrThrow({ kind: 'empty' })).toEqual({ kind: 'empty' });
});

it('accepts two groups joined by or, each joined by and inside', () => {
  const input = {
    kind: 'groups',
    joiner: 'or',
    groups: [
      {
        joiner: 'and',
        conditions: [
          { field: 'status', op: 'is', value: 'Unproven' },
          { field: 'area', op: 'is', value: 'ci' },
        ],
      },
      {
        joiner: 'and',
        conditions: [{ field: 'runs', op: 'moreThan', count: 0 }],
      },
    ],
  };

  expect(parsedOrThrow(input)).toEqual(input);
});

it('accepts a group filled to the condition limit', () => {
  const filter = parsedOrThrow(
    groupedFilter(...repeat(MAX_CONDITIONS_PER_GROUP, neverCaught)),
  );

  expect(filter).toHaveProperty(
    'groups.0.conditions.length',
    MAX_CONDITIONS_PER_GROUP,
  );
});

it('accepts a filter filled to the group limit', () => {
  const filter = parsedOrThrow({
    kind: 'groups',
    joiner: 'or',
    groups: repeat(MAX_GROUPS, { joiner: 'and', conditions: [neverCaught] }),
  });

  expect(filter).toHaveProperty('groups.length', MAX_GROUPS);
});

/**
 * One row per rejection rule, each naming the path the rule reports. The path
 * is the load-bearing half: a rule that starts rejecting at the wrong node is
 * as broken as one that stops rejecting.
 */
const rejections: readonly (readonly [string, unknown, string])[] = [
  [
    'a field the language does not have',
    groupedFilter({ field: 'owner', op: 'is', value: 'ci' }),
    'groups[0].conditions[0].field',
  ],
  [
    'an operator the field does not have',
    groupedFilter({ field: 'area', op: 'moreThan', value: 'ci' }),
    'groups[0].conditions[0].op',
  ],
  [
    'an operator no field has',
    groupedFilter({ field: 'lastCaught', op: 'sometimes', days: 3 }),
    'groups[0].conditions[0].op',
  ],
  [
    'a value of the wrong type',
    groupedFilter({ field: 'area', op: 'is', value: 7 }),
    'groups[0].conditions[0].value',
  ],
  [
    'a status outside the five',
    groupedFilter({ field: 'status', op: 'is', value: 'Passing' }),
    'groups[0].conditions[0].value',
  ],
  [
    'a day count that is not whole',
    groupedFilter({ field: 'lastCaught', op: 'before', days: 1.5 }),
    'groups[0].conditions[0].days',
  ],
  [
    'a negative day count',
    groupedFilter({ field: 'lastCaught', op: 'after', days: -1 }),
    'groups[0].conditions[0].days',
  ],
  [
    'a run count that is not whole',
    groupedFilter({ field: 'runs', op: 'moreThan', count: 2.5 }),
    'groups[0].conditions[0].count',
  ],
  [
    'a negative run count',
    groupedFilter({ field: 'runs', op: 'fewerThan', count: -3 }),
    'groups[0].conditions[0].count',
  ],
  [
    'an extra key on a condition',
    groupedFilter({ field: 'area', op: 'is', value: 'ci', ignoreCase: true }),
    'groups[0].conditions[0]',
  ],
  [
    'a day count on the operator that takes none',
    groupedFilter({ field: 'lastCaught', op: 'never', days: 3 }),
    'groups[0].conditions[0]',
  ],
  ['a group with no conditions', groupedFilter(), 'groups[0].conditions'],
  [
    'more conditions than a group takes',
    groupedFilter(...repeat(MAX_CONDITIONS_PER_GROUP + 1, neverCaught)),
    'groups[0].conditions',
  ],
  [
    'a joiner the language does not have',
    {
      kind: 'groups',
      joiner: 'and',
      groups: [{ joiner: 'unless', conditions: [neverCaught] }],
    },
    'groups[0].joiner',
  ],
  [
    'an extra key on a group',
    {
      kind: 'groups',
      joiner: 'and',
      groups: [{ joiner: 'and', conditions: [neverCaught], negated: true }],
    },
    'groups[0]',
  ],
  [
    'a grouped filter with no groups',
    { kind: 'groups', joiner: 'and', groups: [] },
    'groups',
  ],
  [
    'more groups than a filter takes',
    {
      kind: 'groups',
      joiner: 'and',
      groups: repeat(MAX_GROUPS + 1, {
        joiner: 'and',
        conditions: [neverCaught],
      }),
    },
    'groups',
  ],
  [
    'a joiner the language does not have on the filter itself',
    {
      kind: 'groups',
      joiner: 'unless',
      groups: [{ joiner: 'and', conditions: [neverCaught] }],
    },
    'joiner',
  ],
  [
    'a kind of filter the language does not have',
    { kind: 'everything' },
    'kind',
  ],
  ['an extra key on the filter', { kind: 'empty', joiner: 'and' }, ''],
  ['an input that is not an object', 'status is Proven', ''],
  ['an input that is missing altogether', null, ''],
];

for (const [name, input, path] of rejections) {
  const where = path === '' ? 'the filter itself' : path;
  it(`rejects ${name}, at ${where}`, () => {
    expect(rejectionPaths(input)).toContain(path);
  });
}

it('reports the deep path to a bad node in a later group', () => {
  const input = {
    kind: 'groups',
    joiner: 'or',
    groups: [
      { joiner: 'and', conditions: [neverCaught] },
      {
        joiner: 'and',
        conditions: [{ field: 'lastCaught', op: 'before', days: -2 }],
      },
    ],
  };

  expect(rejectionPaths(input)).toContain('groups[1].conditions[0].days');
});

it('reports every bad node rather than only the first', () => {
  const paths = rejectionPaths({
    kind: 'groups',
    joiner: 'and',
    groups: [
      {
        joiner: 'and',
        conditions: [{ field: 'lastCaught', op: 'before', days: -1 }],
      },
      {
        joiner: 'and',
        conditions: [{ field: 'runs', op: 'moreThan', count: 1.5 }],
      },
    ],
  });

  expect(paths).toContain('groups[0].conditions[0].days');
  expect(paths).toContain('groups[1].conditions[0].count');
  expect(paths).toHaveLength(2);
});

it('says what the rule was, not only where it broke', () => {
  const result = parseFilter(groupedFilter());
  if (result.ok) {
    throw new Error('Expected a group with no conditions to be rejected.');
  }

  expect(result.errors).toContainEqual({
    path: 'groups[0].conditions',
    message: 'A group needs at least one condition.',
  });
});

/**
 * The values the compiled SQL cannot hold (#36), one row per bound, each with
 * the one issue it reports. Past these, the filter used to be accepted here and
 * fail inside PostgreSQL, where the API can only answer with a masked error, so
 * the path and the message are the whole of what a client learns. Why each
 * bound is the number it is lives beside the rule in `schema.ts`, and the
 * server's filter tests hold the numbers against PostgreSQL itself.
 */
const bounds: readonly (readonly [string, unknown, FilterIssue])[] = [
  [
    'a day count one past the largest',
    groupedFilter({ field: 'lastCaught', op: 'after', days: MAX_DAYS + 1 }),
    {
      path: 'groups[0].conditions[0].days',
      message: 'A day count cannot be more than 1721426.',
    },
  ],
  [
    'a run count one past the largest',
    groupedFilter({ field: 'runs', op: 'moreThan', count: MAX_RUN_COUNT + 1 }),
    {
      path: 'groups[0].conditions[0].count',
      message: 'A run count cannot be more than 2147483647.',
    },
  ],
  [
    'an area holding a NUL character',
    groupedFilter({ field: 'area', op: 'is', value: 'C\u0000I' }),
    {
      path: 'groups[0].conditions[0].value',
      message: 'An area cannot contain a NUL character.',
    },
  ],
];

for (const [name, input, issue] of bounds) {
  it(`refuses ${name}, with one issue at ${issue.path}`, () => {
    expect(parseFilter(input)).toStrictEqual({ ok: false, errors: [issue] });
  });
}

/**
 * A list over its cap is refused on its length alone (#38).
 *
 * The length used to be checked only after every element had been validated,
 * so 100,000 bad conditions came back as 100,001 issues and about 200,000
 * overflowed the call stack instead of being refused. Every element below is
 * bad, and there are more of them than either of those, so a list whose
 * elements were validated before its length would answer with an issue per
 * element or throw.
 */
const OVERSIZED = 250_000;

const badCondition = { field: 'lastCaught', op: 'before', days: -1 };

it('refuses a group of far more bad conditions than it takes with one issue about its size', () => {
  const input = {
    kind: 'groups',
    joiner: 'and',
    groups: [{ joiner: 'and', conditions: repeat(OVERSIZED, badCondition) }],
  };

  expect(parseFilter(input)).toStrictEqual({
    ok: false,
    errors: [
      {
        path: 'groups[0].conditions',
        message: 'A group takes at most 10 conditions.',
      },
    ],
  });
});

it('refuses a filter of far more bad groups than it takes with one issue about its size', () => {
  const input = {
    kind: 'groups',
    joiner: 'and',
    groups: repeat(OVERSIZED, { joiner: 'unless', conditions: [badCondition] }),
  };

  expect(parseFilter(input)).toStrictEqual({
    ok: false,
    errors: [{ path: 'groups', message: 'A filter takes at most 10 groups.' }],
  });
});

/**
 * The same rule seen from inside, at the smallest size it applies to. Each
 * element counts the times its `field` is read, which validating it cannot
 * avoid, since `field` is what picks the schema it is checked against. The
 * list within its cap is the positive control: it shows a read is counted, so
 * no reads for the list over its cap means none happened.
 */
it('reads no element of a list over its cap', () => {
  let reads = 0;
  const watched = {
    get field() {
      reads += 1;
      return 'lastCaught';
    },
    op: 'never',
  };

  parseFilter(groupedFilter(...repeat(MAX_CONDITIONS_PER_GROUP, watched)));
  expect(reads).toBeGreaterThan(0);

  reads = 0;
  parseFilter(groupedFilter(...repeat(MAX_CONDITIONS_PER_GROUP + 1, watched)));
  expect(reads).toBe(0);

  parseFilter({
    kind: 'groups',
    joiner: 'and',
    groups: repeat(MAX_GROUPS + 1, { joiner: 'and', conditions: [watched] }),
  });
  expect(reads).toBe(0);
});
