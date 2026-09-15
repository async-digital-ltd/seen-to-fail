import {
  emptyFilter,
  MAX_CONDITIONS_PER_GROUP,
  MAX_GROUPS,
} from '@seen-to-fail/filter';
import type {
  Condition,
  Filter,
  FilterIssue,
  GroupedFilter,
} from '@seen-to-fail/filter';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AreasDocument } from '../../graphql/generated/graphql';
import { paths } from '../../paths';
import { answer } from '../../testing/client';
import type { Rendered } from '../../testing/render';
import { renderWithProviders } from '../../testing/render';
import { FilterBar } from './filter-bar';

/**
 * The bar on its own, handed a filter and asked what it would change it to.
 * The address, and what the list does with it, are the list screen's tests.
 */

const workspaceAreas = ['CI', 'Docs', 'Git'];
const areas = answer(AreasDocument, { areas: workspaceAreas });

const unproven: Condition = { field: 'status', op: 'is', value: 'Unproven' };
const stale: Condition = { field: 'status', op: 'is', value: 'Stale' };
const inCi: Condition = { field: 'area', op: 'is', value: 'CI' };

/** The README's example: (status is Unproven OR status is Stale) AND area is CI. */
const readme: GroupedFilter = {
  kind: 'groups',
  joiner: 'and',
  groups: [
    { joiner: 'or', conditions: [unproven, stale] },
    { joiner: 'and', conditions: [inCi] },
  ],
};

interface BarOptions {
  readonly total?: number;
  readonly unreadable?: readonly FilterIssue[];
}

interface RenderedBar extends Rendered {
  readonly onChange: ReturnType<typeof vi.fn<(filter: Filter) => void>>;
  readonly bar: HTMLElement;
}

/** The bar with a fixed filter, so each change can be read off onChange. */
function renderBar(
  filter: Filter,
  { total = 5, unreadable }: BarOptions = {},
): RenderedBar {
  const onChange = vi.fn<(filter: Filter) => void>();
  const rendered = renderWithProviders(
    <FilterBar
      filter={filter}
      onChange={onChange}
      total={total}
      unreadable={unreadable}
    />,
    { route: paths.checks({ filter }), answers: [areas] },
  );
  return {
    ...rendered,
    onChange,
    bar: screen.getByRole('region', { name: 'Filter' }),
  };
}

function groupNumber(bar: HTMLElement, number: number): HTMLElement {
  return within(bar).getByRole('group', {
    name: `Condition group ${String(number)}`,
  });
}

/** The accessible name of whatever has focus, for reading a tab order. */
function focusedName(): string | null {
  const active = document.activeElement;
  if (active === null || active === document.body) {
    return null;
  }
  return active.getAttribute('aria-label') ?? active.textContent;
}

describe('with no conditions', () => {
  it('says every check is listed, offers to add a condition, and has nothing to clear', () => {
    const { bar } = renderBar(emptyFilter, { total: 8 });

    expect(bar).toHaveTextContent('No conditions. All 8 checks are listed.');
    expect(
      within(bar).getByRole('button', { name: 'Add a condition' }),
    ).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(within(bar).queryByRole('group')).not.toBeInTheDocument();
  });

  it('says the only check is listed when there is one', () => {
    const { bar } = renderBar(emptyFilter, { total: 1 });

    expect(bar).toHaveTextContent('No conditions. The only check is listed.');
  });
});

describe('the chips', () => {
  it('read each condition, with the joiner between two in a group', () => {
    const { bar } = renderBar(readme);

    expect(
      within(groupNumber(bar, 1))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['status is Unproven ✕', 'OR status is Stale ✕']);
    expect(
      within(groupNumber(bar, 2))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['area is CI ✕']);
  });

  it('take a condition out of its group', async () => {
    const { user, onChange } = renderBar(readme);

    await user.click(
      screen.getByRole('button', { name: 'Remove status is Unproven' }),
    );

    expect(onChange).toHaveBeenLastCalledWith({
      ...readme,
      groups: [{ joiner: 'or', conditions: [stale] }, readme.groups[1]],
    });
  });

  it('take the group away with its last condition', async () => {
    const { user, onChange } = renderBar(readme);

    await user.click(screen.getByRole('button', { name: 'Remove area is CI' }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...readme,
      groups: [readme.groups[0]],
    });
  });

  it('are all cleared at once', async () => {
    const { user, onChange } = renderBar(readme);

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onChange).toHaveBeenLastCalledWith(emptyFilter);
  });
});

