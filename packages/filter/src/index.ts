/**
 * The filter language, shared by the server and the web client.
 *
 * Four parts, which are tested against each other rather than trusted to
 * agree. The vocabulary is the types a filter is expressed in, closed so that
 * a tree the language does not have cannot be written down. `filterSchema` and
 * `parseFilter` are the edge: the only way to turn untrusted input into a
 * `Filter`, exported so the API layer validates with these rules rather than
 * with a copy of them. `compileFilter` turns a filter into a parameterised SQL
 * predicate, where values travel as parameters and never as text.
 * `serializeFilter` and `parseFilterString` carry a filter in a share link and
 * bring an equal one back.
 *
 * `compileFilter` and `serializeFilter` each take a `Filter` rather than
 * untrusted input, because `parseFilter` has already run by then.
 * `parseFilterString` reads the shape of a link and then hands the result to
 * `parseFilter` for the verdict, so a link is not a second door into the
 * language with weaker rules of its own.
 */

export {
  emptyFilter,
  JOINERS,
  MAX_CONDITIONS_PER_GROUP,
  MAX_DAYS,
  MAX_GROUPS,
  MAX_RUN_COUNT,
  STATUSES,
} from './types.ts';

export type {
  AreaCondition,
  Condition,
  EmptyFilter,
  Filter,
  Group,
  GroupedFilter,
  Joiner,
  LastCaughtAgeCondition,
  LastCaughtNeverCondition,
  RunsCondition,
  Status,
  StatusCondition,
} from './types.ts';

export { filterSchema } from './schema.ts';

export { parseFilter } from './parse.ts';

export type { FilterIssue, ParseFilterResult } from './parse.ts';

export { compileFilter } from './compile.ts';

export type { CompiledFilter, CompileOptions } from './compile.ts';

/**
 * The package's own name.
 *
 * It survives from the scaffold because the server and the web client still
 * import it as their placeholder dependency on this package. Both drop it when
 * they start using the language itself.
 */
export const packageName = '@seen-to-fail/filter';

export { parseFilterString, serializeFilter } from './url.ts';
