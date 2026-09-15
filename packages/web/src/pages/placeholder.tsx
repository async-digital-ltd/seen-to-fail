import type { ReactElement } from 'react';

interface PlaceholderProps {
  /** The heading the finished screen will carry. */
  readonly title: string;
}

/**
 * Stands in for a screen whose story has not landed, so that every address
 * already renders the shell around something.
 */
export function Placeholder({ title }: PlaceholderProps): ReactElement {
  return (
    <>
      <h1>{title}</h1>
      <p className="muted">This screen has not been built yet.</p>
    </>
  );
}
