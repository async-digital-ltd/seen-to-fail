/**
 * The vocabulary of the filter language.
 *
 * A filter narrows the list of checks. The language is closed on purpose: four
 * fields, a fixed set of operators for each field, and exactly two levels of
 * grouping. Every type here is a discriminated union, so a combination the
 * language does not have, such as an area compared with `moreThan`, cannot be
 * written down at all.
 *
 * These are the shapes a caller may hold. `parseFilter` is the only supported
 * way to turn untrusted input into one.
 */

/**
 * The five statuses a check can hold. A status is derived from a check's run
 * log rather than stored, so this list is the entire vocabulary of the
 * `status` field. It is defined once here and read from this package by both
 * the API and the web client, so the two cannot drift apart.
 */
export const STATUSES = [
  'Unarmed',
  'Broken',
  'Proven',
  'Stale',
  'Unproven',
] as const;

export type Status = (typeof STATUSES)[number];

/** How sibling conditions, or sibling groups, combine. */
export const JOINERS = ['and', 'or'] as const;

export type Joiner = (typeof JOINERS)[number];

/** A filter takes at most this many groups. */
export const MAX_GROUPS = 10;

/** A group takes at most this many conditions. */
export const MAX_CONDITIONS_PER_GROUP = 10;

/**
 * The largest day count a `lastCaught` condition takes: the most days that can
 * be counted back from any as-of day on or after 0001-01-01 without leaving the
 * range of dates PostgreSQL holds. The arithmetic is beside the rule in
 * `schema.ts`.
 */
export const MAX_DAYS = 1_721_426;

/**
 * The largest run count a `runs` condition takes: the largest value of the
 * `integer` column the count is compared with.
 */
export const MAX_RUN_COUNT = 2_147_483_647;

/** A check's status is one of the five, or is anything but that one. */
export interface StatusCondition {
  readonly field: 'status';
  readonly op: 'is' | 'isNot';
  readonly value: Status;
}

/** A check's area matches a piece of text, or does not. */
export interface AreaCondition {
  readonly field: 'area';
  readonly op: 'is' | 'isNot';
  readonly value: string;
}

/** The check has never been seen to catch its planted defect. */
export interface LastCaughtNeverCondition {
  readonly field: 'lastCaught';
  readonly op: 'never';
}

/**
 * The check was last seen to catch its defect before, or after, a point some
 * number of days back from now. `days` is a whole number and never negative;
 * zero means the point is now.
 */
export interface LastCaughtAgeCondition {
  readonly field: 'lastCaught';
  readonly op: 'before' | 'after';
  readonly days: number;
}

/** The check has more, or fewer, recorded runs than a count. */
export interface RunsCondition {
  readonly field: 'runs';
  readonly op: 'moreThan' | 'fewerThan';
  readonly count: number;
}

export type Condition =
  | StatusCondition
  | AreaCondition
  | LastCaughtNeverCondition
  | LastCaughtAgeCondition
  | RunsCondition;

/**
 * The inner level of the language: one or more conditions joined by a single
 * `and` or `or`. The tuple type is what makes a group holding no conditions
 * impossible to build, rather than merely discouraged.
 */
export interface Group {
  readonly joiner: Joiner;
  readonly conditions: readonly [Condition, ...Condition[]];
}

/**
 * A filter that hides nothing.
 *
 * It is spelled out as its own shape rather than left implicit, so a caller
 * can tell "the user is filtering by nothing" from "I have not built a filter
 * yet", and so the two cases fall out of a switch on `kind`.
 */
export interface EmptyFilter {
  readonly kind: 'empty';
}

/** The outer level: one or more groups joined by a single `and` or `or`. */
export interface GroupedFilter {
  readonly kind: 'groups';
  readonly joiner: Joiner;
  readonly groups: readonly [Group, ...Group[]];
}

export type Filter = EmptyFilter | GroupedFilter;

/** The filter that lists every check. */
export const emptyFilter: EmptyFilter = { kind: 'empty' };
