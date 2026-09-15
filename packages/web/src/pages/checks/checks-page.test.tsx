import {
  MAX_CONDITIONS_PER_GROUP,
  MAX_GROUPS,
  parseFilterString,
} from '@seen-to-fail/filter';
import type { Condition, Filter, Group, Status } from '@seen-to-fail/filter';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChecksQuery,
  StatusCountsQuery,
} from '../../graphql/generated/graphql';
import {
  AreasDocument,
  ChecksDocument,
  StatusCountsDocument,
} from '../../graphql/generated/graphql';
import { paths } from '../../paths';
import type { Answer, Call } from '../../testing/client';
import {
  answer,
  graphqlFailure,
  networkFailure,
  pending,
} from '../../testing/client';
import { renderApp } from '../../testing/render';
import type { ListedCheck } from './check-row';

/**
 * The list screen through the app's real route table, so the address a tile
 * writes is the address the screen reads back.
 *
 * The clock is held on one day, because every "last caught" figure is counted
 * from today. Only Date is faked; timers and promises run as they do in the
 * browser.
 */

const today = new Date('2026-09-15T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(today);
});

afterEach(() => {
  vi.useRealTimers();
});

/** An invented workspace with one check in each status. */
const workspace: readonly ListedCheck[] = [
  {
    id: 'build-types',
    name: 'Build fails on a type error',
    area: 'CI',
    status: 'PROVEN',
    lastCaughtOn: '2026-09-12',
    runCount: 2,
    runs: [
      {
        id: 'run-2',
        runOn: '2026-09-12',
        outcome: 'CAUGHT',
        planted: 'A string passed where a number belongs.',
      },
      {
        id: 'run-1',
        runOn: '2026-08-20',
        outcome: 'CAUGHT',
        planted: 'A property read off an object that lacks it.',
      },
    ],
  },
  {
    id: 'format-commit',
    name: 'Formatter runs before commit',
    area: 'Git',
    status: 'BROKEN',
    lastCaughtOn: '2026-08-01',
    runCount: 2,
    runs: [
      {
        id: 'run-4',
        runOn: '2026-09-14',
        outcome: 'MISSED',
        planted: 'A file indented with tabs.',
      },
      {
        id: 'run-3',
        runOn: '2026-08-01',
        outcome: 'CAUGHT',
        planted: 'A line far past the width limit.',
      },
    ],
  },
  {
    id: 'docs-links',
    name: 'Links checked on publish',
    area: 'Docs',
    status: 'STALE',
    lastCaughtOn: '2026-07-06',
    runCount: 1,
    runs: [
      {
        id: 'run-5',
        runOn: '2026-07-06',
        outcome: 'CAUGHT',
        planted: 'A link to a page that was taken down.',
      },
    ],
  },
  {
    id: 'unused-code',
    name: 'Unused code reported',
    area: 'Lint',
    status: 'UNPROVEN',
    lastCaughtOn: null,
    runCount: 0,
    runs: [],
  },
  {
    id: 'restore-backups',
    name: 'Backups restored weekly',
    area: 'Operations',
    status: 'UNARMED',
    lastCaughtOn: null,
    runCount: 0,
    runs: [],
  },
];

/** The counts a workspace really has, so no test states one of its own. */
function countsOf(
  checks: readonly ListedCheck[],
): StatusCountsQuery['statusCounts'] {
  const holding = (status: ListedCheck['status']): number =>
    checks.filter((check) => check.status === status).length;
  return {
    proven: holding('PROVEN'),
    broken: holding('BROKEN'),
    stale: holding('STALE'),
    unproven: holding('UNPROVEN'),
    unarmed: holding('UNARMED'),
    total: checks.length,
  };
}

/**
 * Whether a check passes a filter. The stub only needs the filters a tile
 * sets, a single `status is`, and lets every check through anything else.
 */
function passes(
  filter: Filter | null | undefined,
  check: ListedCheck,
): boolean {
  if (filter === null || filter === undefined || filter.kind === 'empty') {
    return true;
  }
  const condition = filter.groups[0].conditions[0];
  if (condition.field !== 'status' || condition.op !== 'is') {
    return true;
  }
  return check.status === condition.value.toUpperCase();
}

