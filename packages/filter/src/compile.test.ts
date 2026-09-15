import { expect, it } from 'vitest';

import { compileFilter, type CompileOptions } from './compile.ts';
import {
  emptyFilter,
  type Condition,
  type Filter,
  type Group,
  type Joiner,
} from './types.ts';

/**
 * The compiler is a pure function from a filter to a string and an array, so
 * the tests assert both in full rather than matching patterns in the text. An
 * exact expectation is what makes the planted-defect check meaningful: a
 * comparison that flips from `<>` to `=` changes one character, and only a
 * test that reads the whole line notices.
 *
 * Every filter here is built from the typed constructors below rather than
 * from a literal object, because the non-empty tuple types are what make an
 * empty group unrepresentable and a test that casts past them would be testing
 * a shape the language cannot produce.
 */

/**
 * The placeholder numbering the summaries query leaves for a filter. It binds
 * the as-of date as `$1` and the staleness threshold as `$2`, so the first
 * placeholder a filter may claim is `$3`.
 */
const afterAsOfAndThreshold: CompileOptions = { firstParam: 3, asOfParam: 1 };

function groupOf(
  joiner: Joiner,
  first: Condition,
  ...rest: Condition[]
): Group {
  return { joiner, conditions: [first, ...rest] };
}

function filterOf(joiner: Joiner, first: Group, ...rest: Group[]): Filter {
  return { kind: 'groups', joiner, groups: [first, ...rest] };
}

/** The smallest filter that carries one condition: one group holding it. */
function filterOfOne(condition: Condition): Filter {
  return filterOf('and', groupOf('and', condition));
}

const statusIsUnproven: Condition = {
  field: 'status',
  op: 'is',
  value: 'Unproven',
};

const statusIsStale: Condition = {
  field: 'status',
  op: 'is',
  value: 'Stale',
};

const areaIsCi: Condition = { field: 'area', op: 'is', value: 'ci' };

const runsMoreThanOne: Condition = {
  field: 'runs',
  op: 'moreThan',
  count: 1,
};

interface CompileCase {
  readonly name: string;
  readonly condition: Condition;
  readonly where: string;
  readonly values: readonly unknown[];
}

/**
 * Every field and every operator the language has, each on its own, so that a
 * change to one comparison fails a test that names the operator it broke.
 */
const singleConditions: readonly CompileCase[] = [
  {
    name: 'a status that is one of the five',
    condition: { field: 'status', op: 'is', value: 'Proven' },
    where: '(s.status = $3)',
    values: ['Proven'],
  },
  {
    name: 'a status that is anything but one',
    condition: { field: 'status', op: 'isNot', value: 'Unarmed' },
    where: '(s.status <> $3)',
    values: ['Unarmed'],
  },
  {
    name: 'an area that matches',
    condition: { field: 'area', op: 'is', value: 'ci' },
    where: '(c.area = $3)',
    values: ['ci'],
  },
  {
    name: 'an area that does not match',
    condition: { field: 'area', op: 'isNot', value: 'lint' },
    where: '(c.area <> $3)',
    values: ['lint'],
  },
  {
    name: 'a defect never caught',
    condition: { field: 'lastCaught', op: 'never' },
    where: '(s.last_caught_on IS NULL)',
    values: [],
  },
  {
    name: 'a catch before a day count',
    condition: { field: 'lastCaught', op: 'before', days: 30 },
    where: '(s.last_caught_on < $1::date - $3::integer)',
    values: [30],
  },
  {
    name: 'a catch after a day count',
    condition: { field: 'lastCaught', op: 'after', days: 7 },
    where: '(s.last_caught_on > $1::date - $3::integer)',
    values: [7],
  },
  {
    name: 'a day count of zero, which means the as-of date itself',
    condition: { field: 'lastCaught', op: 'after', days: 0 },
    where: '(s.last_caught_on > $1::date - $3::integer)',
    values: [0],
  },
  {
    name: 'more runs than a count',
    condition: { field: 'runs', op: 'moreThan', count: 5 },
    where: '(s.run_count > $3)',
    values: [5],
  },
  {
    name: 'fewer runs than a count',
    condition: { field: 'runs', op: 'fewerThan', count: 2 },
    where: '(s.run_count < $3)',
    values: [2],
  },
];

