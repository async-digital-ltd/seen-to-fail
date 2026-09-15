import type { ReactNode } from 'react';

import { summarySentence } from './field-errors';
import './form.css';

interface ErrorSummaryProps {
  /** The id focus lands on when no field is at fault but a message is. */
  readonly id: string;
  /** How many details are at fault. Nothing renders at zero. */
  readonly count: number;
  /** API messages with no field to sit beside. */
  readonly unplaced?: readonly string[];
}

/**
 * The one line at the top of a form that says how many details need fixing.
 *
 * An alert region, so a screen reader hears it when a submit is refused, even
 * though focus goes to the first field rather than here.
 */
export function ErrorSummary({
  id,
  count,
  unplaced = [],
}: ErrorSummaryProps): ReactNode {
  if (count === 0) {
    return null;
  }
  return (
    <div id={id} className="error-summary" role="alert" tabIndex={-1}>
      <p className="error-summary__line">{summarySentence(count)}</p>
      {unplaced.map((message, index) => (
        <p key={String(index)} className="error-summary__line">
          {message}
        </p>
      ))}
    </div>
  );
}