describe('the pills', () => {
  it('sit between the conditions of a group and between the groups', () => {
    const { bar } = renderBar(readme);

    expect(
      within(groupNumber(bar, 1)).getAllByRole('button', {
        name: 'OR, switch to AND',
      }),
    ).toHaveLength(1);
    expect(
      within(groupNumber(bar, 2)).queryByRole('button', { name: /switch to/ }),
    ).not.toBeInTheDocument();
    expect(
      within(bar).getAllByRole('button', { name: 'AND, switch to OR' }),
    ).toHaveLength(1);
  });

  it('switch how a group joins its conditions', async () => {
    const { user, onChange, bar } = renderBar(readme);

    await user.click(
      within(groupNumber(bar, 1)).getByRole('button', {
        name: 'OR, switch to AND',
      }),
    );

    expect(onChange).toHaveBeenLastCalledWith({
      ...readme,
      groups: [
        { joiner: 'and', conditions: [unproven, stale] },
        readme.groups[1],
      ],
    });
  });

  it('switch how the filter joins its groups', async () => {
    const { user, onChange, bar } = renderBar(readme);

    await user.click(
      within(bar).getByRole('button', { name: 'AND, switch to OR' }),
    );

    expect(onChange).toHaveBeenLastCalledWith({ ...readme, joiner: 'or' });
  });
});

