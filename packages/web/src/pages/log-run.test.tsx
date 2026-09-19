import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogTestRunMutation, Status } from '../graphql/generated/graphql';
import {
  CheckOptionsDocument,
  LogTestRunDocument,
} from '../graphql/generated/graphql';
import { paths } from '../paths';
import type { Answer } from '../testing/client';
import { answer, networkFailure, pending } from '../testing/client';
import { renderApp, renderWithProviders } from '../testing/render';
import { LogRun, loggedSentence } from './log-run';

const lint = {
  id: '5b0c7d1e-2f43-4a6b-9c8d-0e1f2a3b4c5d',
  name: 'Lint on commit',
};
const review = {
  id: '9e8d7c6b-5a49-4382-b1a0-f9e8d7c6b5a4',
  name: 'Review bot',
};

const options = answer(CheckOptionsDocument, {
  checks: { checks: [lint, review] },
});

type Logged = LogTestRunMutation['logTestRun'];

function logged(status: Status, runCount = 4): Answer {
  return answer(LogTestRunDocument, (variables) => ({
    logTestRun: {
      __typename: 'TestRunLogged',
      testRun: { id: 'c3d2e1f0-1a2b-4c3d-8e4f-5a6b7c8d9e0f' },
      check: {
        id: String(variables.input.checkId),
        name: lint.name,
        status,
        runCount,
      },
    } satisfies Logged,
  }));
}

function refused(...errors: { path: string; message: string }[]): Answer {
  return answer(LogTestRunDocument, {
    logTestRun: { __typename: 'ValidationErrors', errors },
  });
}

/** The day every test in this file is run on. */
const testDay = '2026-09-15';

beforeEach(() => {
  // Only Date is replaced, so the client's ticks and user-event still run.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

type Filled = 'check' | 'date' | 'planted' | 'expected' | 'outcome';

/** Fills in every required detail but the ones named. */
async function fillIn(
  user: UserEvent,
  { leaveOut = [] }: { readonly leaveOut?: readonly Filled[] } = {},
): Promise<void> {
  const check = await screen.findByLabelText('Check');
  if (!leaveOut.includes('check')) {
    await user.selectOptions(check, lint.name);
  }
  if (leaveOut.includes('date')) {
    await user.clear(screen.getByLabelText('Date'));
  }
  if (!leaveOut.includes('planted')) {
    await user.type(
      screen.getByLabelText('What you planted'),
      'An unused import in a changed file.',
    );
  }
  if (!leaveOut.includes('expected')) {
    await user.type(
      screen.getByLabelText('What you expected'),
      'The commit is refused.',
    );
  }
  if (!leaveOut.includes('outcome')) {
    await user.click(screen.getByRole('button', { name: 'Caught it' }));
  }
}

function logCalls(calls: readonly { name: string }[]): unknown[] {
  return calls.filter((call) => call.name === 'LogTestRun');
}

describe('opening the form', () => {
  it('pre-selects the check named in the query string', async () => {
    renderApp({
      route: paths.newRun({ check: review.id }),
      answers: [options],
    });

    expect(await screen.findByLabelText('Check')).toHaveValue(review.id);
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      paths.check(review.id),
    );
  });

  it('pre-selects nothing when the query string names no check', async () => {
    renderApp({ route: paths.newRun(), answers: [options] });

    expect(await screen.findByLabelText('Check')).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      paths.checks(),
    );
  });

  it('pre-selects nothing for a check that is not in the list', async () => {
    renderApp({
      route: paths.newRun({ check: 'no-such-check' }),
      answers: [options],
    });

    expect(await screen.findByLabelText('Check')).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      paths.checks(),
    );
  });

  it('dates the run today and offers no later day', async () => {
    renderApp({ route: paths.newRun(), answers: [options] });

    const date = await screen.findByLabelText('Date');
    expect(date).toHaveValue(testDay);
    expect(date).toHaveAttribute('max', testDay);
  });

  it('shows no error before the first submit', async () => {
    const { user } = renderApp({ route: paths.newRun(), answers: [options] });

    await user.type(await screen.findByLabelText('What you planted'), ' ');
    await user.clear(screen.getByLabelText('Date'));
    await user.tab();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-invalid]')).toBeNull();
    expect(document.querySelector('.field--invalid')).toBeNull();
  });
});

