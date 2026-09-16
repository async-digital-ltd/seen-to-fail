import { act, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type {
  ChecksQuery,
  StatusCountsQuery,
} from '../graphql/generated/graphql';
import {
  AreasDocument,
  CheckDetailDocument,
  ChecksDocument,
  CreateCheckDocument,
  StatusCountsDocument,
} from '../graphql/generated/graphql';
import { paths } from '../paths';
import type { Answer, Call } from '../testing/client';
import { answer, networkFailure } from '../testing/client';
import type { Rendered } from '../testing/render';
import { renderApp } from '../testing/render';
import type { ListedCheck } from './checks/check-row';

/**
 * The form for adding a check, at /checks/new.
 *
 * Opened through the app's own route table rather than mounted as an element,
 * so what is under test is the address a reader arrives at and not a component
 * a test chose for itself. The address is the thing this story changed.
 *
 * The rules the API applies are the server's tests to keep. What is checked
 * here is the form: which details it insists on, where a refusal lands, what it
 * sends for a field left blank, and where it goes once the check is written.
 */

const workspaceAreas = ['CI', 'Docs'];

const labels = {
  name: 'Name',
  area: 'Area',
  protects: 'What it protects (optional)',
  howToTellArmed: 'How you can tell it is switched on (optional)',
};

/** What the API answers when a check is written. */
function created(id: string): Answer {
  return answer(CreateCheckDocument, {
    createCheck: {
      __typename: 'Check',
      id,
      name: 'Lint on push',
      status: 'UNARMED',
    },
  });
}

/** What the API answers when it refuses one field. */
function refused(path: string, message: string): Answer {
  return answer(CreateCheckDocument, {
    createCheck: {
      __typename: 'ValidationErrors',
      errors: [{ path, message }],
    },
  });
}

const areas = answer(AreasDocument, { areas: workspaceAreas });

function open(answers: readonly Answer[] = [areas]) {
  return renderApp({ route: paths.newCheck(), answers });
}

/** Types a name and an area, which are the only two details required. */
async function fillRequired(
  user: UserEvent,
  values: { readonly name: string; readonly area: string },
): Promise<void> {
  await user.type(screen.getByLabelText(labels.name), values.name);
  await user.type(screen.getByLabelText(labels.area), values.area);
}

function save(): HTMLElement {
  return screen.getByRole('button', { name: 'Save check' });
}

function names(calls: readonly Call[]): string[] {
  return calls.map((call) => call.name);
}

/** The CreateCheck input the form sent, read off the calls the stub saw. */
function sentInput(calls: readonly Call[]): unknown {
  const call = calls.findLast((candidate) => candidate.name === 'CreateCheck');
  return (call?.variables as { readonly input?: unknown } | undefined)?.input;
}

/** The area suggestions the box is offering right now. */
function suggestions(): string[] {
  const area = screen.getByLabelText(labels.area);
  const list = document.getElementById(area.getAttribute('list') ?? '');
  return [...(list?.querySelectorAll('option') ?? [])].map(
    (option) => option.value,
  );
}

describe('the form', () => {
  it('answers the add-check address itself, rather than a screen still to come', async () => {
    const { calls } = open();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a check' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(labels.name)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.area)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.protects)).toBeInTheDocument();
    expect(screen.getByLabelText(labels.howToTellArmed)).toBeInTheDocument();
    expect(save()).toBeInTheDocument();
    await waitFor(() => {
      expect(names(calls)).toContain('Areas');
    });
  });

  it('marks a missing name on the name field, and sends nothing', async () => {
    const { calls, user } = open();

    await user.type(screen.getByLabelText(labels.area), 'CI');
    await user.click(save());

    const name = screen.getByLabelText(labels.name);
    expect(name).toHaveAccessibleDescription('Give the check a name.');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(document.querySelectorAll('.field--invalid')).toHaveLength(1);
    expect(names(calls)).not.toContain('CreateCheck');
  });

  it('marks a missing area on the area field, and sends nothing', async () => {
    const { calls, user } = open();

    await user.type(screen.getByLabelText(labels.name), 'Lint on push');
    await user.click(save());

    const area = screen.getByLabelText(labels.area);
    expect(area).toHaveAccessibleDescription('Say where the check runs.');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area).toHaveFocus();
    expect(document.querySelectorAll('.field--invalid')).toHaveLength(1);
    expect(names(calls)).not.toContain('CreateCheck');
  });

  it('marks both when neither is given, and starts at the first', async () => {
    const { calls, user } = open();

    await user.click(save());

    expect(screen.getByLabelText(labels.name)).toHaveFocus();
    expect(document.querySelectorAll('.field--invalid')).toHaveLength(2);
    expect(names(calls)).not.toContain('CreateCheck');
  });

  /**
   * A name of nothing but spaces is a missing name. The API trims before it
   * stores, so a form that let this through would be sending a name the API
   * would refuse for a reason the form already knew.
   */
  it('counts a detail of nothing but spaces as missing', async () => {
    const { calls, user } = open();

    await fillRequired(user, { name: '   ', area: ' ' });
    await user.click(save());

    expect(screen.getByLabelText(labels.name)).toHaveAccessibleDescription(
      'Give the check a name.',
    );
    expect(screen.getByLabelText(labels.area)).toHaveAccessibleDescription(
      'Say where the check runs.',
    );
    expect(names(calls)).not.toContain('CreateCheck');
  });

  /**
   * A name already in use is found as the row is written rather than from the
   * input alone, so it arrives from the API and has to land on the same field
   * the form's own checks would have marked.
   */
  it('shows a name already in use on the name field, not elsewhere', async () => {
    const taken = 'There is already a check with this name.';
    const { user } = open([areas, refused('name', taken)]);

    await fillRequired(user, { name: 'Lint on push', area: 'CI' });
    await user.click(save());

    const name = screen.getByLabelText(labels.name);
    await waitFor(() => {
      expect(name).toHaveAccessibleDescription(taken);
    });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
    expect(screen.getByLabelText(labels.area)).not.toHaveAttribute(
      'aria-invalid',
    );
    expect(document.querySelectorAll('.field--invalid')).toHaveLength(1);
  });

  it('keeps what was typed when the API refuses the name', async () => {
    const { user } = open([
      areas,
      refused('name', 'There is already a check with this name.'),
    ]);

    await fillRequired(user, { name: 'Lint on push', area: 'CI' });
    await user.type(screen.getByLabelText(labels.protects), 'Style drift');
    await user.click(save());

    await waitFor(() => {
      expect(screen.getByLabelText(labels.name)).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
    expect(screen.getByLabelText(labels.area)).toHaveValue('CI');
    expect(screen.getByLabelText(labels.protects)).toHaveValue('Style drift');
  });

  it('goes to the new check page once the check is written', async () => {
    const { router, user } = open([areas, created('lint-on-push')]);

    await fillRequired(user, { name: 'Lint on push', area: 'CI' });
    await user.click(save());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.check('lint-on-push'));
    });
    expect(screen.queryByRole('button', { name: 'Save check' })).toBeNull();
  });

  /**
   * An id carrying a character an address would otherwise read as punctuation,
   * so that what is checked is the address the paths module builds rather than
   * one this test spelled by hand.
   */
  it('goes to the right page for an id that needs escaping', async () => {
    const id = 'lint/on push';
    const { router, user } = open([areas, created(id)]);

    await fillRequired(user, { name: 'Lint on push', area: 'CI' });
    await user.click(save());

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.check(id));
    });
  });

  it('stays on the form when the request never lands, and says so', async () => {
    const { router, user } = open([areas, networkFailure(CreateCheckDocument)]);

    await fillRequired(user, { name: 'Lint on push', area: 'CI' });
    await user.click(save());

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(paths.newCheck());
    expect(screen.getByLabelText(labels.name)).toHaveValue('Lint on push');
  });

  it('cancels back to the list without sending anything', async () => {
    const { calls, router, user } = open();

    await fillRequired(user, { name: 'Lint on push', area: 'CI' });
    await user.click(screen.getByRole('link', { name: 'Cancel' }));

    expect(router.state.location.pathname).toBe('/');
    expect(names(calls)).not.toContain('CreateCheck');
  });
});

