import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CheckDetailQuery,
  RecordArmingObservationInput,
  RecordArmingObservationMutation,
} from '../graphql/generated/graphql';
import {
  CheckDetailDocument,
  RecordArmingObservationDocument,
} from '../graphql/generated/graphql';
import { paths } from '../paths';
import type { Answer } from '../testing/client';
import { answer, networkFailure } from '../testing/client';
import { renderApp } from '../testing/render';

type RecordedCheck = NonNullable<CheckDetailQuery['check']>;

const id = 'b7d1c2e3-4f50-4a61-9b72-8c93d4e5f607';
const testDay = '2026-09-15';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 15, 12, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

const unarmedWithNoRuns: RecordedCheck = {
  id,
  name: 'Release notes present',
  area: 'Release',
  protects: 'A release going out with nothing said about what changed.',
  howToTellArmed: 'The release job lists the notes step.',
  status: 'UNARMED',
  lastCaughtOn: null,
  runCount: 0,
  caughtCount: 0,
  missedCount: 0,
  runs: [],
  armingObservations: [],
};

const proven: RecordedCheck = {
  ...unarmedWithNoRuns,
  name: 'Type check on every pull request',
  status: 'PROVEN',
  lastCaughtOn: '2026-09-10',
  runCount: 1,
  caughtCount: 1,
  runs: [
    {
      id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
      runOn: '2026-09-10',
      planted: 'A string where a number belongs.',
      expected: 'The job fails.',
      outcome: 'CAUGHT',
      note: null,
    },
  ],
  armingObservations: [
    {
      id: 'f0e1d2c3-b4a5-4968-8776-655443322110',
      observedOn: '2026-09-01',
      armed: true,
      note: null,
    },
  ],
};

/**
 * A stand-in for the API holding one check. Recording an observation adds it
 * to the check and reads the status again, by the two rules these tests are
 * about: seen on with no runs reads Unproven, and seen off reads Unarmed. The
 * server's own tests prove those rules against the database; what is proved
 * here is that the page sends what was chosen and shows what comes back.
 */
function api(initial: RecordedCheck): { answers: Answer[]; sent: unknown[] } {
  let check = initial;
  const sent: unknown[] = [];

  const detail = answer(CheckDetailDocument, () => ({ check }));
  const record = answer(
    RecordArmingObservationDocument,
    ({ input }: { input: RecordArmingObservationInput }) => {
      sent.push(input);
      let status = check.status;
      if (!input.armed) {
        status = 'UNARMED';
      } else if (check.runs.length === 0) {
        status = 'UNPROVEN';
      }
      check = {
        ...check,
        status,
        armingObservations: [
          {
            id: `observation-${String(sent.length)}`,
            observedOn: input.observedOn,
            armed: input.armed,
            note: input.note ?? null,
          },
          ...check.armingObservations,
        ],
      };
      return {
        recordArmingObservation: {
          __typename: 'ArmingObservationRecorded',
          armingObservation: { id: `observation-${String(sent.length)}` },
          check: { id: check.id, status: check.status },
        },
      } satisfies RecordArmingObservationMutation;
    },
  );
  return { answers: [detail, record], sent };
}

/** What the page's summary says the latest observation found. */
const latestObservation = () => {
  // A term is found by its text: testing-library gives a dt no accessible name.
  const found = screen.getByText('Latest observation', {
    selector: 'dt',
  }).nextElementSibling;
  if (found === null) {
    throw new Error('Nothing is given for the latest observation.');
  }
  return found;
};

const observations = () => screen.getByRole('region', { name: 'Observations' });

async function openForm(user: ReturnType<typeof renderApp>['user']) {
  await user.click(
    await screen.findByRole('button', { name: 'Record an observation' }),
  );
  return screen.getByRole('form', { name: 'Record an observation' });
}

