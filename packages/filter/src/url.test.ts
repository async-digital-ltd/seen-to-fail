import { readFileSync } from 'node:fs';

import fc from 'fast-check';
import { expect, it } from 'vitest';

import { parseFilterString, serializeFilter } from './url.ts';
import { parseFilter, type FilterIssue } from './parse.ts';
import {
  emptyFilter,
  JOINERS,
  MAX_CONDITIONS_PER_GROUP,
  MAX_GROUPS,
  STATUSES,
  type AreaCondition,
  type Condition,
  type Filter,
  type Group,
  type LastCaughtAgeCondition,
  type LastCaughtNeverCondition,
  type RunsCondition,
  type StatusCondition,
} from './types.ts';

/**
 * The three worked examples are read off `packages/filter/README.md`, from the
 * fenced blocks under its Examples heading, in the order the README gives
 * them. The filters they stand for are written out here, so the serialiser is
 * checked against the documentation and not against itself: an edit that moves
 * a separator in the grammar fails here and names the example it broke, and so
 * does an edit to the README that the serialiser no longer agrees with. Before
 * #59 the three strings were restated here instead, and one had already
 * drifted from the README (area.is.ci against area.is.CI) with nothing failing.
 */

/** One condition, in one group, so a condition's own text can be compared. */
function oneCondition(condition: Condition): Filter {
  return {
    kind: 'groups',
    joiner: 'and',
    groups: [{ joiner: 'and', conditions: [condition] }],
  };
}

function parsedOrThrow(text: unknown): Filter {
  const result = parseFilterString(text);
  if (!result.ok) {
    throw new Error(
      `Expected the link to parse, but it was rejected: ${JSON.stringify(
        result.errors,
      )}`,
    );
  }
  return result.filter;
}

function refusalOf(text: unknown): readonly FilterIssue[] {
  const result = parseFilterString(text);
  if (result.ok) {
    throw new Error('Expected the link to be rejected, but it parsed.');
  }
  return result.errors;
}

/** Built fresh each time, so determinism is tested across separate values. */
function readmeExample(): Filter {
  return {
    kind: 'groups',
    joiner: 'and',
    groups: [
      {
        joiner: 'or',
        conditions: [
          { field: 'status', op: 'is', value: 'Unproven' },
          { field: 'status', op: 'is', value: 'Stale' },
        ],
      },
      {
        joiner: 'and',
        conditions: [{ field: 'area', op: 'is', value: 'CI' }],
      },
    ],
  };
}

const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

/**
 * The fenced blocks under the README's Examples heading, in the order it gives
 * them. Each sits inside a numbered item, so each is indented by three spaces,
 * and each is one line of link text.
 */
function readmeExamples(): readonly string[] {
  const section = readme.split('### Examples\n')[1]?.split('\n### ')[0];
  if (section === undefined) {
    throw new Error('packages/filter/README.md has no Examples section.');
  }
  return [...section.matchAll(/^ {3}```\n {3}(\S+)\n {3}```$/gm)].map(
    (block) => block[1] ?? '',
  );
}

const examples = readmeExamples();

it('finds the three examples the README documents, and no others', () => {
  expect(examples).toHaveLength(3);
});

/** The README's example at this position, refusing one it does not have. */
function readmeText(index: number): string {
  const found = examples[index];
  if (found === undefined) {
    throw new Error(
      `packages/filter/README.md has no example ${String(index + 1)}.`,
    );
  }
  return found;
}

const README_EXAMPLE = readmeText(0);

const README_EVERYTHING = readmeText(1);

function readmeEscapedExample(): Filter {
  return {
    kind: 'groups',
    joiner: 'or',
    groups: [
      {
        joiner: 'and',
        conditions: [
          { field: 'runs', op: 'fewerThan', count: 5 },
          { field: 'lastCaught', op: 'never' },
        ],
      },
      {
        joiner: 'and',
        conditions: [{ field: 'area', op: 'isNot', value: 'smoke tests' }],
      },
    ],
  };
}

const README_ESCAPED_EXAMPLE = readmeText(2);

it("writes the README's worked example exactly as the README shows it", () => {
  expect(serializeFilter(readmeExample())).toBe(README_EXAMPLE);
  expect(parsedOrThrow(README_EXAMPLE)).toEqual(readmeExample());
});

it('writes the filter that hides nothing as a single word', () => {
  expect(serializeFilter(emptyFilter)).toBe(README_EVERYTHING);
  expect(parsedOrThrow(README_EVERYTHING)).toEqual(emptyFilter);
});

it('escapes a value that would otherwise reach outside the alphabet', () => {
  expect(serializeFilter(readmeEscapedExample())).toBe(README_ESCAPED_EXAMPLE);
  expect(parsedOrThrow(README_ESCAPED_EXAMPLE)).toEqual(readmeEscapedExample());
});

