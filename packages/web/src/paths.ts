import { serializeFilter } from '@seen-to-fail/filter';
import type { Filter } from '@seen-to-fail/filter';

/**
 * Where each screen lives, built in one place so that a link and the route it
 * points at cannot spell an address differently. routes.tsx declares the
 * patterns; routes.test.tsx opens each address built here and checks the
 * right screen answers.
 */

/** The query parameter the run form reads to pre-select a check. */
export const checkParameter = 'check';

/** The query parameter the list reads its filter from. */
export const filterParameter = 'f';

export const paths = {
  /**
   * The list, which is the home page, narrowed by a filter when one is given.
   *
   * The filter is written with the filter package's link grammar, whose
   * alphabet is exactly what encodeURIComponent leaves alone, so the address
   * reads `/?f=and!and*status.is.Stale` rather than a run of percent escapes.
   * The filter that hides nothing gets the bare address, so there is one
   * address for the whole list rather than two.
   */
  checks: (options: { readonly filter?: Filter } = {}): string => {
    const { filter } = options;
    if (filter === undefined || filter.kind === 'empty') {
      return '/';
    }
    return `/?${filterParameter}=${encodeURIComponent(serializeFilter(filter))}`;
  },
  newCheck: (): string => '/checks/new',
  check: (id: string): string => `/checks/${encodeURIComponent(id)}`,
  /** The run form, pre-selecting a check when one is given. */
  newRun: (options: { readonly check?: string } = {}): string => {
    if (options.check === undefined) {
      return '/runs/new';
    }
    const query = new URLSearchParams({ [checkParameter]: options.check });
    return `/runs/new?${query.toString()}`;
  },
};
