import type { Status } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';

import './status-badge.css';

/**
 * The mark each status carries beside its colour. Colour is never the only
 * thing telling two statuses apart: a reader who cannot see the green still
 * sees the tick, and the label beside it says the word.
 */
const glyphs = {
  Proven: '✓',
  Broken: '✕',
  Stale: '!',
  Unproven: '?',
  Unarmed: '○',
} as const satisfies Record<Status, string>;

interface StatusProps {
  /** The status, spelled as the filter language spells it. */
  readonly status: Status;
}

/**
 * The round mark on its own, for a place that sets the label itself, such as a
 * status tile with its count between the two.
 *
 * Hidden from assistive technology, because the label beside it already says
 * the word, and a screen reader announcing "check mark Proven" says it twice.
 */
export function StatusGlyph({ status }: StatusProps): ReactElement {
  return (
    <span
      className={`status-glyph status-glyph--${status.toLowerCase()}`}
      aria-hidden="true"
    >
      {glyphs[status]}
    </span>
  );
}

/**
 * A check's status as one inline mark: the glyph and the word. Every screen
 * that shows a status shows it with this, so a status looks the same wherever
 * it is read.
 */
export function StatusBadge({ status }: StatusProps): ReactElement {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>
      <StatusGlyph status={status} />
      <span className="status-badge__label">{status}</span>
    </span>
  );
}
