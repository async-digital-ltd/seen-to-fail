import { screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import type { CheckDetailQuery } from './graphql/generated/graphql';
import {
  AreasDocument,
  CheckDetailDocument,
  CheckOptionsDocument,
  ChecksDocument,
  StatusCountsDocument,
} from './graphql/generated/graphql';
import type { ListedCheck } from './pages/checks/check-row';
import { paths } from './paths';
import { createRoutes } from './routes';
import type { Answer } from './testing/client';
import { answer } from './testing/client';
import { renderApp } from './testing/render';

const footerSentence =
  'Async Digital is a one-person studio testing, in the open, what really changes when AI can write the code.';

/**
 * A workspace of two checks: enough for the list to have rows, the run form a
 * choice, and a check's page a record to show. Every screen in the table below
 * is rendered with the answers it asks for, so what is counted on it is the
 * screen and not the notice a missing answer would put in its place (#47).
 */
const lint = {
  id: 'ci-lint',
  name: 'Lint on every push',
  area: 'CI',
};

const listed: readonly ListedCheck[] = [
  {
    ...lint,
    status: 'PROVEN',
    lastCaughtOn: '2026-09-12',
    runCount: 1,
    runs: [
      {
        id: 'run-1',
        runOn: '2026-09-12',
        outcome: 'CAUGHT',
        planted: 'An unused import.',
      },
    ],
  },
  {
    id: 'git-secrets',
    name: 'Secrets never committed',
    area: 'Git',
    status: 'UNARMED',
    lastCaughtOn: null,
    runCount: 0,
    runs: [],
  },
];

const recorded: NonNullable<CheckDetailQuery['check']> = {
  ...lint,
  protects: 'A file that no longer lints reaching the main branch.',
  howToTellArmed: 'The lint job is listed on every push.',
  status: 'PROVEN',
  lastCaughtOn: '2026-09-12',
  lastSettledOn: '2026-09-12',
  runCount: 1,
  caughtCount: 1,
  missedCount: 0,
  inconclusiveCount: 0,
  runs: [
    {
      id: 'run-1',
      runOn: '2026-09-12',
      planted: 'An unused import.',
      expected: 'The push is refused.',
      outcome: 'CAUGHT',
      inconclusiveReason: null,
      note: null,
      source: 'HAND',
      sourceCommit: null,
      sourceRunUrl: null,
    },
  ],
  armingObservations: [],
};

const areas = answer(AreasDocument, { areas: ['CI', 'Git'] });

const populated: readonly Answer[] = [
  answer(StatusCountsDocument, {
    statusCounts: {
      proven: 1,
      broken: 0,
      stale: 0,
      unproven: 0,
      unarmed: 1,
      total: 2,
    },
  }),
  answer(ChecksDocument, {
    checks: { checks: listed, matching: 2, hidden: 0 },
  }),
  areas,
];

const empty: readonly Answer[] = [
  answer(StatusCountsDocument, {
    statusCounts: {
      proven: 0,
      broken: 0,
      stale: 0,
      unproven: 0,
      unarmed: 0,
      total: 0,
    },
  }),
  answer(ChecksDocument, { checks: { checks: [], matching: 0, hidden: 0 } }),
  areas,
];

const options = answer(CheckOptionsDocument, {
  checks: { checks: listed.map(({ id, name }) => ({ id, name })) },
});

const detail = answer(CheckDetailDocument, { check: recorded });

const saveRun = () => screen.findByRole('button', { name: 'Save run' });

/**
 * Every address the app answers, what its screen shows once its answers have
 * arrived, and how many actions that screen fills with brick.
 *
 * `landed` finds something only the screen's own content has. Until it is on
 * screen the address shows a loading line or, with no answer, an error notice,
 * and neither has a brick fill: a count taken then says nothing about the
 * screen. That is how this table passed for two screens it never rendered.
 *
 * `fills` is the count the design gives each screen, not a ceiling. The brand
 * rule is one filled brick action per screen at most, and which screens spend
 * theirs is decided: the populated list spends none, because its one fill is
 * the empty state's, so a fill added to it is refused here as surely as a
 * second fill anywhere else.
 */
const screens: readonly {
  readonly route: string;
  readonly showing: string;
  readonly heading: string;
  readonly answers: readonly Answer[];
  readonly landed: () => Promise<HTMLElement>;
  readonly fills: number;
}[] = [
  {
    route: paths.checks(),
    showing: 'a list of checks',
    heading: 'Checks',
    answers: populated,
    landed: () => screen.findByText('Secrets never committed'),
    fills: 0,
  },
  {
    route: paths.checks(),
    showing: 'an empty workspace',
    heading: 'Checks',
    answers: empty,
    landed: () =>
      screen.findByRole('heading', { level: 2, name: 'No checks yet' }),
    fills: 1,
  },
  {
    route: paths.newCheck(),
    showing: 'the form',
    heading: 'Add a check',
    answers: [areas],
    landed: () => screen.findByRole('button', { name: 'Save check' }),
    fills: 1,
  },
  {
    route: paths.check(lint.id),
    showing: 'the check',
    heading: lint.name,
    answers: [detail],
    landed: () => screen.findByRole('heading', { level: 1, name: lint.name }),
    fills: 1,
  },
  {
    route: paths.newRun(),
    showing: 'the form',
    heading: 'Log a test run',
    answers: [options],
    landed: saveRun,
    fills: 1,
  },
  {
    route: paths.newRun({ check: lint.id }),
    showing: 'the form with the check chosen',
    heading: 'Log a test run',
    answers: [options],
    landed: saveRun,
    fills: 1,
  },
];

describe.each(screens)(
  'at $route, showing $showing',
  ({ route, heading, answers, landed, fills }) => {
    it('renders the screen inside the shell', async () => {
      renderApp({ route, answers });
      await landed();

      expect(
        screen.getByRole('heading', { level: 1, name: heading }),
      ).toBeInTheDocument();
      // The shell, by its home link: a check's page has a header of its own,
      // so the banner role alone would find two.
      expect(
        screen.getByRole('link', { name: 'Seen to Fail Async Digital' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('contentinfo')).toHaveTextContent(footerSentence);
    });

    it(
      fills === 0
        ? 'fills no action with brick'
        : 'fills one action with brick, and only one',
      async () => {
        const { container } = renderApp({ route, answers });
        await landed();
        // The screen itself, with nothing on it standing in for an answer.
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        expect(container.querySelectorAll('.button--primary')).toHaveLength(
          fills,
        );
      },
    );
  },
);

/**
 * The heading alone does not say a screen has landed. A stand-in carries the
 * heading its finished screen will carry, which is what kept this address
 * passing the block above while nothing was built. So this asks the address
 * for something only the screen itself has: a field, and the button that
 * writes it.
 */
describe('at the add-check address', () => {
  it('answers with the form, not a screen still to come', async () => {
    const { calls } = renderApp({
      route: paths.newCheck(),
      answers: [answer(AreasDocument, { areas: ['CI'] })],
    });

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save check' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(calls.map((call) => call.name)).toContain('Areas');
    });
  });
});

describe('at a check address', () => {
  it('renders the check detail screen, asking for that id, inside the shell', async () => {
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

  it('offers to log a test run, outlined rather than filled', () => {
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
