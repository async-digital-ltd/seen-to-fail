import { screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { paths } from './paths';
import { createRoutes } from './routes';
import { renderApp } from './testing/render';

const footerSentence =
  'Async Digital is a one-person studio testing, in the open, what really changes when AI can write the code.';

/** Every address the app answers, and the heading its screen carries. */
const screens = [
  { route: paths.checks(), heading: 'Checks' },
  { route: paths.newCheck(), heading: 'Add a check' },
  { route: paths.check('ci-lint'), heading: 'Check' },
  { route: paths.newRun(), heading: 'Log a test run' },
  { route: paths.newRun({ check: 'ci-lint' }), heading: 'Log a test run' },
];

describe.each(screens)('at $route', ({ route, heading }) => {
  it('renders the screen inside the shell', () => {
    renderApp({ route });

    expect(
      screen.getByRole('heading', { level: 1, name: heading }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent(footerSentence);
  });
});

describe('the top bar', () => {
  it('links the name and the studio home, as one link', () => {
    renderApp({ route: paths.newCheck() });

    const home = within(screen.getByRole('banner')).getByRole('link', {
      name: 'Seen to Fail Async Digital',
    });
    expect(home).toHaveAttribute('href', '/');
  });

  it('offers to log a test run from every screen', () => {
    renderApp({ route: paths.newCheck() });

    const button = within(screen.getByRole('banner')).getByRole('link', {
      name: 'Log a test run',
    });
    expect(button).toHaveAttribute('href', '/runs/new');
    expect(button).toHaveClass('button--primary');
  });

  it('goes home when the name is clicked', async () => {
    const { router, user } = renderApp({ route: paths.newCheck() });

    await user.click(
      screen.getByRole('link', { name: 'Seen to Fail Async Digital' }),
    );

    expect(router.state.location.pathname).toBe('/');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Checks' }),
    ).toBeInTheDocument();
  });
});

describe('an address no screen claims', () => {
  it('says so inside the shell and points home', () => {
    renderApp({ route: '/nothing/here' });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Go to the checks' }),
    ).toHaveAttribute('href', '/');
    expect(screen.getByRole('contentinfo')).toHaveTextContent(footerSentence);
  });
});

describe('a screen that throws', () => {
  function Broken(): ReactElement {
    throw new Error('The screen fell over.');
  }

  it('is replaced by the error notice, with the shell still standing', () => {
    renderApp({
      route: '/broken',
      routes: createRoutes([{ path: 'broken', element: <Broken /> }]),
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong.',
    );
    expect(
      screen.getByRole('link', { name: 'Log a test run' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent(footerSentence);
  });
});