/** Answers the page's queries from one workspace, as the API would. */
function answersFor(checks: readonly ListedCheck[]): Answer[] {
  return [
    answer(StatusCountsDocument, { statusCounts: countsOf(checks) }),
    answer(ChecksDocument, ({ filter }): ChecksQuery => {
      const selected = checks.filter((check) => passes(filter, check));
      return {
        checks: {
          checks: selected,
          matching: selected.length,
          hidden: checks.length - selected.length,
        },
      };
    }),
    answer(AreasDocument, {
      areas: [...new Set(checks.map((check) => check.area))].sort(),
    }),
  ];
}

function onlyStatus(status: Status): Filter {
  return {
    kind: 'groups',
    joiner: 'and',
    groups: [
      {
        joiner: 'and',
        conditions: [{ field: 'status', op: 'is', value: status }],
      },
    ],
  };
}

function rowFor(name: string): HTMLElement {
  const row = screen.getByText(name).closest('li');
  if (row === null) {
    throw new Error(`${name} is not in a row.`);
  }
  return row;
}

function lastChecksCall(calls: readonly Call[]): Call | undefined {
  return calls.findLast((call) => call.name === 'Checks');
}

const notProvenReasons =
  'they have never been seen to catch anything, the last proof is old, or the latest run missed. A check nobody has watched fail is a check you are trusting on faith.';