/**
 * What a reader leaves blank is sent as empty text: not left out, and not sent
 * as null. The schema asks for both fields, and the API stores a blank one as
 * empty, which is how the record says nobody has written it down.
 */
describe('a check described by name and area alone', () => {
  it('sends empty text for what it protects and how to tell it is on', async () => {
    const { calls, user } = open([areas, created('lint-on-push')]);

    await fillRequired(user, { name: 'Lint on push', area: 'CI' });
    await user.click(save());

    await waitFor(() => {
      expect(sentInput(calls)).toStrictEqual({
        name: 'Lint on push',
        area: 'CI',
        protects: '',
        howToTellArmed: '',
      });
    });
  });

  it('sends what was written when both are filled in', async () => {
    const { calls, user } = open([areas, created('lint-on-push')]);

    await fillRequired(user, { name: 'Lint on push', area: 'CI' });
    await user.type(screen.getByLabelText(labels.protects), 'Style drift');
    await user.type(
      screen.getByLabelText(labels.howToTellArmed),
      'The job is in the workflow file.',
    );
    await user.click(save());

    await waitFor(() => {
      expect(sentInput(calls)).toStrictEqual({
        name: 'Lint on push',
        area: 'CI',
        protects: 'Style drift',
        howToTellArmed: 'The job is in the workflow file.',
      });
    });
  });
});