for (const testCase of singleConditions) {
  it(`compiles ${testCase.name}`, () => {
    expect(
      compileFilter(filterOfOne(testCase.condition), afterAsOfAndThreshold),
    ).toEqual({ where: testCase.where, values: testCase.values });
  });
}

it('compiles the empty filter to a predicate that hides nothing', () => {
  expect(compileFilter(emptyFilter, afterAsOfAndThreshold)).toEqual({
    where: 'TRUE',
    values: [],
  });
});

it('joins the conditions inside an and group with AND', () => {
  const filter = filterOf('and', groupOf('and', statusIsUnproven, areaIsCi));

  expect(compileFilter(filter, afterAsOfAndThreshold)).toEqual({
    where: '(s.status = $3 AND c.area = $4)',
    values: ['Unproven', 'ci'],
  });
});

it('joins the conditions inside an or group with OR', () => {
  const filter = filterOf(
    'and',
    groupOf('or', statusIsUnproven, statusIsStale),
  );

  expect(compileFilter(filter, afterAsOfAndThreshold)).toEqual({
    where: '(s.status = $3 OR s.status = $4)',
    values: ['Unproven', 'Stale'],
  });
});

it('joins and groups with OR when the filter joiner is or', () => {
  const filter = filterOf(
    'or',
    groupOf('and', statusIsUnproven, areaIsCi),
    groupOf('and', runsMoreThanOne),
  );

  expect(compileFilter(filter, afterAsOfAndThreshold)).toEqual({
    where: '(s.status = $3 AND c.area = $4) OR (s.run_count > $5)',
    values: ['Unproven', 'ci', 1],
  });
});

it('joins or groups with AND when the filter joiner is and', () => {
  const filter = filterOf(
    'and',
    groupOf('or', statusIsUnproven, statusIsStale),
    groupOf('and', areaIsCi),
  );

  expect(compileFilter(filter, afterAsOfAndThreshold)).toEqual({
    where: '(s.status = $3 OR s.status = $4) AND (c.area = $5)',
    values: ['Unproven', 'Stale', 'ci'],
  });
});

/**
 * The precedence case the parentheses exist for. Without them the second
 * filter would compile to `s.status = $3 AND s.status = $4 OR c.area = $5`,
 * which SQL reads as `(a AND b) OR c`, a different question from the one the
 * filter asks. The two expectations differ only in where the joiners sit, so a
 * compiler that dropped the parentheses would make them equal.
 */
it('parenthesises every group, so an outer joiner cannot be captured', () => {
  const orInsideAndBetween = filterOf(
    'and',
    groupOf('or', statusIsUnproven, statusIsStale),
    groupOf('and', areaIsCi),
  );
  const andInsideOrBetween = filterOf(
    'or',
    groupOf('and', statusIsUnproven, statusIsStale),
    groupOf('and', areaIsCi),
  );

  expect(compileFilter(orInsideAndBetween, afterAsOfAndThreshold).where).toBe(
    '(s.status = $3 OR s.status = $4) AND (c.area = $5)',
  );
  expect(compileFilter(andInsideOrBetween, afterAsOfAndThreshold).where).toBe(
    '(s.status = $3 AND s.status = $4) OR (c.area = $5)',
  );
});

it('parenthesises a group holding a single condition', () => {
  const filter = filterOf('and', groupOf('and', areaIsCi));

  expect(compileFilter(filter, afterAsOfAndThreshold).where).toBe(
    '(c.area = $3)',
  );
});

it('starts its placeholders at the offset the caller supplies', () => {
  const filter = filterOf('and', groupOf('and', statusIsUnproven, areaIsCi));

  expect(compileFilter(filter, { firstParam: 1, asOfParam: 1 }).where).toBe(
    '(s.status = $1 AND c.area = $2)',
  );
  expect(compileFilter(filter, { firstParam: 7, asOfParam: 1 }).where).toBe(
    '(s.status = $7 AND c.area = $8)',
  );
});

/**
 * The as-of placeholder belongs to the caller, so it is neither claimed nor
 * renumbered. A compiler that assumed `$1` would still pass every test above,
 * because every one of them binds the as-of date at `$1`.
 */