describe('the picker', () => {
  it('adds a status condition to the group it was opened in', async () => {
    const { user, onChange, bar } = renderBar(readme);

    await user.click(
      within(groupNumber(bar, 2)).getByRole('button', { name: '+ condition' }),
    );
    const picker = screen.getByRole('form', { name: 'New condition' });
    expect(within(picker).getByLabelText('Field')).toHaveValue('status');
    expect(within(picker).getByLabelText('Operator')).toHaveValue('is');
    await user.selectOptions(within(picker).getByLabelText('Value'), 'Broken');
    await user.click(within(picker).getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...readme,
      groups: [
        readme.groups[0],
        {
          joiner: 'and',
          conditions: [inCi, { field: 'status', op: 'is', value: 'Broken' }],
        },
      ],
    });
  });

  it('starts a new group with its condition, joined by and', async () => {
    const { user, onChange, bar } = renderBar(readme);

    await user.click(within(bar).getByRole('button', { name: '+ group' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'lastCaught');
    expect(screen.getByLabelText('Operator')).toHaveValue('never');
    expect(screen.queryByLabelText('Value')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...readme,
      groups: [
        ...readme.groups,
        { joiner: 'and', conditions: [{ field: 'lastCaught', op: 'never' }] },
      ],
    });
  });

  it('starts the first group from the empty filter', async () => {
    const { user, onChange } = renderBar(emptyFilter);

    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Operator'), 'isNot');
    await user.selectOptions(screen.getByLabelText('Value'), 'Proven');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'status', op: 'isNot', value: 'Proven' }],
        },
      ],
    });
  });

  it('offers each field its own operators, in the words a chip uses', async () => {
    const { user } = renderBar(emptyFilter);
    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    const field = screen.getByLabelText('Field');
    const operatorsOffered = (): string[] =>
      within(screen.getByLabelText('Operator'))
        .getAllByRole('option')
        .map((option) => option.textContent);

    expect(
      within(field)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Status', 'Area', 'Last caught', 'Runs']);
    expect(operatorsOffered()).toEqual(['is', 'is not']);

    await user.selectOptions(field, 'lastCaught');
    expect(operatorsOffered()).toEqual([
      'never',
      'longer ago than',
      'within the last',
    ]);

    await user.selectOptions(field, 'runs');
    expect(operatorsOffered()).toEqual(['more than', 'fewer than']);

    await user.selectOptions(field, 'area');
    expect(operatorsOffered()).toEqual(['is', 'is not']);
  });

  it('offers the areas the workspace has, and keeps typed text as typed', async () => {
    const { user, onChange } = renderBar(emptyFilter);
    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'area');

    const value = screen.getByLabelText('Value');
    const listId = value.getAttribute('list') ?? '';
    const suggestions = document.getElementById(listId);
    expect(suggestions).not.toBeNull();
    expect(
      [...(suggestions?.querySelectorAll('option') ?? [])].map(
        (option) => option.value,
      ),
    ).toEqual(workspaceAreas);

    // Lower case is a different area to the compiler, and the bar says
    // nothing else: the reader's spelling is the condition's spelling.
    await user.type(value, 'ci');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'area', op: 'is', value: 'ci' }],
        },
      ],
    });
  });

  it('takes a day count from a preset or from the box', async () => {
    const { user, onChange } = renderBar(emptyFilter);
    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'lastCaught');
    await user.selectOptions(screen.getByLabelText('Operator'), 'before');

    const presets = within(
      screen.getByRole('group', { name: 'Common values' }),
    ).getAllByRole('button');
    expect(presets.map((preset) => preset.textContent)).toEqual([
      '7',
      '30',
      '60',
      '90',
    ]);
    await user.click(screen.getByRole('button', { name: '30' }));
    expect(screen.getByLabelText('Value')).toHaveValue(30);
    expect(screen.getByRole('button', { name: '30' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'lastCaught', op: 'before', days: 30 }],
        },
      ],
    });

    // Adding closes the picker, so the typed route starts from a fresh one.
    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'lastCaught');
    await user.selectOptions(screen.getByLabelText('Operator'), 'before');
    await user.type(screen.getByLabelText('Value'), '45');
    expect(screen.getByRole('button', { name: '30' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'lastCaught', op: 'before', days: 45 }],
        },
      ],
    });
  });

  it('offers run counts as presets too', async () => {
    const { user } = renderBar(emptyFilter);
    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'runs');

    expect(
      within(screen.getByRole('group', { name: 'Common values' }))
        .getAllByRole('button')
        .map((preset) => preset.textContent),
    ).toEqual(['0', '1', '5', '10']);
  });

  /**
   * The acceptance criterion. The refusals are the language's own words, so
   * this is also the test that the picker goes through the language rather
   * than restating its rules.
   */
  it('refuses what the language refuses, in its words, and adds nothing', async () => {
    const { user, onChange } = renderBar(emptyFilter);
    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'lastCaught');
    await user.selectOptions(screen.getByLabelText('Operator'), 'after');
    const value = screen.getByLabelText('Value');
    const add = screen.getByRole('button', { name: 'Add' });

    await user.type(value, '-1');
    await user.click(add);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A day count cannot be negative.',
    );
    expect(value).toHaveFocus();
    expect(value).toHaveAccessibleDescription(
      'A day count cannot be negative.',
    );

    await user.clear(value);
    await user.type(value, '2.5');
    await user.click(add);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A day count must be a whole number of days.',
    );

    await user.clear(value);
    await user.click(add);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a number of days.',
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole('form', { name: 'New condition' }),
    ).toBeInTheDocument();
  });

  it('refuses a status left unchosen, and forgets the refusal once one is', async () => {
    const { user } = renderBar(emptyFilter);
    await user.click(screen.getByRole('button', { name: 'Add a condition' }));

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a status.');

    await user.selectOptions(screen.getByLabelText('Value'), 'Stale');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('adds on Enter from the box', async () => {
    const { user, onChange } = renderBar(emptyFilter);
    await user.click(screen.getByRole('button', { name: 'Add a condition' }));
    await user.selectOptions(screen.getByLabelText('Field'), 'runs');

    await user.type(screen.getByLabelText('Value'), '3{Enter}');

    expect(onChange).toHaveBeenLastCalledWith({
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'runs', op: 'moreThan', count: 3 }],
        },
      ],
    });
  });
});

