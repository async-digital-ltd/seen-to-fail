import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Filter } from '@seen-to-fail/filter';
import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';

import { documentTitle } from './components/page-title';
import {
  CheckDetailDocument,
  CheckOptionsDocument,
  ChecksDocument,
  LogTestRunDocument,
  StatusCountsDocument,
} from './graphql/generated/graphql';
import { paths } from './paths';
import { createRoutes } from './routes';
import { axeViolations } from './testing/axe';
import type { Answer } from './testing/client';
import { answer, networkFailure, pending } from './testing/client';
import { filesUnder } from './testing/files';
import { renderApp } from './testing/render';
import {
  areas,
  detail,
  empty,
  lint,
  options,
  populated,
} from './testing/workspace';

/**
 * Every screen in every state it can be in, read by axe, with the title each
 * gives the document (#28).
 *
 * A state is the screen once `landed` finds something only that state shows,
 * and after `then` has done whatever opens it: a row opened, a form refused.
 * Axe reads the whole document, so a state is held to the same rules whether
 * it is a screen's first paint or the third thing a reader did on it.
 */

const unproven: Filter = {
  kind: 'groups',
  joiner: 'and',
  groups: [
    {
      joiner: 'and',
      conditions: [{ field: 'status', op: 'is', value: 'Unproven' }],
    },
  ],
};

const noneMatch: readonly Answer[] = [
  ...populated,
  answer(ChecksDocument, { checks: { checks: [], matching: 0, hidden: 2 } }),
];

const logged = answer(LogTestRunDocument, {
  logTestRun: {
    __typename: 'TestRunLogged',
    testRun: { id: 'run-2' },
    check: { id: lint.id, name: lint.name, status: 'PROVEN', runCount: 2 },
  },
});

function Broken(): ReactElement {
  throw new Error('The screen fell over.');
}

interface State {
  readonly screen: string;
  readonly state: string;
  readonly route: string;
  readonly answers?: readonly Answer[];
  readonly routes?: ReturnType<typeof createRoutes>;
  readonly title: string;
  readonly landed: () => Promise<HTMLElement>;
  readonly then?: (user: UserEvent) => Promise<void>;
}

const states: readonly State[] = [
  {
    screen: 'the list',
    state: 'loading',
    route: paths.checks(),
    answers: [pending(StatusCountsDocument), pending(ChecksDocument)],
    title: 'Checks',
    landed: () => screen.findByRole('status'),
  },
  {
    screen: 'the list',
    state: 'failing to load',
    route: paths.checks(),
    answers: [
      networkFailure(StatusCountsDocument),
      networkFailure(ChecksDocument),
    ],
    title: 'Checks',
    landed: () => screen.findByRole('alert'),
  },
  {
    screen: 'the list',
    state: 'an empty workspace',
    route: paths.checks(),
    answers: empty,
    title: 'Checks',
    landed: () => screen.findByRole('heading', { name: 'No checks yet' }),
  },
  {
    screen: 'the list',
    state: 'populated',
    route: paths.checks(),
    answers: populated,
    title: 'Checks',
    landed: () => screen.findByText('Secrets never committed'),
  },
  {
    screen: 'the list',
    state: 'with a row opened',
    route: paths.checks(),
    answers: populated,
    title: 'Checks',
    landed: () => screen.findByText('Secrets never committed'),
    then: async (user) => {
      await user.click(screen.getByRole('button', { name: /^Lint on every/ }));
      await screen.findByText('Test runs');
    },
  },
  {
    screen: 'the list',
    state: 'with the condition picker open',
    route: paths.checks(),
    answers: populated,
    title: 'Checks',
    landed: () => screen.findByText('Secrets never committed'),
    then: async (user) => {
      await user.click(screen.getByRole('button', { name: 'Add a condition' }));
      await user.click(screen.getByRole('button', { name: 'Add' }));
      await screen.findByRole('alert');
    },
  },
  {
    screen: 'the list',
    state: 'with a filter nothing matches',
    route: paths.checks({ filter: unproven }),
    answers: noneMatch,
    title: 'Checks',
    landed: () => screen.findByRole('button', { name: 'Clear filter' }),
  },
  {
    screen: 'the list',
    state: 'with the list failing under the tiles',
    route: paths.checks(),
    answers: [...populated, networkFailure(ChecksDocument)],
    title: 'Checks',
    landed: () => screen.findByRole('alert'),
  },
  {
    screen: "a check's page",
    state: 'loading',
    route: paths.check(lint.id),
    answers: [pending(CheckDetailDocument)],
    title: 'Check',
    landed: () => screen.findByRole('status'),
  },
  {
    screen: "a check's page",
    state: 'failing to load',
    route: paths.check(lint.id),
    answers: [networkFailure(CheckDetailDocument)],
    title: 'Check',
    landed: () => screen.findByRole('alert'),
  },
  {
    screen: "a check's page",
    state: 'for a check not recorded',
    route: paths.check('nothing-here'),
    answers: [answer(CheckDetailDocument, { check: null })],
    title: 'Check not found',
    landed: () => screen.findByRole('heading', { name: 'Check not found' }),
  },
  {
    screen: "a check's page",
    state: 'populated',
    route: paths.check(lint.id),
    answers: [detail],
    title: lint.name,
    landed: () => screen.findByRole('heading', { level: 1, name: lint.name }),
  },
  {
    screen: "a check's page",
    state: 'with the observation form refusing a save',
    route: paths.check(lint.id),
    answers: [detail],
    title: lint.name,
    landed: () => screen.findByRole('heading', { level: 1, name: lint.name }),
    then: async (user) => {
      await user.click(
        screen.getByRole('button', { name: 'Record an observation' }),
      );
      await user.click(
        screen.getByRole('button', { name: 'Save observation' }),
      );
      await screen.findByRole('alert');
    },
  },
  {
    screen: 'the run form',
    state: 'loading its checks',
    route: paths.newRun(),
    answers: [pending(CheckOptionsDocument)],
    title: 'Log a test run',
    landed: () => screen.findByRole('status'),
  },
  {
    screen: 'the run form',
    state: 'failing to load its checks',
    route: paths.newRun(),
    answers: [networkFailure(CheckOptionsDocument)],
    title: 'Log a test run',
    landed: () => screen.findByRole('alert'),
  },
  {
    screen: 'the run form',
    state: 'with no checks to log against',
    route: paths.newRun(),
    answers: [answer(CheckOptionsDocument, { checks: { checks: [] } })],
    title: 'Log a test run',
    landed: () => screen.findByText(/nothing to log a run against/),
  },
  {
    screen: 'the run form',
    state: 'ready',
    route: paths.newRun(),
    answers: [options],
    title: 'Log a test run',
    landed: () => screen.findByRole('button', { name: 'Save run' }),
  },
  {
    screen: 'the run form',
    state: 'refusing a save',
    route: paths.newRun(),
    answers: [options],
    title: 'Log a test run',
    landed: () => screen.findByRole('button', { name: 'Save run' }),
    then: async (user) => {
      await user.click(screen.getByRole('button', { name: 'Save run' }));
      await screen.findByRole('alert');
    },
  },
  {
    screen: 'the run form',
    state: 'saved',
    route: paths.newRun({ check: lint.id }),
    answers: [options, logged],
    title: 'Log a test run',
    landed: () => screen.findByRole('button', { name: 'Save run' }),
    then: async (user) => {
      await user.type(
        screen.getByLabelText('What you planted'),
        'An unused import.',
      );
      await user.type(
        screen.getByLabelText('What you expected'),
        'The push is refused.',
      );
      await user.click(screen.getByRole('button', { name: 'Caught it' }));
      await user.click(screen.getByRole('button', { name: 'Save run' }));
      await screen.findByRole('button', { name: 'Log another run' });
    },
  },
  {
    screen: 'the add-check form',
    state: 'ready',
    route: paths.newCheck(),
    answers: [areas],
    title: 'Add a check',
    landed: () => screen.findByRole('button', { name: 'Save check' }),
  },
  {
    screen: 'the add-check form',
    state: 'refusing a save',
    route: paths.newCheck(),
    answers: [areas],
    title: 'Add a check',
    landed: () => screen.findByRole('button', { name: 'Save check' }),
    then: async (user) => {
      await user.click(screen.getByRole('button', { name: 'Save check' }));
      await screen.findByRole('alert');
    },
  },
  {
    screen: 'an address no screen claims',
    state: 'shown',
    route: '/nowhere',
    title: 'Page not found',
    landed: () => screen.findByRole('heading', { name: 'Page not found' }),
  },
  {
    screen: 'a screen that threw',
    state: 'replaced by the error notice',
    route: '/broken',
    routes: createRoutes([{ path: 'broken', element: <Broken /> }]),
    title: 'Something went wrong',
    landed: () => screen.findByRole('alert'),
  },
];