it('gives two people the same link for the same filter', () => {
  expect(serializeFilter(readmeExample())).toBe(
    serializeFilter(readmeExample()),
  );
});

/**
 * Every field-and-operator pair the language has, each carrying the same
 * argument as its partner so that the operator token is the only thing that
 * can tell two of these apart.
 */
const EVERY_OPERATOR = [
  { field: 'status', op: 'is', value: 'Proven' },
  { field: 'status', op: 'isNot', value: 'Proven' },
  { field: 'area', op: 'is', value: 'ci' },
  { field: 'area', op: 'isNot', value: 'ci' },
  { field: 'lastCaught', op: 'never' },
  { field: 'lastCaught', op: 'before', days: 30 },
  { field: 'lastCaught', op: 'after', days: 30 },
  { field: 'runs', op: 'moreThan', count: 5 },
  { field: 'runs', op: 'fewerThan', count: 5 },
] as const satisfies readonly [Condition, ...Condition[]];

it('round-trips a filter that uses every operator the language has', () => {
  const filter: Filter = {
    kind: 'groups',
    joiner: 'and',
    groups: [{ joiner: 'or', conditions: EVERY_OPERATOR }],
  };
  const link = serializeFilter(filter);

  expect(parsedOrThrow(link)).toEqual(filter);
  expect(EVERY_OPERATOR.length).toBeLessThanOrEqual(MAX_CONDITIONS_PER_GROUP);
});

it('gives every operator a token of its own, across the whole language', () => {
  const links = EVERY_OPERATOR.map((condition) =>
    serializeFilter(oneCondition(condition)),
  );

  expect(new Set(links)).toHaveProperty('size', EVERY_OPERATOR.length);
});

/**
 * The acceptance criterion states the same thing one field at a time. It is
 * worth keeping alongside the whole-language check above, because a failure
 * here names the field that lost its distinction instead of only reporting
 * that two links collided somewhere.
 */
const OPERATOR_PAIRS: readonly (readonly [string, Condition, Condition])[] = [
  [
    'a status that is one of the five against one that is not',
    { field: 'status', op: 'is', value: 'Broken' },
    { field: 'status', op: 'isNot', value: 'Broken' },
  ],
  [
    'an area that matches against one that does not',
    { field: 'area', op: 'is', value: 'ci' },
    { field: 'area', op: 'isNot', value: 'ci' },
  ],
  [
    'a catch before a day count against one after it',
    { field: 'lastCaught', op: 'before', days: 30 },
    { field: 'lastCaught', op: 'after', days: 30 },
  ],
  [
    'more runs than a count against fewer',
    { field: 'runs', op: 'moreThan', count: 5 },
    { field: 'runs', op: 'fewerThan', count: 5 },
  ],
];

for (const [name, left, right] of OPERATOR_PAIRS) {
  it(`writes ${name} differently`, () => {
    expect(serializeFilter(oneCondition(left))).not.toBe(
      serializeFilter(oneCondition(right)),
    );
  });
}

const anyJoiner = fc.constantFrom(...JOINERS);

const anyStatusCondition: fc.Arbitrary<StatusCondition> = fc
  .tuple(fc.constantFrom('is', 'isNot'), fc.constantFrom(...STATUSES))
  .map(([op, value]): StatusCondition => ({ field: 'status', op, value }));

/**
 * Area values are arbitrary text, so the generator mixes the ordinary names a
 * person would type with strings of arbitrary UTF-16 code units. The second
 * kind is what exercises the escape: it includes the grammar's own separators
 * and characters outside the basic plane, each written as the two escapes of
 * its surrogate pair.
 *
 * Two things are left out, because an area holding either is not a filter:
 * the NUL character, which PostgreSQL text cannot hold (#36), and a surrogate
 * on its own, which the driver would send as U+FFFD (#161). The schema refuses
 * both, so a link carrying one is refused rather than round-tripped; the tests
 * near the foot of this file hold that.
 */
const anyAreaText = fc.oneof(
  fc.constantFrom('ci', 'lint', 'unit tests', 'build-and-release', ''),
  fc
    .string({ unit: 'binary', maxLength: 12 })
    .filter((text) => !text.includes('\u0000') && !/\p{Surrogate}/u.test(text)),
);

const anyAreaCondition: fc.Arbitrary<AreaCondition> = fc
  .tuple(fc.constantFrom('is', 'isNot'), anyAreaText)
  .map(([op, value]): AreaCondition => ({ field: 'area', op, value }));

const neverCaught = fc.constant<LastCaughtNeverCondition>({
  field: 'lastCaught',
  op: 'never',
});

