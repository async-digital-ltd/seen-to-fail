import { z } from 'zod';

import {
  JOINERS,
  MAX_CONDITIONS_PER_GROUP,
  MAX_DAYS,
  MAX_GROUPS,
  MAX_RUN_COUNT,
  STATUSES,
} from './types.ts';

/**
 * The runtime half of the filter language: the schema that decides whether
 * untrusted input is a filter at all.
 *
 * Every object is strict, so a key the language does not have is a rejection
 * rather than a silently dropped field. Every union is discriminated, so a bad
 * node is reported at its own path instead of as a wall of near misses from
 * each alternative in turn.
 *
 * A filter this accepts has to be one the compiled SQL can run, not only one
 * that is well formed. A value PostgreSQL refuses fails inside the query, where
 * the API can only answer with a masked error and no path, so each value is
 * bounded here to what the statement can hold (#36).
 */

/**
 * A day count is compiled as the as-of day minus the count, a date minus an
 * integer, so the largest count is the one that still lands on a date
 * PostgreSQL holds.
 *
 * The cap is safe for any as-of day on or after 0001-01-01, which is the
 * earliest day the server's Date scalar admits and earlier than any day the
 * server computes; the as-of day is the server's own, not a client's.
 * 0001-01-01 is Julian day 1,721,426, so 0001-01-01 minus 1,721,426 days is
 * 4714-11-24 BC, PostgreSQL's first date, and one day more is out of range. A
 * later as-of day only moves the result later. Nothing can overflow the other
 * end, because no count is negative and so the result is never later than the
 * as-of day itself.
 *
 * The cap is set for that earliest day rather than for today, because the
 * limit moves with the day: as of 2026-09-15 the query failed from 2,461,300
 * days, which is that day's Julian number plus one. The cap is also far inside
 * the `integer` the count is cast to.
 */
const dayCount = z
  .int('A day count must be a whole number of days.')
  .min(0, 'A day count cannot be negative.')
  .max(MAX_DAYS, `A day count cannot be more than ${String(MAX_DAYS)}.`);

/**
 * A run count is compared with `run_count`, an `integer` column of
 * `check_summaries`. PostgreSQL types the placeholder from the column it is
 * compared with, so a count past the largest `integer` is refused as out of
 * range before any row is compared. The cap is that largest `integer`.
 */
const runCount = z
  .int('A run count must be a whole number of runs.')
  .min(0, 'A run count cannot be negative.')
  .max(
    MAX_RUN_COUNT,
    `A run count cannot be more than ${String(MAX_RUN_COUNT)}.`,
  );

const statusCondition = z.strictObject({
  field: z.literal('status'),
  op: z.enum(['is', 'isNot']),
  value: z.enum(STATUSES),
});

/**
 * An unpaired UTF-16 surrogate: half of a character. With the `u` flag a pair
 * that makes up a real character is one code point and does not match.
 */
const unpairedSurrogate = /\p{Surrogate}/u;

/**
 * Text PostgreSQL can hold exactly as it was sent.
 *
 * A NUL character is refused outright: the statement fails as an invalid byte
 * sequence (#36). An unpaired surrogate is not refused but changed: UTF-8
 * cannot carry one, so the driver sends U+FFFD in its place, and a filter for
 * `"\uD800"` would match an area that really holds U+FFFD, a different value
 * from the one it was given (#161).
 *
 * This repeats `storable` in the server's `database/new-records.ts`, the rule
 * every area has to meet before it is written, so the filter refuses exactly
 * the areas no check can have. It is repeated rather than shared because this
 * package holds the filter language and nothing else, and that rule covers
 * every text field the server writes. The server's
 * `database/storable-text.test.ts` holds the two copies to the same answers.
 */
function storable(text: string): boolean {
  return !text.includes('\u0000') && !unpairedSurrogate.test(text);
}

const areaText = z
  .string()
  .refine(
    storable,
    'An area cannot contain a NUL character or an unpaired surrogate.',
  );

const areaCondition = z.strictObject({
  field: z.literal('area'),
  op: z.enum(['is', 'isNot']),
  value: areaText,
});

/**
 * `lastCaught` is the one field whose shape depends on its operator: `never`
 * takes no other key, while `before` and `after` each need a day count. A
 * union on `op`, nested inside the union on `field`, keeps both halves strict
 * and keeps a rejection pointed at the exact key at fault.
 */
