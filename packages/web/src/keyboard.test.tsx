import type { Filter } from '@seen-to-fail/filter';
import { screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  CreateCheckDocument,
  LogTestRunDocument,
  RecordArmingObservationDocument,
} from './graphql/generated/graphql';
import { loggedSentence } from './pages/log-run';
import { paths } from './paths';
import type { Answer, Call } from './testing/client';
import { answer } from './testing/client';
import { renderApp } from './testing/render';
import { detail, empty, lint, options, populated } from './testing/workspace';

/**
 * The web epic's "Done when" list, walked with the keyboard alone (#28).
 *
 * Every test starts with nothing focused and moves only by Tab, Shift+Tab,
 * Enter, Space and Escape, typing where a field wants text. Nothing is
 * clicked and nothing is focused by the test itself, so a control that only a
 * pointer can reach, or that a key does not work, fails here.
 *
 * The one exception is a native `<select>`. A browser opens one and moves
 * through it with the arrow keys, which user-event does not emulate, so the
 * condition picker's selects are reached by Tab and then given their value
 * with `selectOptions` on the control focus is already on.
 */

const everything: readonly Answer[] = [...populated, detail, options];

/**
 * Tabs forward until focus is on what `wanted` finds, and fails the test if
 * it never gets there. What matters is that the control is reached, not how
 * many stops precede it, so the count is not asserted.
 */
async function tabTo(
  user: UserEvent,
  wanted: () => HTMLElement,
  limit = 60,
): Promise<HTMLElement> {
  for (let step = 0; step < limit; step += 1) {
    await user.tab();
    const target = wanted();
    if (document.activeElement === target) {
      return target;
    }
  }
  throw new Error(
    `Tab never reached ${wanted().outerHTML.slice(0, 120)} in ${String(limit)} stops.`,
  );
}

function names(calls: readonly Call[]): string[] {
  return calls.map((call) => call.name);
}

function onlyStatus(value: 'Proven' | 'Unarmed'): Filter {
  return {
    kind: 'groups',
    joiner: 'and',
    groups: [
      { joiner: 'and', conditions: [{ field: 'status', op: 'is', value }] },
    ],
  };
}

const twoConditions: Filter = {
  kind: 'groups',
  joiner: 'and',
  groups: [
    {
      joiner: 'and',
      conditions: [
        { field: 'status', op: 'is', value: 'Proven' },
        { field: 'area', op: 'is', value: 'CI' },
      ],
    },
  ],
};

describe('all five screens, each reached from the list', () => {
  it("opens a check's page from its row, and goes back to the list", async () => {
    const { router, user } = renderApp({ answers: everything });
    await screen.findByText('Secrets never committed');

    await tabTo(user, () =>
      screen.getByRole('link', { name: 'Open check', description: lint.name }),
    );
    await user.keyboard('{Enter}');

    expect(router.state.location.pathname).toBe(paths.check(lint.id));
    expect(
      await screen.findByRole('heading', { level: 1, name: lint.name }),
    ).toBeInTheDocument();

    await tabTo(user, () => screen.getByRole('link', { name: 'Checks' }));
    await user.keyboard('{Enter}');

    expect(router.state.location.pathname).toBe(paths.checks());
  });

  it('opens the add-check form from under the list', async () => {
    const { router, user } = renderApp({ answers: everything });
    await screen.findByText('Secrets never committed');

    await tabTo(user, () => screen.getByRole('link', { name: 'Add a check' }));
    await user.keyboard('{Enter}');

    expect(router.state.location.pathname).toBe(paths.newCheck());
  });

  it('opens the run form from the top bar', async () => {
    const { router, user } = renderApp({ answers: everything });
    await screen.findByText('Secrets never committed');

    await tabTo(user, () =>
      screen.getByRole('link', { name: 'Log a test run' }),
    );
    await user.keyboard('{Enter}');

    expect(router.state.location.pathname).toBe(paths.newRun());
  });

  it('opens the add-check form from the empty workspace', async () => {
    const { router, user } = renderApp({ answers: empty });
    await screen.findByRole('heading', { name: 'No checks yet' });

    await tabTo(user, () => screen.getByRole('link', { name: 'Add a check' }));
    await user.keyboard('{Enter}');

    expect(router.state.location.pathname).toBe(paths.newCheck());
  });
});

