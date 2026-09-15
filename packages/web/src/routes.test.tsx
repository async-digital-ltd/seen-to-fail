import { screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { CheckDetailDocument } from './graphql/generated/graphql';
import { paths } from './paths';
import { createRoutes } from './routes';
import { answer } from './testing/client';
import { renderApp } from './testing/render';

const footerSentence =
  'Async Digital is a one-person studio testing, in the open, what really changes when AI can write the code.';

/** Every address the app answers, and the heading its screen carries. */
const screens = [
  { route: paths.checks(), heading: 'Checks' },
  { route: paths.newCheck(), heading: 'Add a check' },
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

  it('fills no more than one action with brick', () => {
    const { container } = renderApp({ route });

    expect(
      container.querySelectorAll('.button--primary').length,
    ).toBeLessThanOrEqual(1);
  });
});

describe('at a check address', () => {
  it('renders the check detail screen inside the shell', async () => {
    const { calls } = renderApp({
      route: paths.check('ci-lint'),
      answers: [answer(CheckDetailDocument, { check: null })],
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check not found' }),
    ).toBeInTheDocument();
    expect(calls).toEqual([
      { kind: 'query', name: 'CheckDetail', variables: { id: 'ci-lint' } },
    ]);
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

  it('offers to log a test run from every screen, outlined rather than filled', () => {
    renderApp({ route: paths.newCheck() });

    const button = within(screen.getByRole('banner')).getByRole('link', {
      name: 'Log a test run',
    });
    expect(button).toHaveAttribute('href', '/runs/new');
    expect(button).toHaveClass('button', 'button--outlined');
    expect(button).not.toHaveClass('button--primary');
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
    expect(screen.getByRole('main')).toHaveTextContent(
      "There's no page at this address.",
    );
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
      'The app ran into a bug.',
    );
    expect(
      screen.getByRole('link', { name: 'Log a test run' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toHaveTextContent(footerSentence);
  });
});

describe('a screen with a primary action of its own', () => {
  function Form(): ReactElement {
    return (
      <form>
        <h1>A form</h1>
        <button type="submit" className="button button--primary">
          Save
        </button>
      </form>
    );
  }

  it('is the only thing on the page filled with brick', () => {
    const { container } = renderApp({
      route: '/form',
      routes: createRoutes([{ path: 'form', element: <Form /> }]),
    });

    expect([...container.querySelectorAll('.button--primary')]).toEqual([
      screen.getByRole('button', { name: 'Save' }),
    ]);
  });
});
