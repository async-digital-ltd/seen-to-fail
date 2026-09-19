import type { Status } from '@seen-to-fail/filter';

import type { TestRunOutcome, TestRunSource } from '../database/rows.ts';

/**
 * The one place a closed set of values changes spelling on its way out.
 *
 * Three vocabularies cross this boundary and none is defined here. The five
 * statuses are the filter package's list, read by the database enum, the web
 * client and this API alike. The two outcomes and the two sources are the run
 * table's own enums. GraphQL enum values are conventionally written in capitals,
 * though, so the wire spells all three differently from everything behind them,
 * and something has to say how.
 *
 * The maps below are that and nothing more. Neither is a second list. Each map
 * has the domain type as its key, so a value added there and not here fails to
 * compile, and each value is pinned to the upper case of its own key, so a typo
 * fails to compile too. The tests beside this file close the last gap by
 * reading both enums out of the built schema and comparing, which is what
 * catches the schema being the side that is wrong.
 *
 * Statuses only go outward. Nothing a caller sends carries one as an enum. The
 * filter argument does carry statuses, but as JSON in the filter language,
 * spelled the way that language spells them and judged by its own validator, so
 * it never passes through a map here. A function with no caller would be a
 * claim nothing tests.
 *
 * Outcomes and sources go both ways, because logging a run sends one of each.
 * The inward maps are pinned the same way from the other side: their keys are
 * the upper case of the domain values and each value is the one its key spells,
 * so a swapped pair or a missing one fails to compile.
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

const outcomesByName = {
  CAUGHT: 'caught',
  MISSED: 'missed',
} as const satisfies {
  readonly [O in TestRunOutcome as Uppercase<O>]: O;
};

const sourceNames = {
  hand: 'HAND',
  replay: 'REPLAY',
} as const satisfies { readonly [S in TestRunSource]: Uppercase<S> };

const sourcesByName = {
  HAND: 'hand',
  REPLAY: 'replay',
} as const satisfies {
  readonly [S in TestRunSource as Uppercase<S>]: S;
};

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

/** The outcome a caller sent, as the run table's enum spells it. */
export function outcomeFromName(name: OutcomeName): TestRunOutcome {
  return outcomesByName[name];
}

/** How a run's source is spelled on the wire. */
export type SourceName = (typeof sourceNames)[TestRunSource];

/** The source, as the schema's enum spells it. */
export function sourceName(source: TestRunSource): SourceName {
  return sourceNames[source];
}

/** The source a caller sent, as the run table's enum spells it. */
export function sourceFromName(name: SourceName): TestRunSource {
  return sourcesByName[name];
}