const anyLastCaughtAgeCondition: fc.Arbitrary<LastCaughtAgeCondition> = fc
  .tuple(fc.constantFrom('before', 'after'), fc.nat({ max: 3650 }))
  .map(([op, days]): LastCaughtAgeCondition => ({
    field: 'lastCaught',
    op,
    days,
  }));

const anyRunsCondition: fc.Arbitrary<RunsCondition> = fc
  .tuple(fc.constantFrom('moreThan', 'fewerThan'), fc.nat({ max: 100000 }))
  .map(([op, count]): RunsCondition => ({ field: 'runs', op, count }));

const anyCondition: fc.Arbitrary<Condition> = fc.oneof(
  anyStatusCondition,
  anyAreaCondition,
  neverCaught,
  anyLastCaughtAgeCondition,
  anyRunsCondition,
);

/**
 * A group and a filter are each built from a first item and a list of the rest,
 * because both hold at least one item and a plain array cannot say so.
 */
const anyGroup: fc.Arbitrary<Group> = fc
  .tuple(
    anyJoiner,
    anyCondition,
    fc.array(anyCondition, { maxLength: MAX_CONDITIONS_PER_GROUP - 1 }),
  )
  .map(([joiner, first, rest]): Group => ({
    joiner,
    conditions: [first, ...rest],
  }));

const anyFilter: fc.Arbitrary<Filter> = fc.oneof(
  fc.constant<Filter>(emptyFilter),
  fc
    .tuple(
      anyJoiner,
      anyGroup,
      fc.array(anyGroup, { maxLength: MAX_GROUPS - 1 }),
    )
    .map(([joiner, first, rest]): Filter => ({
      kind: 'groups',
      joiner,
      groups: [first, ...rest],
    })),
);

/**
 * The acceptance criterion asks for at least 500 cases. The count below is the
 * setting; the counter inside the property is what proves the runner actually
 * went through them, which a check on the setting alone would not.
 */
const PROPERTY_CASES = 500;

it('round-trips an arbitrary filter, and writes the same link back', () => {
  let cases = 0;

  fc.assert(
    fc.property(anyFilter, (filter) => {
      cases += 1;
      const link = serializeFilter(filter);
      const parsed = parsedOrThrow(link);

      expect(parsed).toEqual(filter);
      expect(serializeFilter(parsed)).toBe(link);
    }),
    { numRuns: PROPERTY_CASES },
  );

  expect(cases).toBeGreaterThanOrEqual(500);
});

it('writes a link that survives a query string unchanged', () => {
  fc.assert(
    fc.property(anyFilter, (filter) => {
      const link = serializeFilter(filter);

      expect(encodeURIComponent(link)).toBe(link);
    }),
    { numRuns: PROPERTY_CASES },
  );
});

/**
 * One row per way a link can be wrong. The assertion is as much that nothing
 * throws as that nothing parses: this text arrives from a URL somebody else
 * wrote, and a thrown error there is a crash rather than a bad request.
 */
const MALFORMED: readonly (readonly [string, unknown])[] = [
  ['a link with no filter in it at all', ''],
  ['a filter truncated to its joiner', 'and'],
  ['a group truncated to its joiner', 'and!and'],
  ['a group truncated after its separator', 'and!and*'],
  ['a condition truncated to its field', 'and!and*status'],
  ['a condition truncated before its value', 'and!and*status.is'],
  ['a joiner the language does not have', 'unless!and*lastCaught.never'],
  ['a group joiner the language does not have', 'and!unless*lastCaught.never'],
  ['a field the language does not have', 'and!and*owner.is.ci'],
  ['an operator the field does not have', 'and!and*area.moreThan.ci'],
  ['an operator no field has', 'and!and*status.sometimes.Proven'],
  ['a status outside the five', 'and!and*status.is.Passing'],
  ['a value on the operator that takes none', 'and!and*lastCaught.never.5'],
  ['more parts than a condition has', 'and!and*status.is.Proven.today'],
  ['a day count that is not a number', 'and!and*lastCaught.before.soon'],
  ['a day count with a leading zero', 'and!and*lastCaught.before.007'],
  ['a negative day count', 'and!and*lastCaught.before.-1'],
  [
    'a run count past what the language counts to',
    'and!and*runs.moreThan.99999999999999999999',
  ],
  ['an injected query separator', 'and!and*area.is.ci&f=all'],
  ['an injected percent escape', 'and!and*area.is.ci%2Fetc'],
  ['an injected statement separator', 'and!and*area.is.ci;drop'],
  ['an injected angle bracket', 'and!and*area.is.<script>'],
  ['a half-written escape', 'and!and*area.is.ci~00'],
  ['an escape written in lower case', 'and!and*area.is.ci~002e'],
  ['an escape with no digits after it', 'and!and*area.is.ci~'],
  [
    'the word for everything with a filter after it',
    'all!and*lastCaught.never',
  ],
  ['a filter that is not text at all', 42],
  ['a filter that is missing altogether', null],
];

