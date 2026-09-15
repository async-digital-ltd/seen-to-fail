import type { ReactElement } from 'react';
import { CombinedError } from 'urql';

import './error-notice.css';

interface ErrorNoticeProps {
  /**
   * What went wrong. A CombinedError from the client is put into plain words;
   * anything else gets the general sentence, since its message was written for
   * a developer.
   */
  readonly error: unknown;
  /**
   * Given, the notice offers a "Try again" button that calls it. Absent, the
   * notice tells the reader to reload the page instead.
   */
  readonly onRetry?: () => void;
}

/**
 * One calm sentence for an error, for a reader who cannot fix the server.
 *
 * A network failure and a GraphQL error are told apart because the reader can
 * act on the first, by checking the server is running, and only report the
 * second.
 */
export function describeError(error: unknown): string {
  if (error instanceof CombinedError) {
    if (error.networkError !== undefined) {
      return 'The server could not be reached.';
    }
    if (error.graphQLErrors.length > 0) {
      const messages = error.graphQLErrors.map((cause) => cause.message);
      return `The server reported a problem: ${messages.join(' ')}`;
    }
  }
  return 'Something went wrong.';
}

/**
 * The one error state. An alert region, so a screen reader announces it as
 * soon as it appears, and the next step is always on it.
 */
export function ErrorNotice({
  error,
  onRetry,
}: ErrorNoticeProps): ReactElement {
  return (
    <div className="error-notice" role="alert">
      <p className="error-notice__what">{describeError(error)}</p>
      {onRetry === undefined ? (
        <p>Reload the page to try again.</p>
      ) : (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