describe('the area suggestions', () => {
  it('offers the areas the workspace has, and keeps typed text as typed', async () => {
    const { user } = open();

    await waitFor(() => {
      expect(suggestions()).toEqual(workspaceAreas);
    });

    await user.type(screen.getByLabelText(labels.area), 'Release');
    expect(screen.getByLabelText(labels.area)).toHaveValue('Release');
    expect(suggestions()).toEqual(workspaceAreas);
  });

  /**
   * The areas query answers with plain strings and carries no type of its own,
   * so the document cache has nothing to invalidate it on when a check is
   * written. Reading it cache-and-network is what makes an area introduced by a
   * new check appear the next time the form is opened rather than after a
   * reload.
   *
   * The second visit is a fresh mount of the same screen under the same client,
   * which is what a reader gets by coming back to the form. Under the default
   * policy the cached answer would be served and no second Areas call would be
   * made at all, so both assertions below turn on the policy.
   */
  it('offers an area introduced since the page loaded, with no reload', async () => {
    let written = false;
    const growing = answer(AreasDocument, () => ({
      areas: written ? [...workspaceAreas, 'Release'] : workspaceAreas,
    }));
    const writes = answer(CreateCheckDocument, () => {
      written = true;
      return {
        createCheck: {
          __typename: 'Check' as const,
          id: 'notes-present',
          name: 'Release notes present',
          status: 'UNARMED' as const,
        },
      };
    });
    const { calls, router, user } = open([growing, writes]);

    await waitFor(() => {
      expect(suggestions()).toEqual(workspaceAreas);
    });
    await fillRequired(user, {
      name: 'Release notes present',
      area: 'Release',
    });
    await user.click(save());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.check('notes-present'));
    });

    await act(async () => {
      await router.navigate(paths.newCheck());
    });

    await screen.findByLabelText(labels.area);
    await waitFor(() => {
      expect(suggestions()).toContain('Release');
    });
    expect(calls.filter((call) => call.name === 'Areas')).toHaveLength(2);
  });
});

/**
 * The acceptance the story was written against: a check just added is in the
 * list, and reads Unarmed, because nothing has been run against it and nobody
 * has yet said whether it is switched on.
 *
 * Checked from the list rather than from the form, because the form does
 * nothing to arrange it. The list is read cache-first, so a reader who had it
 * open before adding the check would otherwise be served the answer from
 * before. What brings it up to date is the mutation answering with a Check:
 * the document cache re-reads every query holding one, and the list holds
 * them. That is the sentence the page's own comment makes, and nothing else
 * here would notice if it stopped being true.
 */
