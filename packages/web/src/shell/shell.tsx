import type { ReactElement } from 'react';
import { Link, Outlet } from 'react-router';

import { paths } from '../paths';
import './shell.css';

/**
 * What every screen shares: the top bar, the page column and the footer. The
 * screen itself renders through the outlet.
 *
 * The name and the studio are one link rather than two. Both go home, and a
 * reader tabbing through the bar should meet one way there, not the same way
 * twice.
 */
export function Shell(): ReactElement {
  return (
    <div className="page">
      <header className="top-bar">
        <Link to={paths.checks()} className="top-bar__home">
          <span className="top-bar__name">Seen to Fail</span>{' '}
          <span className="muted">Async Digital</span>
        </Link>
        <Link to={paths.newRun()} className="button button--primary">
          Log a test run
        </Link>
      </header>
      <main className="page__main">
        <Outlet />
      </main>
      <footer className="footer">
        <p>
          Async Digital is a one-person studio testing, in the open, what really
          changes when AI can write the code.
        </p>
      </footer>
    </div>
  );
}
