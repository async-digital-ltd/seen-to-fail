import type { ReactElement } from 'react';

import type { Outcome } from '../graphql/generated/graphql';
import './outcome-badge.css';

/**
 * What a run's outcome is called, marked with, and styled by. The mark sits
 * beside the colour for the same reason a status has a glyph: a reader who
 * cannot tell the green from the red still sees the tick or the cross, and
 * reads the word.
 *
 * The modifier is written down rather than made from the label, because one of
 * the labels is two words and a class built from it would carry the space into
 * the markup. A question mark for the third, because neither a tick nor a cross
 * is honest about a run that answered nothing.
 */
const outcomes = {
  CAUGHT: { label: 'Caught', glyph: '✓', modifier: 'caught' },
  MISSED: { label: 'Missed', glyph: '✕', modifier: 'missed' },
  INCONCLUSIVE: {
    label: 'Settled nothing',
    glyph: '?',
    modifier: 'inconclusive',
  },
} as const satisfies Record<
  Outcome,
  { label: string; glyph: string; modifier: string }
>;

interface OutcomeBadgeProps {
  /** The outcome, as the API's enum spells it. */
  readonly outcome: Outcome;
}

/** A run's outcome as one inline mark: the glyph and the word. */
export function OutcomeBadge({ outcome }: OutcomeBadgeProps): ReactElement {
  const { label, glyph, modifier } = outcomes[outcome];
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