for (const [name, text] of MALFORMED) {
  it(`refuses ${name}, and says why`, () => {
    const errors = refusalOf(text);

    expect(errors.length).toBeGreaterThan(0);
    for (const issue of errors) {
      expect(issue.message).not.toBe('');
    }
  });
}

it('names the group and the condition a bad token sits in', () => {
  const errors = refusalOf(
    'and!and*lastCaught.never!or*lastCaught.never*runs.moreThan.soon',
  );

  expect(errors.map((issue) => issue.path)).toContain(
    'groups[1].conditions[1]',
  );
});

/**
 * The next three prove the link is not a second door into the language. Each
 * one is refused by a rule that lives in the schema rather than in the grammar,
 * which can only happen if the candidate really did go through `parseFilter`.
 */
it('refuses a status a link invented exactly as it refuses a request body asking for one', () => {
  const fromBody = parseFilter({
    kind: 'groups',
    joiner: 'and',
    groups: [
      {
        joiner: 'and',
        conditions: [{ field: 'status', op: 'is', value: 'Passing' }],
      },
    ],
  });
  if (fromBody.ok) {
    throw new Error('Expected the request body to be rejected, but it parsed.');
  }
  const fromLink = refusalOf('and!and*status.is.Passing');

  expect(fromLink.map((issue) => issue.path)).toContain(
    'groups[0].conditions[0].value',
  );
  expect(fromLink).toEqual(fromBody.errors);
});

it("reports a group with no conditions in the language's own words", () => {
  expect(refusalOf('and!and')).toContainEqual({
    path: 'groups[0].conditions',
    message: 'A group needs at least one condition.',
  });
});

it('refuses more groups than a filter takes', () => {
  const tooMany = [
    'and',
    ...Array.from({ length: MAX_GROUPS + 1 }, () => 'and*lastCaught.never'),
  ].join('!');

  expect(refusalOf(tooMany).map((issue) => issue.path)).toContain('groups');
});

/**
 * A link over a cap is refused on its size before any token in it is read, so
 * the refusal is one issue however much the link holds (#158). Before, each
 * bad token came back as a refusal of its own and the size was checked after:
 * the first link below, about a browser's URL limit, was 2,000,000 refusals.
 */
it('refuses a group with too many conditions before reading any of them', () => {
  expect(refusalOf(`and!and${'*'.repeat(2_000_000)}`)).toStrictEqual([
    {
      path: 'groups[0].conditions',
      message: `A group takes at most ${String(MAX_CONDITIONS_PER_GROUP)} conditions.`,
    },
  ]);
});

it('refuses a link with too many groups before reading any of them', () => {
  expect(refusalOf(`and${'!and*bad'.repeat(200_000)}`)).toStrictEqual([
    {
      path: 'groups',
      message: `A filter takes at most ${String(MAX_GROUPS)} groups.`,
    },
  ]);
});

/**
 * #36 names a share link as one way to reach a value PostgreSQL cannot hold.
 * Both links below are well formed, so the grammar hands each one on, and the
 * refusal is the schema's, at the node at fault.
 */
it('refuses a link carrying a day count past the largest, or a NUL in an area', () => {
  expect(refusalOf('and!and*lastCaught.before.99999999999')).toStrictEqual([
    {
      path: 'groups[0].conditions[0].days',
      message: 'A day count cannot be more than 1721426.',
    },
  ]);
  expect(refusalOf('and!and*area.is.C~0000I')).toStrictEqual([
    {
      path: 'groups[0].conditions[0].value',
      message:
        'An area cannot contain a NUL character or an unpaired surrogate.',
    },
  ]);
});

/**
 * The escape carries any code unit, so a link can spell half of a character.
 * The grammar hands it on and the schema refuses it (#161), as it refuses the
 * same value in a request body. A whole pair, written as its two escapes, is
 * read back as the character it makes.
 */
it('refuses a link carrying half of a character in an area, and reads a whole pair', () => {
  expect(refusalOf('and!and*area.is.C~D800I')).toStrictEqual([
    {
      path: 'groups[0].conditions[0].value',
      message:
        'An area cannot contain a NUL character or an unpaired surrogate.',
    },
  ]);
  expect(parsedOrThrow('and!and*area.is.C~D83D~DE00I')).toStrictEqual(
    oneCondition({ field: 'area', op: 'is', value: 'C😀I' }),
  );
});
