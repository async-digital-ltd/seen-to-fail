import {
  emptyFilter,
  parseFilterString,
  serializeFilter,
} from '@seen-to-fail/filter';
import type { Filter, FilterIssue } from '@seen-to-fail/filter';
import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { filterParameter, paths } from '../paths';

export interface FilterState {
  /** The filter the address carries, or the empty filter when it has none. */
  readonly filter: Filter;
  /** Puts a filter in the address, which is what narrows the list. */
  readonly setFilter: (filter: Filter) => void;
  /**
   * The language's reasons for refusing the text in the address, when it
   * refused it. Undefined when the address carries no filter, or one that
   * reads. While this is set, `filter` is the empty filter, so the list shows
   * every check and the screen can say why.
   */
  readonly unreadable: readonly FilterIssue[] | undefined;
}

/** What the address holds, once read. */
interface Reading {
  readonly filter: Filter;
  readonly unreadable: readonly FilterIssue[] | undefined;
}

const nothing: Reading = { filter: emptyFilter, unreadable: undefined };

/**
 * The list's filter, held in the address rather than in component state, so a
 * refresh, the back button and a pasted link all show the list somebody was
 * looking at. The address is the only copy: the filter bar, the status tiles
 * and a saved view all change the list by writing here, and read back what
 * they wrote.
 *
 * The text only becomes a filter through the filter package's own reader, so
 * the address cannot put anything in front of the API that the language would
 * refuse. Text that does not read as a filter lists every check, as the empty
 * filter does, rather than breaking the page, and the reasons are handed back
 * so the screen can say the link was not read rather than quietly showing a
 * list the link did not ask for.
 *
 * Setting a filter navigates to the list's address for it, so it belongs to
 * the list screen, which lives at that address. It navigates rather than
 * replacing the entry, so the back button steps back through what was built:
 * a reader who presses a tile and then back sees the whole list again, rather
 * than leaving the app. A change that leaves the filter as the address already
 * reads it, such as pressing the tile of the status already shown, is not a
 * step and adds no entry, or the back button would have to be pressed twice
 * to undo one thing.
 */
export function useFilter(): FilterState {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const text = searchParams.get(filterParameter);

  const reading = useMemo((): Reading => {
    if (text === null) {
      return nothing;
    }
    const parsed = parseFilterString(text);
    return parsed.ok
      ? { filter: parsed.filter, unreadable: undefined }
      : { filter: emptyFilter, unreadable: parsed.errors };
  }, [text]);

  const setFilter = useCallback(
    (next: Filter) => {
      // Compared as the language writes them, so an address that reads as the
      // same filter counts as the same whatever spelling it arrived in. An
      // address that did not read is always worth leaving.
      const unchanged =
        reading.unreadable === undefined &&
        serializeFilter(next) === serializeFilter(reading.filter);
      if (unchanged) {
        return;
      }
      void navigate(paths.checks({ filter: next }));
    },
    [navigate, reading],
  );

  return { ...reading, setFilter };
}
