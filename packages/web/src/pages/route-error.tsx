import type { ReactElement } from 'react';
import { useRouteError } from 'react-router';

import { ErrorNotice } from '../components/error-notice';

/**
 * What renders in place of a screen that threw. It sits inside the shell, so
 * the top bar and the way home survive whatever the screen did.
 */
export function RouteError(): ReactElement {
  const error = useRouteError();
  return <ErrorNotice error={error} />;
}