describe.each(states)('$screen, $state', (state) => {
  async function arrive() {
    const rendered = renderApp({
      route: state.route,
      answers: state.answers ?? [],
      ...(state.routes === undefined ? {} : { routes: state.routes }),
    });
    await state.landed();
    await state.then?.(rendered.user);
    return rendered;
  }

  it('has nothing axe reports', async () => {
    await arrive();

    expect(await axeViolations()).toStrictEqual([]);
  });

  it('names itself in the document title', async () => {
    await arrive();

    expect(document.title).toBe(documentTitle(state.title));
  });

  /**
   * Tabs once past every control on the page and reads where focus went. Each
   * control a reader can see is met once, in the order the page lays them
   * out, so nothing needs a pointer to be reached and the order a keyboard
   * takes is the order the page is read in.
   */
  it('reaches every control by Tab, in the order the page reads', async () => {
    const { user, container } = await arrive();
    // A control taken out of the Tab order with tabindex="-1" is still a
    // control, so it is expected here and fails when Tab skips it. Only an
    // element that is not a control, such as the sentence focus is put on
    // after a save, may be focusable without being in the order.
    const controls = [
      ...container.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((control) => !control.matches(':disabled'));

    // From the top of the page, whatever `then` left focused.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      await user.tab();
      expect(document.activeElement).toBe(control);
    }
  });
});

/**
 * The focus ring: brick, on everything that can take focus, and taken away
 * nowhere a reader can tab to. A rule that hides it on one control would not
 * show in any test that reads the DOM, so this reads the stylesheets.
 */
describe('the focus ring', () => {
  const sourceRoot = dirname(fileURLToPath(import.meta.url));
  const stylesheets = filesUnder(sourceRoot).filter((path) =>
    path.endsWith('.css'),
  );

  it('is drawn in brick on whatever has keyboard focus', () => {
    const base = readFileSync(join(sourceRoot, 'styles', 'base.css'), 'utf8');

    expect(base).toMatch(
      /(^|\n):focus-visible \{\n {2}outline: 2px solid var\(--primary\);/,
    );
  });

  it('is removed only from the sentence focus is put on, which no Tab reaches', () => {
    const removed = stylesheets.flatMap((path) =>
      [
        ...readFileSync(path, 'utf8').matchAll(
          /([^{}]+)\{[^}]*outline:\s*(none|0)\b/g,
        ),
      ].map((match) => (match[1] ?? '').trim().split('\n').at(-1)),
    );

    expect(removed).toStrictEqual(['.run-logged__sentence:focus']);
  });
});