describe('the form refusing a submit', () => {
  it('marks every missing detail and sends nothing', async () => {
    const { user, calls } = renderApp({
      route: paths.newRun(),
      answers: [options, logged('PROVEN')],
    });
    await screen.findByLabelText('Check');

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '4 details are missing. They are marked below.',
    );
    expect(screen.getByLabelText('Check')).toHaveFocus();
    expect(logCalls(calls)).toEqual([]);
  });

  const required = [
    {
      leaveOut: 'check',
      control: () => screen.getByLabelText('Check'),
      message: 'Choose the check the defect was planted for.',
    },
    {
      leaveOut: 'date',
      control: () => screen.getByLabelText('Date'),
      message: 'Enter the day the defect was planted.',
    },
    {
      leaveOut: 'planted',
      control: () => screen.getByLabelText('What you planted'),
      message: 'Say what was planted.',
    },
    {
      leaveOut: 'expected',
      control: () => screen.getByLabelText('What you expected'),
      message: 'Say what the check was expected to do.',
    },
    {
      leaveOut: 'outcome',
      control: () => screen.getByRole('button', { name: 'Caught it' }),
      message: 'Say what the check did with it.',
    },
  ] as const;

  it.each(required)(
    'marks $leaveOut when it is the one detail missing',
    async ({ leaveOut, control, message }) => {
      const { user, calls } = renderApp({
        route: paths.newRun(),
        answers: [options, logged('PROVEN')],
      });
      await fillIn(user, { leaveOut: [leaveOut] });

      await user.click(screen.getByRole('button', { name: 'Save run' }));

      expect(screen.getByRole('alert')).toHaveTextContent(
        'One detail is missing. It is marked below.',
      );
      expect(control()).toHaveAccessibleDescription(message);
      expect(control()).toHaveFocus();
      expect(document.querySelectorAll('.field--invalid')).toHaveLength(1);
      expect(logCalls(calls)).toEqual([]);
    },
  );

  /**
   * The reason is asked for only when it is needed and required when it is.
   * A run that settled nothing and will not say why is a dead end for the next
   * reader: the plant no longer applying and the check already being red ask
   * for opposite things, and the status has not moved either way.
   */
  it('asks for a reason only once the run settles nothing', async () => {
    const { user } = renderApp({
      route: paths.newRun(),
      answers: [options, logged('PROVEN')],
    });
    await fillIn(user, { leaveOut: ['outcome'] });

    expect(screen.queryByLabelText('Why it settled nothing')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Settled nothing' }));
    expect(screen.getByLabelText('Why it settled nothing')).toBeInTheDocument();

    // And it goes away again, so a reason cannot be sent with a run that
    // settled something.
    await user.click(screen.getByRole('button', { name: 'Caught it' }));
    expect(screen.queryByLabelText('Why it settled nothing')).toBeNull();
  });

  it('refuses a run that settled nothing with no reason, and sends nothing', async () => {
    const { user, calls } = renderApp({
      route: paths.newRun(),
      answers: [options, logged('PROVEN')],
    });
    await fillIn(user, { leaveOut: ['outcome'] });
    await user.click(screen.getByRole('button', { name: 'Settled nothing' }));

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'One detail is missing. It is marked below.',
    );
    expect(
      screen.getByLabelText('Why it settled nothing'),
    ).toHaveAccessibleDescription('Say why the run settled nothing.');
    expect(logCalls(calls)).toEqual([]);
  });

  it('counts text of nothing but spaces as missing', async () => {
    const { user } = renderApp({
      route: paths.newRun(),
      answers: [options, logged('PROVEN')],
    });
    await fillIn(user, { leaveOut: ['planted'] });
    await user.type(screen.getByLabelText('What you planted'), '   ');

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    expect(
      screen.getByLabelText('What you planted'),
    ).toHaveAccessibleDescription('Say what was planted.');
  });

  it('refuses a date in the future', async () => {
    const { user, calls } = renderApp({
      route: paths.newRun(),
      answers: [options, logged('PROVEN')],
    });
    await fillIn(user);
    const date = screen.getByLabelText('Date');
    await user.clear(date);
    await user.type(date, '2026-09-16');

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    expect(date).toHaveAccessibleDescription(
      'A run cannot be dated after today.',
    );
    expect(date).toHaveFocus();
    expect(logCalls(calls)).toEqual([]);
  });

  it('shows a field error from the API beside its field', async () => {
    const { user } = renderApp({
      route: paths.newRun(),
      answers: [
        options,
        refused({
          path: 'checkId',
          message: 'There is no check with this id.',
        }),
      ],
    });
    await fillIn(user);

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    const check = screen.getByLabelText('Check');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'One detail is missing. It is marked below.',
    );
    expect(check).toHaveAccessibleDescription(
      'There is no check with this id.',
    );
    expect(check).toHaveFocus();
    expect(screen.getByLabelText('What you planted')).toHaveValue(
      'An unused import in a changed file.',
    );
  });

  it('puts focus on the first field the API refused, in form order', async () => {
    const { user } = renderApp({
      route: paths.newRun(),
      answers: [
        options,
        refused(
          {
            path: 'expected',
            message: 'Say what the check was expected to do.',
          },
          { path: 'runOn', message: 'A run cannot be dated after today.' },
        ),
      ],
    });
    await fillIn(user);

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '2 details are missing. They are marked below.',
    );
    expect(screen.getByLabelText('Date')).toHaveFocus();
    expect(
      screen.getByLabelText('What you expected'),
    ).toHaveAccessibleDescription('Say what the check was expected to do.');
  });

  it('shows an API error for a field the form lacks in the summary', async () => {
    const { user } = renderApp({
      route: paths.newRun(),
      answers: [
        options,
        refused({ path: 'somewhere', message: 'Something is not right.' }),
      ],
    });
    await fillIn(user);

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('Something is not right.');
    expect(summary).toHaveFocus();
  });

  it('says so when the run could not be sent, keeps what was typed and tries again', async () => {
    // The first send never arrives; the second is saved.
    const failure = networkFailure(LogTestRunDocument);
    const success = logged('PROVEN');
    let sends = 0;
    const flaky: Answer = {
      operationName: failure.operationName,
      respond: (operation) => {
        sends += 1;
        return (sends === 1 ? failure : success).respond(operation);
      },
    };
    const { user } = renderApp({
      route: paths.newRun(),
      answers: [options, flaky],
    });
    await fillIn(user);

    await user.click(screen.getByRole('button', { name: 'Save run' }));

    // The error notice, found by its role and its button rather than its copy,
    // which belongs to the shell.
    const notice = await screen.findByRole('alert');
    expect(screen.getByLabelText('What you expected')).toHaveValue(
      'The commit is refused.',
    );

    await user.click(within(notice).getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByText(
        'Lint on commit now has 4 runs. It reads Proven as of today.',
      ),
    ).toBeInTheDocument();
    expect(sends).toBe(2);
  });
});

