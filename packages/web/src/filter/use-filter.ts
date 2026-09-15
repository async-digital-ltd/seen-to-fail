import { emptyFilter, parseFilterString } from '@seen-to-fail/filter';
import type { Filter } from '@seen-to-fail/filter';
import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { filterParameter, paths } from '../paths';

export interface FilterState {
  /** The filter the address carries, or the empty filter when it has none. */
  readonly filter: Filter;
  /** Puts a filter in the address, which is what narrows the list. */
  readonly setFilter: (filter: Filter) => void;
}

/**
 * The list's filter, held in the address rather than in component state, so a
 * refresh, the back button and a pasted link all show the list somebody was
 * looking at.
 *
 * The text only becomes a filter through the filter package's own reader, so
 * the address cannot put anything in front of the API that the language would
 * refuse. Text that does not read as a filter lists every check, as the empty
 * filter does, rather than breaking the page.
 *
 * Setting a filter navigates to the list's address for it, so it belongs to
 * the list screen, which lives at that address.
 */
export function useFilter(): FilterState {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const text = searchParams.get(filterParameter);

  const filter = useMemo(() => {
    if (text === null) {
      return emptyFilter;
    }
    const parsed = parseFilterString(text);
    return parsed.ok ? parsed.filter : emptyFilter;
  }, [text]);

  const setFilter = useCallback(
    (next: Filter) => {
      void navigate(paths.checks({ filter: next }));
    },
    [navigate],
  );

  return { filter, setFilter };
}
