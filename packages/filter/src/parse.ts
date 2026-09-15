import { filterSchema } from './schema';
import type { Filter } from './types';

/**
 * One reason an input was rejected.
 *
 * `path` names the node at fault the way a reader would point at it, for
 * example `groups[1].conditions[0].days`. The filter itself is the empty
 * string, which is what an input that is not a filter-shaped object at all
 * reports.
 */
export interface FilterIssue {
  readonly path: string;
  readonly message: string;
}

export type ParseFilterResult =
  | { readonly ok: true; readonly filter: Filter }
  | { readonly ok: false; readonly errors: readonly FilterIssue[] };

function formatPath(path: readonly PropertyKey[]): string {
  let formatted = '';
  for (const segment of path) {
    if (typeof segment === 'number') {
      formatted += `[${String(segment)}]`;
    } else if (formatted === '') {
      formatted = String(segment);
    } else {
      formatted += `.${String(segment)}`;
    }
  }
  return formatted;
}

/**
 * Turn untrusted input, such as a decoded request body or a parsed query
 * string, into a `Filter`.
 *
 * This is the only door into the language. Anything that comes back with
 * `ok: true` is a filter the rest of the system can compile and serialise
 * without further checking, because the types it is built from cannot hold an
 * invalid condition.
 *
 * Every bad node is reported, not only the first, so a caller can show each
 * message beside the field it belongs to.
 */
export function parseFilter(input: unknown): ParseFilterResult {
  const result = filterSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        message: issue.message,
      })),
    };
  }
  return { ok: true, filter: result.data };
}
