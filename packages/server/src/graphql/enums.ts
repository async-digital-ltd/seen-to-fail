import type { Status } from '@seen-to-fail/filter';

import type { TestRunOutcome } from '../database/rows.ts';

/**
 * The one place a closed set of values changes spelling on its way out.
 *
 * Two vocabularies cross this boundary and neither is defined here. The five
 * statuses are the filter package's list, read by the database enum, the web
 * client and this API alike. The two outcomes are the run table's enum. GraphQL
 * enum values are conventionally written in capitals, though, so the wire
 * spells both differently from everything behind it, and something has to say
 * how.
 *
 * The maps below are that and nothing more. Neither is a second list. Each map
 * has the domain type as its key, so a value added there and not here fails to
 * compile, and each value is pinned to the upper case of its own key, so a typo
 * fails to compile too. The tests beside this file close the last gap by
 * reading both enums out of the built schema and comparing, which is what
 * catches the schema being the side that is wrong.
 *
 * Only the outward direction is here. Nothing a caller sends carries either of
 * these as an enum. The filter argument does carry statuses, but as JSON in the
 * filter language, spelled the way that language spells them and judged by its
 * own validator, so it never passes through a map here. A function with no
 * caller would be a claim nothing tests.
 */

const statusNames = {
  Unarmed: 'UNARMED',
  Broken: 'BROKEN',
  Proven: 'PROVEN',
  Stale: 'STALE',
  Unproven: 'UNPROVEN',
} as const satisfies { readonly [S in Status]: Uppercase<S> };

const outcomeNames = {
  caught: 'CAUGHT',
  missed: 'MISSED',
} as const satisfies { readonly [O in TestRunOutcome]: Uppercase<O> };

/** How a status is spelled on the wire. */
export type StatusName = (typeof statusNames)[Status];

/** How an outcome is spelled on the wire. */
export type OutcomeName = (typeof outcomeNames)[TestRunOutcome];

/** The status, as the schema's enum spells it. */
export function statusName(status: Status): StatusName {
  return statusNames[status];
}

/** The outcome, as the schema's enum spells it. */
export function outcomeName(outcome: TestRunOutcome): OutcomeName {
  return outcomeNames[outcome];
}
