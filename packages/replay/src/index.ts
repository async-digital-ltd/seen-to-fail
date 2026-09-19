/**
 * The adapter: what a replay tool said, turned into runs this ledger records.
 *
 * Three steps, each with its own file and its own refusal. report.ts reads the
 * tool's JSON. plants.ts reads the plant declaration for the check addresses
 * canfail knows nothing about. adapt.ts maps verdicts to outcomes using the
 * table #66 pinned, and refuses the lot rather than guessing at one it does not
 * recognise.
 *
 * dependencies.ts sits before all three rather than in the line: it reads the
 * same declaration for the dependency list beside each plant and says which
 * checks a change touches (#68), so that a replay runs for a reason rather than
 * on a timer. Nothing downstream of it knows a selection happened.
 *
 * Nothing here writes anything, reads a file, or knows what a database is. The
 * writing is the ledger's own recorder, called from
 * `packages/server/src/scripts/record-replay.ts`, which is where this package
 * and that one meet.
 */

export { parseCanfailReport, canfailVerdicts, problemsFrom } from './report.ts';
export type {
  CanfailOutcome,
  CanfailReport,
  CanfailVerdict,
  ReplayResult,
} from './report.ts';

export { parsePlantedChecks } from './plants.ts';
export type { PlantedCheck, PlantedChecks } from './plants.ts';

export {
  checksTouchedBy,
  declarationOf,
  dependencyMatches,
  parseDeclaredChecks,
} from './dependencies.ts';
export type { DeclaredCheck, TouchedOptions } from './dependencies.ts';

export { runsFromReport } from './adapt.ts';
export type {
  AdaptOptions,
  ReplayOutcome,
  ReplayProvenance,
  ReplayRun,
} from './adapt.ts';
