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
  /** Called with the tile's status when somebody presses it. */
  readonly onSelect: (status: Status) => void;
}

/**
 * One status, how many checks hold it, and what it means, as a button. What
 * pressing it does is the screen's decision, so the tile only says which
 * status was pressed.
 *
 * The spaces between the parts are for the button's accessible name. The
 * parts are flex items, so the spaces take no room on screen, but without them
 * a screen reader hears "1ProvenCaught a planted defect" as one word.
 */
export function StatusTile({
  status,
  count,
  onSelect,
}: StatusTileProps): ReactElement {
  return (
    <button
      type="button"
      className="status-tile"
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
