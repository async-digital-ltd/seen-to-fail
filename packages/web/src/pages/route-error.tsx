import type { ReactElement } from 'react';
import { useRouteError } from 'react-router';

import { ErrorNotice } from '../components/error-notice';
import { PageTitle } from '../components/page-title';

/**
 * What renders in place of a screen that threw. It sits inside the shell, so
 * the top bar and the way home survive whatever the screen did.
 */
export function RouteError(): ReactElement {
  const error = useRouteError();
  return (
    <>
      <PageTitle page="Something went wrong" />
      <ErrorNotice error={error} />
    </>
  );
}