describe('the list, once a check has been added', () => {
  const existing: ListedCheck = {
    id: 'build-types',
    name: 'Build fails on a type error',
    area: 'CI',
    status: 'PROVEN',
    lastCaughtOn: '2026-09-12',
    runCount: 1,
    runs: [
      {
        id: 'run-1',
        runOn: '2026-09-12',
        outcome: 'CAUGHT',
        planted: 'A string passed where a number belongs.',
      },
    ],
  };

  const addition: ListedCheck = {
    id: 'lint-on-push',
    name: 'Lint on push',
    area: 'CI',
    status: 'UNARMED',
    lastCaughtOn: null,
    runCount: 0,
    runs: [],
  };

  /** The counts the workspace really has, so no test states one of its own. */
  function countsOf(checks: readonly ListedCheck[]): StatusCountsQuery {
    const holding = (status: ListedCheck['status']): number =>
      checks.filter((check) => check.status === status).length;
    return {
      statusCounts: {
        proven: holding('PROVEN'),
        unproven: holding('UNPROVEN'),
        stale: holding('STALE'),
        unarmed: holding('UNARMED'),
        broken: holding('BROKEN'),
        total: checks.length,
      },
    };
  }

  /**
   * A workspace the API writes to, so the answers a screen gets after the
   * check is written are the ones the API would then be giving.
   */
  function answersFor(workspace: ListedCheck[]): Answer[] {
    return [
      areas,
      answer(ChecksDocument, (): ChecksQuery => ({
        checks: {
          checks: [...workspace],
          matching: workspace.length,
          hidden: 0,
        },
      })),
      answer(StatusCountsDocument, () => countsOf(workspace)),
      answer(CreateCheckDocument, () => {
        workspace.push(addition);
        return {
          createCheck: {
            __typename: 'Check' as const,
            id: addition.id,
            name: addition.name,
            status: addition.status,
          },
        };
      }),
      answer(CheckDetailDocument, { check: null }),
    ];
  }

  /** Adds the check through the form, from wherever the reader is now. */
  async function addTheCheck(
    router: Rendered['router'],
    user: UserEvent,
  ): Promise<void> {
    await act(async () => {
      await router.navigate(paths.newCheck());
    });
    await fillRequired(user, { name: addition.name, area: addition.area });
    await user.click(save());
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.check(addition.id));
    });
    await act(async () => {
      await router.navigate(paths.checks());
    });
  }

  it('holds the new check, reading Unarmed', async () => {
    const workspace: ListedCheck[] = [existing];
    const { router, user } = renderApp({
      route: paths.checks(),
      answers: answersFor(workspace),
    });

    // The list is read, and cached, before the check is added.
    expect(await screen.findByText(existing.name)).toBeInTheDocument();
    expect(screen.queryByText(addition.name)).toBeNull();

    await addTheCheck(router, user);

    const row = (await screen.findByText(addition.name)).closest('li');
    expect(row).toHaveTextContent('Unarmed');
  });

  /**
   * The first check anybody adds, which is the journey the README walks.
   *
   * An empty workspace is told apart from a full one by the counts, not by the
   * list, and the counts gate the whole screen: at a total of nothing the list
   * is not rendered at all. So a stale count does not leave the page one short
   * here, it leaves the reader looking at "No checks yet" and the button they
   * have just come back from, with their check nowhere on the page until they
   * reload.
   */
  it('replaces the empty workspace with the first check added to it', async () => {
    const workspace: ListedCheck[] = [];
    const { router, user } = renderApp({
      route: paths.checks(),
      answers: answersFor(workspace),
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'No checks yet' }),
    ).toBeInTheDocument();

    await addTheCheck(router, user);

    const row = (await screen.findByText(addition.name)).closest('li');
    expect(row).toHaveTextContent('Unarmed');
    expect(
      screen.queryByRole('heading', { level: 2, name: 'No checks yet' }),
    ).toBeNull();
  });
});

/**
 * Every control is reachable and operable from the keyboard alone. The fields
 * are plain inputs and text boxes, the save is a button and the cancel is a
 * link, so this is a test that nothing has been made unreachable rather than
 * that anything clever was built.
 */
describe('a reader using the keyboard alone', () => {
  /**
   * Tabs from wherever focus is until it lands on the control, or gives up.
   *
   * The form is inside the shell, so the first tabs from the top of the page
   * go to the top bar. What matters here is that the form is reached at all,
   * not how many links precede it, so the count is not asserted.
   */
  async function tabTo(
    user: UserEvent,
    control: HTMLElement,
    limit = 10,
  ): Promise<boolean> {
    for (let step = 0; step < limit; step += 1) {
      await user.tab();
      if (document.activeElement === control) {
        return true;
      }
    }
    return false;
  }

  it('reaches every control in the order the form lays them out', async () => {
    const { user } = open();

    const first = screen.getByLabelText(labels.name);
    const rest = [
      screen.getByLabelText(labels.area),
      screen.getByLabelText(labels.protects),
      screen.getByLabelText(labels.howToTellArmed),
      save(),
      screen.getByRole('link', { name: 'Cancel' }),
    ];

    expect(await tabTo(user, first)).toBe(true);
    expect(first).not.toHaveAttribute('tabindex', '-1');
    for (const control of rest) {
      await user.tab();
      expect(control).toHaveFocus();
      expect(control).not.toHaveAttribute('tabindex', '-1');
    }
  });

  it('fills in and saves the check without a pointer', async () => {
    const { calls, router, user } = open([areas, created('lint-on-push')]);

    expect(await tabTo(user, screen.getByLabelText(labels.name))).toBe(true);
    await user.keyboard('Lint on push');
    await user.tab();
    await user.keyboard('CI');
    await user.tab();
    await user.keyboard('Style drift');
    await user.tab();
    await user.tab();
    expect(save()).toHaveFocus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(paths.check('lint-on-push'));
    });
    expect(sentInput(calls)).toStrictEqual({
      name: 'Lint on push',
      area: 'CI',
      protects: 'Style drift',
      howToTellArmed: '',
    });
  });

  /** Enter in a single-line field submits the form, as it does in a browser. */
  it('submits from the name field, and is put on the detail it left out', async () => {
    const { calls, user } = open();

    expect(await tabTo(user, screen.getByLabelText(labels.name))).toBe(true);
    await user.keyboard('Lint on push{Enter}');

    await waitFor(() => {
      expect(screen.getByLabelText(labels.area)).toHaveFocus();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(names(calls)).not.toContain('CreateCheck');
  });
});