const lastCaughtCondition = z.discriminatedUnion('op', [
  z.strictObject({
    field: z.literal('lastCaught'),
    op: z.literal('never'),
  }),
  z.strictObject({
    field: z.literal('lastCaught'),
    op: z.enum(['before', 'after']),
    days: dayCount,
  }),
]);

const runsCondition = z.strictObject({
  field: z.literal('runs'),
  op: z.enum(['moreThan', 'fewerThan']),
  count: runCount,
});

const condition = z.discriminatedUnion('field', [
  statusCondition,
  areaCondition,
  lastCaughtCondition,
  runsCondition,
]);

/**
 * Narrow an already validated list to the non-empty tuple type the language is
 * defined in.
 *
 * zod infers `T[]` from `z.array`, and `T[]` cannot say "at least one", while a
 * group is `readonly [Condition, ...Condition[]]` and a filter's groups are the
 * same shape. The `.min(1)` on each list below is what makes the list non-empty
 * at runtime; this only tells TypeScript so. It is written as a rebuild rather
 * than a type assertion because an assertion would also switch off checking of
 * the element type, which is the part most likely to drift.
 *
 * The throw cannot be reached while the `.min(1)` is in place, and names that
 * check so a reader who removes it learns why this broke.
 */
function nonEmpty<T>(values: readonly T[], what: string): readonly [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) {
    throw new Error(
      `A list of ${what} was empty where the schema promises at least one. The minimum length check on it must have been removed.`,
    );
  }
  return [first, ...rest];
}

/**
 * A list's bounds and messages, and the name `nonEmpty` gives it if the
 * minimum is ever removed.
 */
interface ListBounds {
  readonly what: string;
  readonly max: number;
  readonly tooFew: string;
  readonly tooMany: string;
}

/**
 * A non-empty list of at most `max` elements, refused on its length before any
 * element is validated (#38).
 *
 * `z.array(element).max(n)` validates every element first and measures the
 * length after, so the size of the input decided both the work done and the
 * size of the refusal: 100,000 bad conditions came back as 100,001 issues, and
 * about 200,000 overflowed zod's call stack instead of being refused at all.
 * Here the length is read first, off the input as it arrived, and the pipe
 * stops at that one refusal, so a list over its cap costs the same to refuse
 * whatever it holds. It reports at the list's own path, as the old check did.
 *
 * Anything that is not an array passes the length check untouched, so the
 * array schema after it still reports it as not being an array, at the same
 * path. The array schema has no maximum of its own, because nothing longer can
 * reach it.
 */
function boundedList<Element extends z.ZodType>(
  element: Element,
  bounds: ListBounds,
) {
  return z
    .unknown()
    .refine(
      (value) => !Array.isArray(value) || value.length <= bounds.max,
      bounds.tooMany,
    )
    .pipe(z.array(element).min(1, bounds.tooFew))
    .transform((parsed) => nonEmpty(parsed, bounds.what));
}

/**
 * The two refusals for a list over its cap. Exported so that the share-link
 * reader, which counts a link's groups and conditions before reading any of
 * them (#158), refuses in the same words at the same paths.
 */
export const TOO_MANY_CONDITIONS = `A group takes at most ${String(MAX_CONDITIONS_PER_GROUP)} conditions.`;
export const TOO_MANY_GROUPS = `A filter takes at most ${String(MAX_GROUPS)} groups.`;

const conditions = boundedList(condition, {
  what: 'conditions',
  max: MAX_CONDITIONS_PER_GROUP,
  tooFew: 'A group needs at least one condition.',
  tooMany: TOO_MANY_CONDITIONS,
});

const group = z.strictObject({
  joiner: z.enum(JOINERS),
  conditions,
});

const groups = boundedList(group, {
  what: 'groups',
  max: MAX_GROUPS,
  tooFew: 'A filter with groups needs at least one group.',
  tooMany: TOO_MANY_GROUPS,
});

/**
 * The schema `parseFilter` runs. Exported so that the API layer can reuse this
 * one validator rather than restate its rules in a second place.
 */
export const filterSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('empty') }),
  z.strictObject({
    kind: z.literal('groups'),
    joiner: z.enum(JOINERS),
    groups,
  }),
]);