describe('a workspace with checks', () => {
  it('opens with the lede, a tile for each status and every check', async () => {
    renderApp({ answers: answersFor(workspace) });

    expect(
      await screen.findByText(
        `Five checks in this workspace. Four are not proven: ${notProvenReasons}`,
      ),
    ).toBeInTheDocument();

    const tiles = within(
      screen.getByRole('group', { name: 'Show the checks with one status' }),
    ).getAllByRole('button');
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      '✓ 1 Proven Caught a planted defect',
      '✕ 1 Broken Latest run missed',
      '! 1 Stale Last proof is old',
      '? 1 Unproven Never seen to fail',
      '○ 1 Unarmed No evidence it is on',
    ]);

    expect(await screen.findByText('5 of 5 checks')).toBeInTheDocument();
    expect(screen.queryByText(/hidden by this filter/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(
      workspace.length,
    );
  });

  it('shows each check with its status, its last catch and its runs', async () => {
    renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    const toggleOf = (name: string): HTMLElement =>
      within(rowFor(name)).getByRole('button');

    expect(toggleOf('Build fails on a type error')).toHaveTextContent(
      'Build fails on a type error CI ✓Proven Last caught 3 days ago 2 runs ▼',
    );
    expect(toggleOf('Formatter runs before commit')).toHaveTextContent(
      'Formatter runs before commit Git ✕Broken Last caught 45 days ago 2 runs ▼',
    );
    expect(toggleOf('Links checked on publish')).toHaveTextContent(
      'Links checked on publish Docs !Stale Last caught 71 days ago 1 run ▼',
    );
    expect(toggleOf('Unused code reported')).toHaveTextContent(
      'Unused code reported Lint ?Unproven Never caught a defect 0 runs ▼',
    );
    expect(toggleOf('Backups restored weekly')).toHaveAccessibleName(
      'Backups restored weekly Operations Unarmed Never caught a defect 0 runs',
    );
  });

  it('links every row to its own check', async () => {
    renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    for (const check of workspace) {
      const link = within(rowFor(check.name)).getByRole('link', {
        name: 'Open check',
      });
      expect(link).toHaveAttribute('href', paths.check(check.id));
      expect(link).toHaveAccessibleDescription(check.name);
    }
  });

  it('opens a row in place to its runs, newest first, and closes it again', async () => {
    const { user } = renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');
    const row = rowFor('Formatter runs before commit');
    const toggle = within(row).getByRole('button');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(row).getByText('▲')).toBeInTheDocument();
    expect(
      within(row)
        .getAllByRole('listitem')
        .map((run) => run.textContent),
    ).toEqual([
      '14 Sep 2026 ✕Missed A file indented with tabs.',
      '1 Aug 2026 ✓Caught A line far past the width limit.',
    ]);

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(row).queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('opens a check with no runs to the way to log its first', async () => {
    const { user } = renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');
    const row = rowFor('Unused code reported');

    await user.click(within(row).getByRole('button'));

    expect(row).toHaveTextContent(
      "Nothing's been planted for this check yet. Plant the defect it's there to catch, then log what it did.",
    );
    expect(
      within(row).getByRole('link', { name: 'Log a test run' }),
    ).toHaveAttribute('href', paths.newRun({ check: 'unused-code' }));
  });
});

describe('the status tiles', () => {
  it('narrow the list to one status and write it into the address', async () => {
    const { user, router, calls } = renderApp({
      answers: answersFor(workspace),
    });
    await screen.findByText('5 of 5 checks');

    await user.click(screen.getByRole('button', { name: /^1 Broken/ }));

    expect(await screen.findByText('1 of 5 checks')).toBeInTheDocument();
    expect(screen.getByText('4 hidden by this filter')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('?f=and!and*status.is.Broken');
    expect(lastChecksCall(calls)?.variables).toEqual({
      filter: onlyStatus('Broken'),
    });
    expect(
      screen.getByText('Formatter runs before commit'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Build fails on a type error'),
    ).not.toBeInTheDocument();
  });

  it('keep counting the whole workspace while the list is narrowed', async () => {
    const { user } = renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    await user.click(screen.getByRole('button', { name: /^1 Stale/ }));
    await screen.findByText('1 of 5 checks');

    expect(
      screen.getByRole('button', { name: /^1 Proven/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^Five checks in this workspace\./),
    ).toBeInTheDocument();
  });

  it('replace a filter already in the address', async () => {
    const { user, router } = renderApp({
      route: paths.checks({ filter: onlyStatus('Stale') }),
      answers: answersFor(workspace),
    });
    await screen.findByText('1 of 5 checks');

    await user.click(screen.getByRole('button', { name: /^1 Unproven/ }));

    expect(router.state.location.search).toBe('?f=and!and*status.is.Unproven');
    expect(await screen.findByText('Unused code reported')).toBeInTheDocument();
  });
});

describe('the filter in the address', () => {
  it('is what the list is read with when the page opens', async () => {
    const { calls } = renderApp({
      route: '/?f=and!and*status.is.Stale',
      answers: answersFor(workspace),
    });

    expect(await screen.findByText('1 of 5 checks')).toBeInTheDocument();
    expect(screen.getByText('Links checked on publish')).toBeInTheDocument();
    expect(lastChecksCall(calls)?.variables).toEqual({
      filter: onlyStatus('Stale'),
    });
  });

  it('lists every check when it does not read as a filter', async () => {
    const { calls } = renderApp({
      route: '/?f=status%20is%20Stale',
      answers: answersFor(workspace),
    });

    expect(await screen.findByText('5 of 5 checks')).toBeInTheDocument();
    expect(lastChecksCall(calls)?.variables).toEqual({
      filter: { kind: 'empty' },
    });
  });

  it('adds no history entry for a change that leaves the filter as it is', async () => {
    const { user, router } = renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    await user.click(screen.getByRole('button', { name: /^1 Broken/ }));
    await screen.findByText('1 of 5 checks');
    await user.click(screen.getByRole('button', { name: /^1 Broken/ }));
    expect(router.state.location.search).toBe('?f=and!and*status.is.Broken');

    // One step back undoes the one thing that was done.
    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe('');
    expect(await screen.findByText('5 of 5 checks')).toBeInTheDocument();
  });
});

/**
 * The bar through the app's real route table, so that what the picker writes
 * is what the address carries and what the address carries is what the chips
 * show. The bar's own controls are tested in filter-bar.test.tsx.
 */
describe('the filter bar', () => {
  /** The README's example: (status is Unproven OR status is Stale) AND area is CI. */
  const readmeExample: Filter = {
    kind: 'groups',
    joiner: 'and',
    groups: [
      {
        joiner: 'or',
        conditions: [
          { field: 'status', op: 'is', value: 'Unproven' },
          { field: 'status', op: 'is', value: 'Stale' },
        ],
      },
      {
        joiner: 'and',
        conditions: [{ field: 'area', op: 'is', value: 'CI' }],
      },
    ],
  };
  const readmeAddress =
    '?f=and!or*status.is.Unproven*status.is.Stale!and*area.is.CI';

  const never: Condition = { field: 'lastCaught', op: 'never' };

  /** A filter of this many groups, each holding one condition. */
  function groupsOf(count: number): Filter {
    const [first, ...rest] = Array.from({ length: count }, (): Group => ({
      joiner: 'and',
      conditions: [never],
    }));
    if (first === undefined) {
      throw new Error('A filter with groups needs at least one.');
    }
    return { kind: 'groups', joiner: 'and', groups: [first, ...rest] };
  }

  /** A filter of one group holding this many conditions. */
  function conditionsOf(count: number): Filter {
    const [first, ...rest] = Array.from({ length: count }, () => never);
    if (first === undefined) {
      throw new Error('A group needs at least one condition.');
    }
    return {
      kind: 'groups',
      joiner: 'and',
      groups: [{ joiner: 'and', conditions: [first, ...rest] }],
    };
  }

  /** The filter the address holds, as the language reads it. */
  function addressFilter(search: string): ReturnType<typeof parseFilterString> {
    return parseFilterString(new URLSearchParams(search).get('f'));
  }

  function bar(): HTMLElement {
    return screen.getByRole('region', { name: 'Filter' });
  }

  function group(number: number): HTMLElement {
    return within(bar()).getByRole('group', {
      name: `Condition group ${String(number)}`,
    });
  }

  /** The chips on screen, as their remove buttons name them. */
  function chips(): string[] {
    return within(bar())
      .queryAllByRole('button', { name: /^Remove / })
      .map((button) => button.getAttribute('aria-label') ?? '');
  }

  it("builds the README's example through the picker, and writes it into the address", async () => {
    const { user, router, calls } = renderApp({
      answers: answersFor(workspace),
    });
    await screen.findByText('5 of 5 checks');

    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Value'), 'Unproven');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(router.state.location.search).toBe('?f=and!and*status.is.Unproven');

    await user.click(
      within(group(1)).getByRole('button', { name: '+ condition' }),
    );
    await user.selectOptions(screen.getByLabelText('Value'), 'Stale');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(router.state.location.search).toBe(
      '?f=and!and*status.is.Unproven*status.is.Stale',
    );

    await user.click(
      within(group(1)).getByRole('button', { name: 'AND, switch to OR' }),
    );
    expect(router.state.location.search).toBe(
      '?f=and!or*status.is.Unproven*status.is.Stale',
    );

    await user.click(within(bar()).getByRole('button', { name: '+ group' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'area');
    await user.type(screen.getByLabelText('Value'), 'CI');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe(readmeAddress);
    expect(lastChecksCall(calls)?.variables).toEqual({ filter: readmeExample });
  });

  it('reads the same chips back from that address', async () => {
    renderApp({ route: `/${readmeAddress}`, answers: answersFor(workspace) });
    await screen.findByRole('region', { name: 'Filter' });

    expect(chips()).toEqual([
      'Remove status is Unproven',
      'Remove status is Stale',
      'Remove area is CI',
    ]);
    expect(
      within(group(1)).getByRole('button', { name: 'OR, switch to AND' }),
    ).toBeInTheDocument();
    expect(
      within(bar()).getByRole('button', { name: 'AND, switch to OR' }),
    ).toBeInTheDocument();
    expect(within(bar()).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('writes a switched joiner into the address, and reads the list with it', async () => {
    const { user, router, calls } = renderApp({
      route: `/${readmeAddress}`,
      answers: answersFor(workspace),
    });
    await screen.findByRole('region', { name: 'Filter' });

    await user.click(
      within(bar()).getByRole('button', { name: 'AND, switch to OR' }),
    );

    expect(router.state.location.search).toBe(
      '?f=or!or*status.is.Unproven*status.is.Stale!and*area.is.CI',
    );
    await waitFor(() => {
      expect(lastChecksCall(calls)?.variables).toEqual({
        filter: { ...readmeExample, joiner: 'or' },
      });
    });
    // The pill between the groups now reads OR, as the one inside the first
    // group already did, and no pill reads AND any more.
    expect(
      within(bar()).getAllByRole('button', { name: 'OR, switch to AND' }),
    ).toHaveLength(2);
    expect(
      within(bar()).queryByRole('button', { name: 'AND, switch to OR' }),
    ).not.toBeInTheDocument();
  });

  it('shows the filter a tile set as a chip, and clears it with the rest', async () => {
    const { user, router } = renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    await user.click(screen.getByRole('button', { name: /^1 Broken/ }));
    await screen.findByText('1 of 5 checks');
    expect(chips()).toEqual(['Remove status is Broken']);

    await user.click(within(bar()).getByRole('button', { name: 'Clear' }));

    expect(router.state.location.search).toBe('');
    expect(await screen.findByText('5 of 5 checks')).toBeInTheDocument();
    expect(bar()).toHaveTextContent('No conditions. All 5 checks are listed.');
  });

  it('says so when the address does not read as a filter, and lists every check', async () => {
    renderApp({
      route: '/?f=status%20is%20Stale',
      answers: answersFor(workspace),
    });
    await screen.findByText('5 of 5 checks');

    expect(within(bar()).getByRole('alert')).toHaveTextContent(
      "The filter in this link couldn't be read, so every check is listed.",
    );
    expect(bar()).toHaveTextContent('No conditions. All 5 checks are listed.');
    expect(chips()).toEqual([]);
  });

  /**
   * Back and forward, which with a refresh are the acceptance criterion. Each
   * change is a history entry, so back undoes the last change and forward
   * redoes it, and the list follows the address both ways.
   */
  it('steps back and forward through what was built', async () => {
    const { user, router } = renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    await user.click(screen.getByRole('button', { name: /^1 Broken/ }));
    await screen.findByText('1 of 5 checks');
    await user.click(
      within(group(1)).getByRole('button', { name: '+ condition' }),
    );
    await user.selectOptions(screen.getByLabelText('Field'), 'runs');
    await user.type(screen.getByLabelText('Value'), '2{Enter}');
    expect(router.state.location.search).toBe(
      '?f=and!and*status.is.Broken*runs.moreThan.2',
    );

    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe('?f=and!and*status.is.Broken');
    expect(chips()).toEqual(['Remove status is Broken']);
    expect(await screen.findByText('1 of 5 checks')).toBeInTheDocument();

    await act(async () => {
      await router.navigate(-1);
    });
    expect(router.state.location.search).toBe('');
    expect(chips()).toEqual([]);
    expect(await screen.findByText('5 of 5 checks')).toBeInTheDocument();

    await act(async () => {
      await router.navigate(1);
    });
    expect(router.state.location.search).toBe('?f=and!and*status.is.Broken');
    expect(chips()).toEqual(['Remove status is Broken']);
    expect(await screen.findByText('1 of 5 checks')).toBeInTheDocument();
  });

  /**
   * A picker stays open across a history step, and the step can put a filter
   * on screen that has no room for what the picker would add. The bar reads
   * the offer off the filter it shows, so the picker goes with the room and
   * the address never holds more than the language takes.
   */
  it('closes a picker that a history step has left with nowhere to add, and never writes past the cap', async () => {
    const { user, router } = renderApp({
      route: paths.checks({ filter: groupsOf(MAX_GROUPS - 1) }),
      answers: answersFor(workspace),
    });
    await screen.findByText('5 of 5 checks');

    await user.click(within(bar()).getByRole('button', { name: '+ group' }));
    expect(
      screen.getByRole('form', { name: 'New condition' }),
    ).toBeInTheDocument();

    await act(async () => {
      await router.navigate(paths.checks({ filter: groupsOf(MAX_GROUPS) }));
    });
    expect(
      screen.queryByRole('form', { name: 'New condition' }),
    ).not.toBeInTheDocument();
    expect(
      within(bar()).queryByRole('button', { name: '+ group' }),
    ).not.toBeInTheDocument();

    // Back where there was room, the picker the reader opened is there again
    // and adds the last group the language takes.
    await act(async () => {
      await router.navigate(-1);
    });
    await user.selectOptions(screen.getByLabelText('Value'), 'Broken');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(addressFilter(router.state.location.search).ok).toBe(true);
    expect(within(bar()).getAllByRole('group')).toHaveLength(MAX_GROUPS);
    expect(within(bar()).queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * Focus through the address, which is where a change comes back from. The
   * bar places focus once the filter it asked for is on screen, so these run
   * the real route rather than a bar holding its own filter.
   */
  it('keeps focus in the bar through an add, a toggle, a remove and a clear', async () => {
    const { user } = renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Value'), 'Broken');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      within(bar()).getByRole('button', { name: '+ group' }),
    ).toHaveFocus();

    await user.click(
      within(group(1)).getByRole('button', { name: '+ condition' }),
    );
    await user.selectOptions(screen.getByLabelText('Value'), 'Stale');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(
      within(group(1)).getByRole('button', { name: '+ condition' }),
    ).toHaveFocus();

    await user.click(
      within(group(1)).getByRole('button', { name: 'AND, switch to OR' }),
    );
    expect(
      within(group(1)).getByRole('button', { name: 'OR, switch to AND' }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: 'Remove status is Stale' }),
    );
    expect(
      within(group(1)).getByRole('button', { name: '+ condition' }),
    ).toHaveFocus();

    await user.click(within(bar()).getByRole('button', { name: 'Clear' }));
    expect(
      within(bar()).getByRole('button', { name: 'Add a condition' }),
    ).toHaveFocus();
  });

  it('lands on the condition just added when the group has no room for another', async () => {
    const { user } = renderApp({
      route: paths.checks({
        filter: conditionsOf(MAX_CONDITIONS_PER_GROUP - 1),
      }),
      answers: answersFor(workspace),
    });
    await screen.findByText('5 of 5 checks');

    await user.click(
      within(group(1)).getByRole('button', { name: '+ condition' }),
    );
    await user.selectOptions(screen.getByLabelText('Value'), 'Broken');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      within(group(1)).queryByRole('button', { name: '+ condition' }),
    ).not.toBeInTheDocument();
    expect(
      within(group(1)).getByRole('button', { name: 'Remove status is Broken' }),
    ).toHaveFocus();
  });

  it("lands on the new group's offer to add when the filter has no room for another group", async () => {
    const { user } = renderApp({
      route: paths.checks({ filter: groupsOf(MAX_GROUPS - 1) }),
      answers: answersFor(workspace),
    });
    await screen.findByText('5 of 5 checks');

    await user.click(within(bar()).getByRole('button', { name: '+ group' }));
    await user.selectOptions(screen.getByLabelText('Value'), 'Broken');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(
      within(bar()).queryByRole('button', { name: '+ group' }),
    ).not.toBeInTheDocument();
    expect(
      within(group(MAX_GROUPS)).getByRole('button', { name: '+ condition' }),
    ).toHaveFocus();
  });

  it('lets a reader clear an address that did not read, and holds Copy link back until they do', async () => {
    const { user, router } = renderApp({
      route: '/?f=status%20is%20Stale',
      answers: answersFor(workspace),
    });
    await screen.findByText('5 of 5 checks');
    expect(within(bar()).getByRole('alert')).toBeInTheDocument();
    expect(
      within(bar()).getByRole('button', { name: 'Copy link' }),
    ).toBeDisabled();
    const clear = within(bar()).getByRole('button', { name: 'Clear' });
    expect(clear).toBeEnabled();

    await user.click(clear);

    expect(router.state.location.search).toBe('');
    expect(within(bar()).queryByRole('alert')).not.toBeInTheDocument();
    expect(
      within(bar()).getByRole('button', { name: 'Copy link' }),
    ).toBeEnabled();
    expect(
      within(bar()).getByRole('button', { name: 'Add a condition' }),
    ).toHaveFocus();
  });

  it('offers the areas the workspace has when an area is being chosen', async () => {
    const { user } = renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'area');

    const listId = screen.getByLabelText('Value').getAttribute('list') ?? '';
    const offered = [
      ...(document.getElementById(listId)?.querySelectorAll('option') ?? []),
    ].map((option) => option.value);
    expect(offered).toEqual(['CI', 'Docs', 'Git', 'Lint', 'Operations']);
  });
});

describe('a filter that matches nothing', () => {
  const nothingMatches: Answer = answer(ChecksDocument, {
    checks: { checks: [], matching: 0, hidden: workspace.length },
  });

  it('says so, and offers to clear the filter', async () => {
    const { user, router } = renderApp({
      route: paths.checks({ filter: onlyStatus('Unarmed') }),
      answers: [...answersFor(workspace), nothingMatches],
    });

    expect(
      await screen.findByText(
        'No checks match this filter. Remove a condition, or widen it with OR.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('0 of 5 checks')).toBeInTheDocument();
    expect(screen.getByText('5 hidden by this filter')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filter' }));

    expect(router.state.location.pathname).toBe('/');
    expect(router.state.location.search).toBe('');
  });
});

describe('an empty workspace', () => {
  it('says there are no checks and offers to add one', async () => {
    renderApp({ answers: answersFor([]) });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'No checks yet' }),
    ).toBeInTheDocument();
    const add = screen.getByRole('link', { name: 'Add a check' });
    expect(add).toHaveAttribute('href', paths.newCheck());
    expect(add).toHaveClass('button--primary');
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByText(/ of 0 checks/)).not.toBeInTheDocument();
  });
});

describe('while loading', () => {
  it('holds the heading and says the checks are on their way', () => {
    renderApp({
      answers: [pending(StatusCountsDocument), pending(ChecksDocument)],
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Checks' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading checks…');
  });

  it('keeps the tiles up while only the list is on its way', async () => {
    renderApp({
      answers: [
        answer(StatusCountsDocument, { statusCounts: countsOf(workspace) }),
        pending(ChecksDocument),
      ],
    });

    expect(
      await screen.findByRole('button', { name: /^1 Proven/ }),
    ).toBeInTheDocument();
    // Found by its text and then checked for its role, because the filter
    // bar, up alongside the tiles, carries a status region of its own.
    expect(screen.getByText('Loading checks…')).toHaveRole('status');
  });
});

describe('when a query fails', () => {
  it('shows one notice when the server cannot be reached, and retries', async () => {
    let attempts = 0;
    const [counts, checks] = answersFor(workspace);
    if (counts === undefined || checks === undefined) {
      throw new Error('The workspace answers are missing.');
    }
    const failsOnce: Answer = {
      operationName: 'StatusCounts',
      respond: (operation) => {
        attempts += 1;
        return attempts === 1
          ? networkFailure(StatusCountsDocument).respond(operation)
          : counts.respond(operation);
      },
    };
    const { user } = renderApp({ answers: [failsOnce, checks] });

    // The notice is found by its role and its button, not its wording, which
    // belongs to the shared notice rather than to this screen.
    const notice = await screen.findByRole('alert');
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    await user.click(within(notice).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('5 of 5 checks')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the tiles and says what went wrong with the list', async () => {
    renderApp({
      answers: [
        ...answersFor(workspace),
        graphqlFailure(
          ChecksDocument,
          'The filter is not one the filter language can express.',
        ),
      ],
    });

    // Only the server's own message is asserted, since the sentence around it
    // is the shared notice's.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The filter is not one the filter language can express.',
    );
    expect(
      screen.getByRole('button', { name: /^1 Proven/ }),
    ).toBeInTheDocument();
  });
});

describe('every figure on the page', () => {
  it('is counted from the data the API returns', async () => {
    const provenOnly = Array.from({ length: 13 }, (_, index): ListedCheck => ({
      id: `proven-${String(index)}`,
      name: `Proven check ${String(index)}`,
      area: 'CI',
      status: 'PROVEN',
      lastCaughtOn: '2026-09-15',
      runCount: 1,
      runs: [
        {
          id: `run-${String(index)}`,
          runOn: '2026-09-15',
          outcome: 'CAUGHT',
          planted: 'A defect planted this morning.',
        },
      ],
    }));
    renderApp({ answers: answersFor(provenOnly) });

    expect(
      await screen.findByText(
        '13 checks in this workspace. All 13 are proven. A check nobody has watched fail is a check you are trusting on faith.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^13 Proven/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^0 Broken/ }),
    ).toBeInTheDocument();
    expect(await screen.findByText('13 of 13 checks')).toBeInTheDocument();
    expect(rowFor('Proven check 0')).toHaveTextContent('Last caught today');
  });

  it('counts days from today, whatever day that is', async () => {
    vi.setSystemTime(new Date('2026-09-22T12:00:00Z'));
    renderApp({ answers: answersFor(workspace) });
    await screen.findByText('5 of 5 checks');

    expect(rowFor('Build fails on a type error')).toHaveTextContent(
      'Last caught 10 days ago',
    );
    expect(rowFor('Links checked on publish')).toHaveTextContent(
      'Last caught 78 days ago',
    );
  });
});