describe('the observation form', () => {
  it('stays closed until asked for, then opens with the date on today', async () => {
    const { user } = renderApp({
      route: paths.check(id),
      answers: api(unarmedWithNoRuns).answers,
    });

    const toggle = await screen.findByRole('button', {
      name: 'Record an observation',
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('form')).not.toBeInTheDocument();

    const form = await openForm(user);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const date = within(form).getByLabelText('Date');
    expect(date).toHaveValue(testDay);
    expect(date).toHaveAttribute('max', testDay);
    expect(date).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('makes an Unarmed check with no runs Unproven when it is seen on', async () => {
    const { answers, sent } = api(unarmedWithNoRuns);
    const { user, router, calls } = renderApp({
      route: paths.check(id),
      answers,
    });
    expect(await screen.findByText('Unarmed')).toBeInTheDocument();
    expect(latestObservation()).toHaveTextContent('Never checked');
    expect(within(observations()).getByRole('status')).toBeEmptyDOMElement();
    const form = await openForm(user);

    await user.click(within(form).getByRole('button', { name: 'It is on' }));
    await user.click(
      within(form).getByRole('button', { name: 'Save observation' }),
    );

    expect(await screen.findByText('Unproven')).toBeInTheDocument();
    expect(screen.queryByText('Unarmed')).not.toBeInTheDocument();
    expect(latestObservation()).toHaveTextContent('Found switched on, today');
    // Said where a screen reader hears it, not only shown in the page (#51).
    expect(within(observations()).getByRole('status')).toHaveTextContent(
      'Observation saved: found switched on, today.',
    );
    expect(within(observations()).getAllByRole('listitem')).toHaveLength(1);
    expect(sent).toEqual([
      { checkId: id, observedOn: testDay, armed: true, note: null },
    ]);
    // Read again in place: same address, the form closed, and focus back on
    // the control that opened it, which a reload or a remount would lose.
    expect(router.state.location.pathname).toBe(paths.check(id));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Record an observation' }),
    ).toHaveFocus();
    expect(calls.map((call) => call.name)).toEqual([
      'CheckDetail',
      'RecordArmingObservation',
      'CheckDetail',
    ]);
  });

  it('makes a Proven check Unarmed when it is seen off', async () => {
    const { answers, sent } = api(proven);
    const { user } = renderApp({ route: paths.check(id), answers });
    expect(await screen.findByText('Proven')).toBeInTheDocument();
    const form = await openForm(user);

    await user.click(within(form).getByRole('button', { name: 'It is off' }));
    await user.type(
      within(form).getByLabelText('Note (optional)'),
      'Switched off while the pipeline is rebuilt.',
    );
    await user.click(
      within(form).getByRole('button', { name: 'Save observation' }),
    );

    expect(await screen.findByText('Unarmed')).toBeInTheDocument();
    expect(screen.queryByText('Proven')).not.toBeInTheDocument();
    expect(latestObservation()).toHaveTextContent('Found switched off, today');
    expect(within(observations()).getByRole('status')).toHaveTextContent(
      'Observation saved: found switched off, today.',
    );
    // The note typed into the form is shown with the observation it belongs
    // to. Before #51 it was stored and never read back.
    const [newest] = within(observations()).getAllByRole('listitem');
    expect(newest).toHaveTextContent('✕Found switched off');
    expect(newest).toHaveTextContent(
      'Switched off while the pipeline is rebuilt.',
    );
    expect(sent).toEqual([
      {
        checkId: id,
        observedOn: testDay,
        armed: false,
        note: 'Switched off while the pipeline is rebuilt.',
      },
    ]);
  });

  it('marks a missing answer and a future date, and sends nothing', async () => {
    const { answers, sent } = api(unarmedWithNoRuns);
    const { user } = renderApp({ route: paths.check(id), answers });
    const form = await openForm(user);
    const date = within(form).getByLabelText('Date');
    await user.clear(date);
    await user.type(date, '2026-09-16');

    await user.click(
      within(form).getByRole('button', { name: 'Save observation' }),
    );

    expect(within(form).getByRole('alert')).toHaveTextContent(
      '2 details are missing. They are marked below.',
    );
    expect(date).toHaveAccessibleDescription(
      'An observation cannot be dated after today.',
    );
    expect(date).toHaveFocus();
    expect(
      within(form).getByRole('button', { name: 'It is on' }),
    ).toHaveAccessibleDescription('Say whether the check was on or off.');
    expect(sent).toEqual([]);
  });

  it('shows a refusal from the API beside its field', async () => {
    const refusal = answer(RecordArmingObservationDocument, {
      recordArmingObservation: {
        __typename: 'ValidationErrors',
        errors: [
          {
            path: 'note',
            message: 'This contains a character that cannot be saved.',
          },
        ],
      },
    });
    const { user } = renderApp({
      route: paths.check(id),
      answers: [...api(unarmedWithNoRuns).answers, refusal],
    });
    const form = await openForm(user);
    await user.click(within(form).getByRole('button', { name: 'It is on' }));

    await user.click(
      within(form).getByRole('button', { name: 'Save observation' }),
    );

    const note = within(form).getByLabelText('Note (optional)');
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'One detail is missing. It is marked below.',
    );
    expect(note).toHaveAccessibleDescription(
      'This contains a character that cannot be saved.',
    );
    expect(note).toHaveFocus();
  });

  it('keeps the form open with a way to try again when the save cannot be sent', async () => {
    const { user } = renderApp({
      route: paths.check(id),
      answers: [
        ...api(unarmedWithNoRuns).answers,
        networkFailure(RecordArmingObservationDocument),
      ],
    });
    const form = await openForm(user);
    await user.click(within(form).getByRole('button', { name: 'It is off' }));

    await user.click(
      within(form).getByRole('button', { name: 'Save observation' }),
    );

    const notice = await within(form).findByRole('alert');
    expect(
      within(notice).getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
    expect(
      within(form).getByRole('button', { name: 'It is off' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('closes again from the same control', async () => {
    const { user } = renderApp({
      route: paths.check(id),
      answers: api(unarmedWithNoRuns).answers,
    });
    await openForm(user);

    await user.click(
      screen.getByRole('button', { name: 'Record an observation' }),
    );

    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });

  it('does not fill its button with brick', async () => {
    const { user, container } = renderApp({
      route: paths.check(id),
      answers: api(unarmedWithNoRuns).answers,
    });
    const form = await openForm(user);

    expect(
      within(form).getByRole('button', { name: 'Save observation' }),
    ).not.toHaveClass('button--primary');
    expect(container.querySelectorAll('.button--primary')).toHaveLength(1);
  });

  it('works with the keyboard alone', async () => {
    const { answers, sent } = api(unarmedWithNoRuns);
    const { user } = renderApp({ route: paths.check(id), answers });
    const toggle = await screen.findByRole('button', {
      name: 'Record an observation',
    });
    toggle.focus();

    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Date')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'It is on' })).toHaveFocus();
    await user.keyboard(' ');
    await user.tab();
    await user.tab();
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Save observation' }),
    ).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(await screen.findByText('Unproven')).toBeInTheDocument();
    expect(sent).toHaveLength(1);
    expect(toggle).toHaveFocus();
  });
});

/**
 * The mark beside "Observation saved". #58 found it hard-coded to the green
 * tick, so an observation that found the check off was confirmed with the mark
 * for on, beside words saying off. The list under the line draws its mark from
 * what was found, and the line has to draw the same one.
 */
describe('the mark beside a saved observation', () => {
  it.each([
    { choice: 'It is on', check: unarmedWithNoRuns, glyph: '✓', found: 'on' },
    { choice: 'It is off', check: proven, glyph: '✕', found: 'off' },
  ])(
    'is the $found mark the observation list uses, after "$choice"',
    async ({ choice, check, glyph, found }) => {
      const { user } = renderApp({
        route: paths.check(id),
        answers: api(check).answers,
      });
      const form = await openForm(user);
      await user.click(within(form).getByRole('button', { name: choice }));

      await user.click(
        within(form).getByRole('button', { name: 'Save observation' }),
      );

      const line = within(observations()).getByRole('status');
      await waitFor(() => {
        expect(line).toHaveTextContent(`found switched ${found}`);
      });
      const mark = line.querySelector('.finding__glyph');
      expect(mark).toHaveTextContent(glyph);
      expect(mark).toHaveClass(`finding__glyph--${found}`);
      // The same mark, class for class, as the entry the save added to the
      // list, so the two cannot say different things about one observation.
      const [newest] = within(observations()).getAllByRole('listitem');
      const listed = newest?.querySelector('.finding__glyph') ?? null;
      expect(listed).not.toBeNull();
      expect(mark?.className).toBe(listed?.className);
      expect(mark?.textContent).toBe(listed?.textContent);
    },
  );
});