describe('the filter in the address, and Copy link', () => {
  it('narrows the list from a tile with Space, copies the link and clears it with Enter', async () => {
    const { router, user } = renderApp({ answers: everything });
    await screen.findByText('Secrets never committed');

    const tile = await tabTo(user, () =>
      screen.getByRole('button', { name: /^1 Proven/ }),
    );
    await user.keyboard(' ');

    await waitFor(() => {
      expect(tile).toHaveAttribute('aria-pressed', 'true');
    });
    const narrowed = paths.checks({ filter: onlyStatus('Proven') });
    expect(
      `${router.state.location.pathname}${router.state.location.search}`,
    ).toBe(narrowed);

    await tabTo(user, () => screen.getByRole('button', { name: 'Copy link' }));
    await user.keyboard('{Enter}');

    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}${narrowed}`,
    );
    expect(await screen.findByText('Copied')).toBeInTheDocument();

    await tabTo(user, () => screen.getByRole('button', { name: 'Clear' }));
    await user.keyboard('{Enter}');

    expect(router.state.location.search).toBe('');
  });

  it('adds a condition from the picker, and closes it again on Escape', async () => {
    const { router, user } = renderApp({ answers: everything });
    await screen.findByText('Secrets never committed');

    await tabTo(user, () =>
      screen.getByRole('button', { name: 'Add a condition' }),
    );
    await user.keyboard('{Enter}');
    const picker = screen.getByRole('form', { name: 'New condition' });
    expect(within(picker).getByLabelText('Field')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('form', { name: 'New condition' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add a condition' }),
    ).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.tab();
    await user.tab();
    const value = screen.getByLabelText('Value');
    expect(value).toHaveFocus();
    await user.selectOptions(value, 'Unarmed');
    await tabTo(user, () => screen.getByRole('button', { name: 'Add' }));
    await user.keyboard('{Enter}');

    expect(
      `${router.state.location.pathname}${router.state.location.search}`,
    ).toBe(paths.checks({ filter: onlyStatus('Unarmed') }));
  });

  it('switches a joiner pill and removes a chip from the keyboard', async () => {
    const { router, user } = renderApp({
      route: paths.checks({ filter: twoConditions }),
      answers: everything,
    });
    await screen.findByText('Secrets never committed');

    await tabTo(user, () =>
      screen.getByRole('button', { name: /^AND, switch to OR/ }),
    );
    await user.keyboard('{Enter}');

    const either: Filter = {
      ...twoConditions,
      groups: [{ ...twoConditions.groups[0], joiner: 'or' }],
    };
    await waitFor(() => {
      expect(
        `${router.state.location.pathname}${router.state.location.search}`,
      ).toBe(paths.checks({ filter: either }));
    });

    await tabTo(user, () =>
      screen.getByRole('button', { name: /^Remove area is CI/ }),
    );
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(router.state.location.search).not.toContain('area');
    });
    expect(router.state.location.search).toContain('Proven');
  });
});

describe('the rows of the list', () => {
  it('open with Enter and close with Space, saying which they are', async () => {
    const { user } = renderApp({ answers: everything });
    await screen.findByText('Secrets never committed');

    const row = await tabTo(user, () =>
      screen.getByRole('button', { name: /^Lint on every push/ }),
    );
    expect(row).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{Enter}');
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('An unused import.')).toBeInTheDocument();

    await user.keyboard(' ');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('An unused import.')).not.toBeInTheDocument();
  });
});

describe('the forms, refusing and then saving', () => {
  it('adds a check: the refusal is summed up and marked on its field, then the check is saved', async () => {
    const created = answer(CreateCheckDocument, {
      createCheck: {
        __typename: 'Check',
        id: 'lint-on-push',
        name: 'Lint on push',
        status: 'UNARMED',
      },
    });
    const { calls, router, user } = renderApp({
      route: paths.newCheck(),
      answers: [...everything, created],
    });
    await screen.findByRole('button', { name: 'Save check' });

    await tabTo(user, () => screen.getByRole('button', { name: 'Save check' }));
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const name = screen.getByLabelText('Name');
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/./);
    expect(names(calls)).not.toContain('CreateCheck');

    await user.keyboard('Lint on push');
    await user.tab();
    await user.keyboard('CI');
    await tabTo(user, () => screen.getByRole('button', { name: 'Save check' }));
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.check('lint-on-push'));
    });
  });

  it('logs a run: the refusal is summed up and marked, then the run is saved and the next one started', async () => {
    const logged = answer(LogTestRunDocument, {
      logTestRun: {
        __typename: 'TestRunLogged',
        testRun: { id: 'run-2' },
        check: { id: lint.id, name: lint.name, status: 'PROVEN', runCount: 2 },
      },
    });
    const { calls, user } = renderApp({
      route: paths.newRun({ check: lint.id }),
      answers: [...everything, logged],
    });
    await screen.findByRole('button', { name: 'Save run' });

    await tabTo(user, () => screen.getByRole('button', { name: 'Save run' }));
    await user.keyboard('{Enter}');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    const planted = screen.getByLabelText('What you planted');
    expect(planted).toHaveFocus();
    expect(planted).toHaveAttribute('aria-invalid', 'true');
    expect(planted).toHaveAccessibleDescription(/./);
    expect(names(calls)).not.toContain('LogTestRun');

    await user.keyboard('An unused import.');
    await user.tab();
    await user.keyboard('The push is refused.');
    await tabTo(user, () => screen.getByRole('button', { name: 'Caught it' }));
    await user.keyboard(' ');
    await tabTo(user, () => screen.getByRole('button', { name: 'Save run' }));
    await user.keyboard('{Enter}');

    const sentence = await screen.findByText(
      loggedSentence({ name: lint.name, status: 'PROVEN', runCount: 2 }),
    );
    expect(sentence).toHaveFocus();

    await tabTo(user, () =>
      screen.getByRole('button', { name: 'Log another run' }),
    );
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('button', { name: 'Save run' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Check')).toHaveValue(lint.id);
  });

  it("records an observation on a check's page: refused, then saved", async () => {
    const recorded = answer(RecordArmingObservationDocument, {
      recordArmingObservation: {
        __typename: 'ArmingObservationRecorded',
        armingObservation: { id: 'observation-1' },
        check: { id: lint.id, status: 'PROVEN' },
      },
    });
    const { calls, user } = renderApp({
      route: paths.check(lint.id),
      answers: [...everything, recorded],
    });
    await screen.findByRole('heading', { level: 1, name: lint.name });

    const toggle = await tabTo(user, () =>
      screen.getByRole('button', { name: 'Record an observation' }),
    );
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Date')).toHaveFocus();

    await tabTo(user, () =>
      screen.getByRole('button', { name: 'Save observation' }),
    );
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(names(calls)).not.toContain('RecordArmingObservation');

    const on = screen.getByRole('button', { name: 'It is on' });
    await user.keyboard('{Shift>}{Tab}{/Shift}');
    for (let step = 0; step < 10 && document.activeElement !== on; step += 1) {
      await user.keyboard('{Shift>}{Tab}{/Shift}');
    }
    expect(on).toHaveFocus();
    await user.keyboard(' ');
    await tabTo(user, () =>
      screen.getByRole('button', { name: 'Save observation' }),
    );
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(names(calls)).toContain('RecordArmingObservation');
    });
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
    expect(toggle).toHaveFocus();
  });
});