describe('the caps', () => {
  const never: Condition = { field: 'lastCaught', op: 'never' };

  it('stop offering a condition at the most a group takes, and still offer a group', () => {
    const [first, ...rest] = Array.from(
      { length: MAX_CONDITIONS_PER_GROUP },
      () => never,
    );
    if (first === undefined) {
      throw new Error('The cap is zero.');
    }
    const { bar } = renderBar({
      kind: 'groups',
      joiner: 'and',
      groups: [{ joiner: 'and', conditions: [first, ...rest] }],
    });

    expect(
      within(groupNumber(bar, 1)).queryByRole('button', {
        name: '+ condition',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(bar).getByRole('button', { name: '+ group' }),
    ).toBeInTheDocument();
  });

  it('stop offering a group at the most a filter takes', () => {
    const [first, ...rest] = Array.from({ length: MAX_GROUPS }, () => ({
      joiner: 'and' as const,
      conditions: [never] as const,
    }));
    if (first === undefined) {
      throw new Error('The cap is zero.');
    }
    const { bar } = renderBar({
      kind: 'groups',
      joiner: 'and',
      groups: [first, ...rest],
    });

    expect(
      within(bar).queryByRole('button', { name: '+ group' }),
    ).not.toBeInTheDocument();
    expect(
      within(bar).getAllByRole('button', { name: '+ condition' }),
    ).toHaveLength(MAX_GROUPS);
  });
});

describe('Copy link', () => {
  it('copies the address of the page and says so', async () => {
    const { user, bar } = renderBar(readme);

    await user.click(within(bar).getByRole('button', { name: 'Copy link' }));

    expect(await navigator.clipboard.readText()).toBe(
      `${window.location.origin}${paths.checks({ filter: readme })}`,
    );
    expect(within(bar).getByRole('status')).toHaveTextContent('Copied');
  });

  it('says when the clipboard refused', async () => {
    const { user, bar } = renderBar(readme);
    const refused = vi
      .spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('Write permission denied.'));

    try {
      await user.click(within(bar).getByRole('button', { name: 'Copy link' }));
      expect(within(bar).getByRole('status')).toHaveTextContent(
        "Couldn't copy",
      );
    } finally {
      refused.mockRestore();
    }
  });
});

describe('the notice', () => {
  it("says the link was not read, in the language's words", () => {
    const { bar } = renderBar(emptyFilter, {
      unreadable: [
        {
          path: 'groups[0].conditions[0]',
          message: 'This filter language has no status.was condition.',
        },
      ],
    });

    expect(within(bar).getByRole('alert')).toHaveTextContent(
      "The filter in this link couldn't be read, so every check is listed. This filter language has no status.was condition.",
    );
  });

  it('is absent when the address was read', () => {
    const { bar } = renderBar(readme);

    expect(within(bar).queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('from the keyboard', () => {
  it('reaches every control with Tab, in reading order', async () => {
    const { user } = renderBar(readme);
    const reached: (string | null)[] = [];

    for (let stop = 0; stop < 10; stop += 1) {
      await user.tab();
      reached.push(focusedName());
    }

    expect(reached).toEqual([
      'Copy link',
      'Clear',
      'Remove status is Unproven',
      'OR, switch to AND',
      'Remove status is Stale',
      '+ condition',
      'AND, switch to OR',
      'Remove area is CI',
      '+ condition',
      '+ group',
    ]);
  });

  it('opens the picker onto its field, and closes it back onto the button', async () => {
    const { user, bar } = renderBar(readme);
    const open = within(groupNumber(bar, 1)).getByRole('button', {
      name: '+ condition',
    });
    open.focus();

    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Field')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('form', { name: 'New condition' }),
    ).not.toBeInTheDocument();
    expect(
      within(groupNumber(bar, 1)).getByRole('button', { name: '+ condition' }),
    ).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      within(groupNumber(bar, 1)).getByRole('button', { name: '+ condition' }),
    ).toHaveFocus();
  });

  // Where focus lands once a change is on screen is tested through the
  // app's route table in checks-page.test.tsx, because the change comes back
  // to the bar from the address, and a bar holding its own filter would show
  // the landing on a render the app never has.
});