it('reads the as-of date from the placeholder it is told to, not from $1', () => {
  const filter = filterOfOne({ field: 'lastCaught', op: 'before', days: 30 });

  expect(compileFilter(filter, { firstParam: 5, asOfParam: 2 })).toEqual({
    where: '(s.last_caught_on < $2::date - $5::integer)',
    values: [30],
  });
});

/** Every condition the language has, spread across two groups. */
const everyCondition: Filter = filterOf(
  'or',
  groupOf(
    'and',
    { field: 'status', op: 'is', value: 'Proven' },
    { field: 'status', op: 'isNot', value: 'Unarmed' },
    { field: 'area', op: 'is', value: 'ci' },
    { field: 'area', op: 'isNot', value: 'lint' },
    { field: 'lastCaught', op: 'never' },
  ),
  groupOf(
    'or',
    { field: 'lastCaught', op: 'before', days: 30 },
    { field: 'lastCaught', op: 'after', days: 7 },
    { field: 'runs', op: 'moreThan', count: 5 },
    { field: 'runs', op: 'fewerThan', count: 2 },
  ),
);

/**
 * The vocabulary the compiler is allowed to emit, written out here rather than
 * imported from the compiler. A scan that took its expectations from the code
 * it is scanning would accept whatever that code started emitting, which is
 * the one thing this test exists to refuse.
 */
const permittedWords = new Set(['AND', 'OR', 'IS', 'NULL', 'TRUE']);
const permittedColumns = new Set([
  's.status',
  'c.area',
  's.last_caught_on',
  's.run_count',
]);
const permittedSymbols = new Set(['=', '<>', '<', '>', '-', '(', ')']);
const placeholder = /^\$[1-9][0-9]*(?:::(?:date|integer))?$/;

/**
 * Split emitted SQL into tokens and return the ones outside the vocabulary.
 *
 * Splitting on whitespace after prising the parentheses apart means a value
 * cannot hide by being glued to its operator: `s.run_count >5` yields `>5`,
 * which is in no set, and `s.status='Proven'` yields the whole thing.
 */
function unknownTokens(sql: string): string[] {
  return sql
    .replace(/([()])/g, ' $1 ')
    .split(/\s+/)
    .filter((token) => token !== '')
    .filter(
      (token) =>
        !permittedWords.has(token) &&
        !permittedColumns.has(token) &&
        !permittedSymbols.has(token) &&
        !placeholder.test(token),
    );
}

it('emits only columns, symbols, keywords and placeholders', () => {
  const compiled = compileFilter(everyCondition, afterAsOfAndThreshold);

  expect(unknownTokens(compiled.where)).toEqual([]);
});

it('emits only a keyword for the empty filter', () => {
  const compiled = compileFilter(emptyFilter, afterAsOfAndThreshold);

  expect(unknownTokens(compiled.where)).toEqual([]);
});

/**
 * The positive control for the scan above. A scan that cannot report a literal
 * and a scan with nothing to report look identical from the outside, so this
 * shows the instrument reading a value it should refuse before the other two
 * tests are allowed to mean anything.
 */
it('reports a value that reached the text, which is what the scan is for', () => {
  expect(unknownTokens("s.status = 'Proven'")).toEqual(["'Proven'"]);
  expect(unknownTokens('s.run_count > 5')).toEqual(['5']);
  expect(unknownTokens('s.run_count >5')).toEqual(['>5']);
});

it('claims one placeholder per value, numbered in order from the offset', () => {
  const compiled = compileFilter(everyCondition, afterAsOfAndThreshold);
  const used = (compiled.where.match(/\$[1-9][0-9]*/g) ?? []).map((token) =>
    Number(token.slice(1)),
  );
  const claimed = used.filter(
    (number) => number !== afterAsOfAndThreshold.asOfParam,
  );

  expect(claimed).toEqual(
    compiled.values.map((_, index) => afterAsOfAndThreshold.firstParam + index),
  );
});

it('lists its values in the order its placeholders appear', () => {
  const compiled = compileFilter(everyCondition, afterAsOfAndThreshold);

  expect(compiled.values).toEqual([
    'Proven',
    'Unarmed',
    'ci',
    'lint',
    30,
    7,
    5,
    2,
  ]);
});
