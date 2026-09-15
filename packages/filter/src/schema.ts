import { z } from 'zod';

import {
  JOINERS,
  MAX_CONDITIONS_PER_GROUP,
  MAX_GROUPS,
  STATUSES,
} from './types';

/**
 * The runtime half of the filter language: the schema that decides whether
 * untrusted input is a filter at all.
 *
 * Every object is strict, so a key the language does not have is a rejection
 * rather than a silently dropped field. Every union is discriminated, so a bad
 * node is reported at its own path instead of as a wall of near misses from
 * each alternative in turn.
 */

const dayCount = z
  .int('A day count must be a whole number of days.')
  .min(0, 'A day count cannot be negative.');

const runCount = z
  .int('A run count must be a whole number of runs.')
  .min(0, 'A run count cannot be negative.');

const statusCondition = z.strictObject({
  field: z.literal('status'),
  op: z.enum(['is', 'isNot']),
  value: z.enum(STATUSES),
});

const areaCondition = z.strictObject({
  field: z.literal('area'),
  op: z.enum(['is', 'isNot']),
  value: z.string(),
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

const conditions = z
  .array(condition)
  .min(1, 'A group needs at least one condition.')
  .max(
    MAX_CONDITIONS_PER_GROUP,
    `A group takes at most ${String(MAX_CONDITIONS_PER_GROUP)} conditions.`,
  )
  .transform((parsed) => nonEmpty(parsed, 'conditions'));

const group = z.strictObject({
  joiner: z.enum(JOINERS),
  conditions,
});

const groups = z
  .array(group)
  .min(1, 'A filter with groups needs at least one group.')
  .max(MAX_GROUPS, `A filter takes at most ${String(MAX_GROUPS)} groups.`)
  .transform((parsed) => nonEmpty(parsed, 'groups'));

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
