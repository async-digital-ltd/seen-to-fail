import type { Status } from '@seen-to-fail/filter';

/**
 * A check's status on its way from the API to the screen.
 *
 * The five statuses are the filter package's list, and a reader sees those
 * words exactly: a badge, a tile and a filter chip all say `Proven`, never a
 * spelling of their own. The schema's enum writes the same five in capitals,
 * because that is how GraphQL enums are conventionally written, so something
 * has to turn the wire's spelling back. This is that, and it is not a second
 * list.
 *
 * The map is typed from the filter package's list. A status added there and
 * not here fails to compile, and each value is pinned to the word its key
 * spells, so a swapped pair fails to compile too.
 */
const statusesByName = {
  UNARMED: 'Unarmed',
  BROKEN: 'Broken',
  PROVEN: 'Proven',
  STALE: 'Stale',
  UNPROVEN: 'Unproven',
} as const satisfies { readonly [S in Status as Uppercase<S>]: S };

/** A status as the schema's enum spells it. */
export type StatusName = Uppercase<Status>;

/** The status the API sent, as the filter language and the screen spell it. */
export function statusFromName(name: StatusName): Status {
  return statusesByName[name];
}

/**
 * The order the statuses are shown in, from the one a reader can trust to the
 * one they know least about.
 *
 * The filter package's list is in no particular order for reading, so the
 * screen keeps its own. It holds the same five words and no others, which
 * status.test.ts checks against that list.
 */
export const statusOrder: readonly Status[] = [
  'Proven',
  'Broken',
  'Stale',
  'Unproven',
  'Unarmed',
];
