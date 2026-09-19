import type { Status } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';

import { StatusGlyph } from './status-badge';
import './status-tile.css';

/** What each status means, in the few words a tile has room for. */
const hints = {
  Proven: 'Caught a planted defect',
  Broken: 'Latest run missed',
  Stale: 'Last proof is old',
  Unproven: 'Never seen to fail',
  Unarmed: 'No evidence it is on',
} as const satisfies Record<Status, string>;

interface StatusTileProps {
  readonly status: Status;
  /** How many checks hold the status, across the whole workspace. */
  readonly count: number;
  /** True when the list is narrowed to this status and nothing else. */
  readonly selected: boolean;
  /** Called with the tile's status when somebody presses it. */
  readonly onSelect: (status: Status) => void;
}

/**
 * One status, how many checks hold it, and what it means, as a button. What
 * pressing it does is the screen's decision, so the tile only says which
 * status was pressed.
 *
 * A tile is pressed while the list is showing its status alone, and stays
 * pressed when pressed again: the screen treats a press for what is already
 * shown as no step, as ToggleField leaves a pressed choice pressed. So the
 * tile is a toggle button that a reader can only switch on, and the
 * stylesheet gives the pressed one a thicker edge.
 *
 * The spaces between the parts are for the button's accessible name. The
 * parts are flex items, so the spaces take no room on screen, but without them
 * a screen reader hears "1ProvenCaught a planted defect" as one word.
 */
export function StatusTile({
  status,
  count,
  selected,
  onSelect,
}: StatusTileProps): ReactElement {
  return (
    <button
      type="button"
      className="status-tile"
      aria-pressed={selected}
      onClick={() => {
        onSelect(status);
      }}
    >
      <span className="status-tile__head">
        <StatusGlyph status={status} />{' '}
        <span className="status-tile__count">{count}</span>{' '}
        <span className="status-tile__label">{status}</span>
      </span>{' '}
      <span className="status-tile__hint">{hints[status]}</span>
    </button>
  );
}
