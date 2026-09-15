import type { ReactElement } from 'react';

import type { Outcome } from '../graphql/generated/graphql';
import './outcome-badge.css';

/**
 * What a run's outcome is called and marked with. The mark sits beside the
 * colour for the same reason a status has a glyph: a reader who cannot tell
 * the green from the red still sees the tick or the cross, and reads the word.
 */
const outcomes = {
  CAUGHT: { label: 'Caught', glyph: '✓' },
  MISSED: { label: 'Missed', glyph: '✕' },
} as const satisfies Record<Outcome, { label: string; glyph: string }>;

interface OutcomeBadgeProps {
  /** The outcome, as the API's enum spells it. */
  readonly outcome: Outcome;
}

/** A run's outcome as one inline mark: the glyph and the word. */
export function OutcomeBadge({ outcome }: OutcomeBadgeProps): ReactElement {
  const { label, glyph } = outcomes[outcome];
  const modifier = label.toLowerCase();
  return (
    <span className={`outcome-badge outcome-badge--${modifier}`}>
      <span
        className={`outcome-badge__glyph outcome-badge__glyph--${modifier}`}
        aria-hidden="true"
      >
        {glyph}
      </span>
      <span>{label}</span>
    </span>
  );
}
