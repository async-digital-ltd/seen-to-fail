/**
 * The filter language, shared by the server and the web client.
 *
 * `parseFilter` is the edge: it is the only way to turn untrusted input into a
 * `Filter`. Everything else exported here is the vocabulary a parsed filter is
 * expressed in, plus the schema, so the API layer can validate with the same
 * rules rather than a copy of them.
 */

export {
  emptyFilter,
  JOINERS,
  MAX_CONDITIONS_PER_GROUP,
  MAX_GROUPS,
  STATUSES,
} from './types';

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
} from './types';

export { filterSchema } from './schema';

export { parseFilter } from './parse';

export type { FilterIssue, ParseFilterResult } from './parse';

export { compileFilter } from './compile';

export type { CompiledFilter, CompileOptions } from './compile';

/**
 * The package's own name.
 *
 * It survives from the scaffold because the server and the web client still
 * import it as their placeholder dependency on this package. Both drop it when
 * they start using the language itself.
 */
export const packageName = '@seen-to-fail/filter';

export { parseFilterString, serializeFilter } from './url';
