import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { PageTitle } from '../components/page-title';
import { paths } from '../paths';

/** An address no screen claims. Says so, and points at the list. */
export function NotFound(): ReactElement {
  return (
    <>
      <PageTitle page="Page not found" />
      <h1>Page not found</h1>
      <p>
        There's no page at this address.{' '}
        <Link to={paths.checks()}>Go to the checks</Link>.
      </p>
    </>
  );
}