describe('a saved run', () => {
  it('sends what was filled in', async () => {
    const { user, calls } = renderApp({
      route: paths.newRun(),
      answers: [options, logged('PROVEN')],
    });
    await fillIn(user);

    await user.click(screen.getByRole('button', { name: 'Save run' }));
    await screen.findByText(/now has/);

    expect(logCalls(calls)).toEqual([
      {
        kind: 'mutation',
        name: 'LogTestRun',
        variables: {
          input: {
            checkId: lint.id,
            runOn: testDay,
            planted: 'An unused import in a changed file.',
            expected: 'The commit is refused.',
            outcome: 'CAUGHT',
            // A run that settled the question carries no reason, and the form
            // sends none rather than the empty field it has for one.
            inconclusiveReason: null,
            note: null,
            // The form is the hand route and says so, rather than leaving the
            // API to assume it. There is no control for this on the page.
            source: 'HAND',
          },
        },
      },
    ]);
  });

  /**
   * The third outcome, from the form.
   *
   * Somebody who goes to plant the defect and finds the plant no longer fits
   * the code has learned something real. Without this choice they would have
   * to file it as a catch or a miss, either of which moves a status on
   * evidence that says nothing about the check, which is the failure this
   * outcome exists to stop.
   */
  it('sends a run that settled nothing with the reason for it', async () => {
    const { user, calls } = renderApp({
      route: paths.newRun(),
      answers: [options, logged('PROVEN')],
    });
    await fillIn(user, { leaveOut: ['outcome'] });
    await user.click(screen.getByRole('button', { name: 'Settled nothing' }));
    await user.type(
      screen.getByLabelText('Why it settled nothing'),
      'The anchor matches nothing any more.',
    );

    await user.click(screen.getByRole('button', { name: 'Save run' }));
    await screen.findByText(/now has/);

    expect(logCalls(calls)).toEqual([
      {
        kind: 'mutation',
        name: 'LogTestRun',
        variables: {
          input: {
            checkId: lint.id,
            runOn: testDay,
            planted: 'An unused import in a changed file.',
            expected: 'The commit is refused.',
            outcome: 'INCONCLUSIVE',
            inconclusiveReason: 'The anchor matches nothing any more.',
            note: null,
            source: 'HAND',
          },
        },
      },
    ]);
  });

  it.each([
    {
      status: 'PROVEN',
      sentence: 'Lint on commit now has 4 runs. It reads Proven as of today.',
    },
    {
      status: 'BROKEN',
      sentence:
        'Lint on commit now has 4 runs. It reads Broken. Fix the check, then log another run to prove it.',
    },
  ] as const)(
    'replaces the form with the card for $status',
    async ({ status, sentence }) => {
      const { user } = renderApp({
        route: paths.newRun(),
        answers: [options, logged(status)],
      });
      await fillIn(user);

      await user.click(screen.getByRole('button', { name: 'Save run' }));

      const card = await screen.findByText(sentence);
      expect(card).toHaveFocus();
      expect(screen.queryByLabelText('Check')).not.toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Back to checks' }),
      ).toHaveAttribute('href', paths.checks());
    },
  );

  it('opens a fresh form for the same check on "Log another run"', async () => {
    const { user } = renderApp({
      route: paths.newRun(),
      answers: [options, logged('PROVEN')],
    });
    await fillIn(user);
    await user.click(screen.getByRole('button', { name: 'Save run' }));

    await user.click(
      await screen.findByRole('button', { name: 'Log another run' }),
    );

    const check = await screen.findByLabelText('Check');
    expect(check).toHaveValue(lint.id);
    expect(check).toHaveFocus();
    expect(screen.getByLabelText('What you planted')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Caught it' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

it('opens a fresh form from the top bar while the card is showing', async () => {
  const { user } = renderApp({
    route: paths.newRun(),
    answers: [options, logged('PROVEN')],
  });
  await fillIn(user);
  await user.click(screen.getByRole('button', { name: 'Save run' }));
  await screen.findByRole('button', { name: 'Log another run' });

  await user.click(
    within(screen.getByRole('banner')).getByRole('link', {
      name: 'Log a test run',
    }),
  );

  expect(await screen.findByLabelText('Check')).toHaveValue('');
  expect(
    screen.queryByRole('button', { name: 'Log another run' }),
  ).not.toBeInTheDocument();
});

describe('the success sentence', () => {
  const check = { name: 'Review bot', runCount: 1 };

  it('counts a single run as one', () => {
    expect(loggedSentence({ ...check, status: 'PROVEN' })).toBe(
      'Review bot now has 1 run. It reads Proven as of today.',
    );
  });

  it('says why a check reads Stale or Unarmed after a run', () => {
    expect(loggedSentence({ ...check, status: 'STALE' })).toBe(
      'Review bot now has 1 run. It reads Stale, because its latest run is too old to rely on. Log a recent run to prove it.',
    );
    expect(loggedSentence({ ...check, status: 'UNARMED' })).toBe(
      'Review bot now has 1 run. It reads Unarmed, because the last time somebody looked, it was switched off.',
    );
  });
});

it('works end to end with the keyboard alone', async () => {
  const { user, calls } = renderWithProviders(<LogRun />, {
    route: paths.newRun({ check: lint.id }),
    answers: [options, logged('BROKEN', 2)],
  });
  await screen.findByLabelText('Check');

  await user.tab();
  expect(screen.getByLabelText('Check')).toHaveFocus();
  await user.tab();
  expect(screen.getByLabelText('Date')).toHaveFocus();
  await user.tab();
  await user.keyboard('A rule switched off in the config.');
  await user.tab();
  await user.keyboard('The build fails.');
  await user.tab();
  await user.tab();
  expect(screen.getByRole('button', { name: 'Missed it' })).toHaveFocus();
  await user.keyboard(' ');
  await user.tab();
  // The third choice is a tab stop of its own, between the second and the
  // note, and a keyboard reader passes through it on the way.
  expect(screen.getByRole('button', { name: 'Settled nothing' })).toHaveFocus();
  await user.tab();
  await user.keyboard('Nobody noticed for a week.');
  await user.tab();
  expect(screen.getByRole('button', { name: 'Save run' })).toHaveFocus();
  await user.keyboard('{Enter}');

  expect(
    await screen.findByText(
      'Lint on commit now has 2 runs. It reads Broken. Fix the check, then log another run to prove it.',
    ),
  ).toHaveFocus();
  expect(logCalls(calls)).toEqual([
    expect.objectContaining({
      variables: {
        input: {
          checkId: lint.id,
          runOn: testDay,
          planted: 'A rule switched off in the config.',
          expected: 'The build fails.',
          outcome: 'MISSED',
          inconclusiveReason: null,
          note: 'Nobody noticed for a week.',
          source: 'HAND',
        },
      },
    }),
  ]);

  await user.tab();
  expect(screen.getByRole('link', { name: 'Back to checks' })).toHaveFocus();
  await user.tab();
  await user.keyboard('{Enter}');
  expect(await screen.findByLabelText('Check')).toHaveFocus();
});

describe('the checks to choose from', () => {
  it('holds the loading state while they are on their way', () => {
    renderApp({
      route: paths.newRun(),
      answers: [pending(CheckOptionsDocument)],
    });

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Log a test run' }),
    ).toBeInTheDocument();
  });

  it('offers to try again when they cannot be read', async () => {
    renderApp({
      route: paths.newRun(),
      answers: [networkFailure(CheckOptionsDocument)],
    });

    const notice = await screen.findByRole('alert');
    expect(
      within(notice).getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Check')).not.toBeInTheDocument();
  });

  it('points at adding a check when there are none', async () => {
    renderApp({
      route: paths.newRun(),
      answers: [answer(CheckOptionsDocument, { checks: { checks: [] } })],
    });

    expect(
      await screen.findByRole('link', { name: 'Add a check' }),
    ).toHaveAttribute('href', paths.newCheck());
    expect(screen.getByRole('main')).toHaveTextContent(
      "There aren't any checks yet, so there's nothing to log a run against. Add a check first.",
    );
    expect(screen.queryByRole('button', { name: 'Save run' })).toBeNull();
  });

  it('lists every check by name', async () => {
    renderApp({ route: paths.newRun(), answers: [options] });

    const select = await screen.findByLabelText('Check');
    expect(
      within(select)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Choose a check', lint.name, review.name]);
  });
});
