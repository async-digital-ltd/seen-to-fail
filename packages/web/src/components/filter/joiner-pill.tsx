import type { Joiner } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';

/** A joiner as the pill spells it. */
const words = { and: 'AND', or: 'OR' } as const satisfies Record<
  Joiner,
  string
>;

/** The joiner a press switches to. */
const other = { and: 'or', or: 'and' } as const satisfies Record<
  Joiner,
  Joiner
>;

interface JoinerPillProps {
  readonly joiner: Joiner;
  /**
   * Whether the pill joins conditions inside a group or groups inside the
   * filter. The two are drawn differently so a reader can tell which level a
   * press changes.
   */
  readonly level: 'group' | 'filter';
  /** Called with the other joiner when the pill is pressed. */
  readonly onToggle: (joiner: Joiner) => void;
}

/**
 * The word between two conditions, or two groups, as a button that switches
 * it. Its name says both what it is and what pressing it does, because the
 * visible word alone does not say that it can be changed.
 */
export function JoinerPill({
  joiner,
  level,
  onToggle,
}: JoinerPillProps): ReactElement {
  return (
    <button
      type="button"
      className={`joiner joiner--${level}`}
      aria-label={`${words[joiner]}, switch to ${words[other[joiner]]}`}
      onClick={() => {
        onToggle(other[joiner]);
      }}
    >
      {words[joiner]}
    </button>
  );
}
