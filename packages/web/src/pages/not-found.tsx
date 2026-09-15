import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { paths } from '../paths';

/** An address no screen claims. Says so, and points at the list. */
export function NotFound(): ReactElement {
  return (
    <>
      <h1>Page not found</h1>
      <p>
        There is no page at this address.{' '}
        <Link to={paths.checks()}>Go to the checks</Link>.
      </p>
    </>
  );
}
