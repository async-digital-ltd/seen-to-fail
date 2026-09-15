import type { ReactElement } from 'react';

import './loading.css';

interface LoadingProps {
  /** What is on its way, when the screen wants to say. */
  readonly label?: string;
}

/**
 * The one loading state. A status region, so a screen reader announces it
 * without being interrupted by it.
 */
export function Loading({ label = 'Loading…' }: LoadingProps): ReactElement {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  );
}
