import { STATUSES } from '@seen-to-fail/filter';
import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CheckDetailQuery } from '../graphql/generated/graphql';
import { CheckDetailDocument } from '../graphql/generated/graphql';
import { paths } from '../paths';
import type { StatusName } from '../status';
import { statusFromName } from '../status';
import { answer, networkFailure, pending } from '../testing/client';
import { renderApp, renderWithProviders } from '../testing/render';
import { CheckDetail } from './check-detail';

type RecordedCheck = NonNullable<CheckDetailQuery['check']>;
type Run = RecordedCheck['runs'][number];

/**
 * Every "days ago" on the page is counted from the reader's today, so the
 * clock is pinned to midday on one day and each expected figure below is
 * worked out by hand from it.
 */
beforeEach(() => {
  vi.setSystemTime(new Date(2026, 8, 15, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

const id = 'check-1';

function aCheck(overrides: Partial<RecordedCheck> = {}): RecordedCheck {
  return {
    id,
    name: 'Type check on every push',
    area: 'CI',
    protects: 'Code that no longer compiles reaching the main branch.',
    howToTellArmed: 'A type check job is listed on every pull request.',
    status: 'UNARMED',
    lastCaughtOn: null,
    runCount: 0,
    caughtCount: 0,
    missedCount: 0,
    runs: [],
    armingObservations: [],
    ...overrides,
  };
}

function aRun(overrides: Partial<Run> & Pick<Run, 'id' | 'runOn'>): Run {
  return {
    planted: 'A string passed where a number is expected',
    expected: 'The job fails and names the line',
    outcome: 'CAUGHT',
    note: null,
    ...overrides,
  };
}

function renderCheck(check: RecordedCheck | null) {
  return renderWithProviders(<CheckDetail />, {
    route: paths.check(id),
    path: '/checks/:id',
    answers: [answer(CheckDetailDocument, { check })],
  });
}

async function renderRecordedCheck(overrides: Partial<RecordedCheck> = {}) {
  const rendered = renderCheck(aCheck(overrides));
  await screen.findByRole('heading', { level: 1 });
  return rendered;
}

describe('while the check is on its way', () => {
  it('shows the loading state', () => {
    renderWithProviders(<CheckDetail />, {
      route: paths.check(id),
      path: '/checks/:id',
      answers: [pending(CheckDetailDocument)],
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('when the check cannot be read', () => {
  it('shows the error notice', async () => {
    renderWithProviders(<CheckDetail />, {
      route: paths.check(id),
      path: '/checks/:id',
      answers: [networkFailure(CheckDetailDocument)],
    });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('for an id nothing is recorded under', () => {
  it('says the check is not found and links back to the list', async () => {
    renderCheck(null);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Check not found' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the checks' }),
    ).toHaveAttribute('href', paths.checks());
  });
});

describe('the heading', () => {
  it('asks for the check the address names', async () => {
    const { calls } = await renderRecordedCheck();

    expect(calls).toEqual([
      { kind: 'query', name: 'CheckDetail', variables: { id } },
    ]);
  });

  it('links back to the checks', async () => {
    await renderRecordedCheck();

    expect(screen.getByRole('link', { name: 'Checks' })).toHaveAttribute(
      'href',
      paths.checks(),
    );
  });

  it('names the check, counts its runs, and shows its status', async () => {
    await renderRecordedCheck({
      status: 'BROKEN',
      lastCaughtOn: '2026-08-01',
      runCount: 3,
      caughtCount: 2,
      missedCount: 1,
    });

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Type check on every push',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('CI · 3 runs · 2 caught · 1 missed'),
    ).toBeInTheDocument();
    // The shared badge, glyph and word together.
    expect(
      screen.getByText('Broken').closest('.status-badge'),
    ).toHaveTextContent('✕Broken');
  });

  it('counts a single run in the singular', async () => {
    await renderRecordedCheck({ runCount: 1, caughtCount: 1 });

    expect(
      screen.getByText('CI · 1 run · 1 caught · 0 missed'),
    ).toBeInTheDocument();
  });
});

/** Each status that asks for something, and the sentence that asks. */
const callouts: readonly {
  readonly status: StatusName;
  readonly check: Partial<RecordedCheck>;
  readonly sentence: string;
}[] = [
  {
    status: 'STALE',
    check: { lastCaughtOn: '2026-07-06' },
    sentence:
      'The last proof is 71 days old. Log a new test run to confirm this check still catches what it should.',
  },
  {
    status: 'BROKEN',
    check: { lastCaughtOn: '2026-08-01' },
    sentence:
      'The latest planted defect was missed. Fix the check, then log another run to prove it.',
  },
  {
    status: 'UNPROVEN',
    check: {},
    sentence:
      'This check has never been seen to catch anything. Plant the defect it exists for and log what happens.',
  },
  {
    status: 'UNARMED',
    check: {},
    sentence:
      'There is no evidence this check is switched on. Confirm it is on, then plant a defect.',
  },
];

describe('the next step', () => {
  it('covers every status but Proven, each once', () => {
    expect(
      [
        ...callouts.map(({ status }) => statusFromName(status)),
        'Proven',
      ].sort(),
    ).toEqual([...STATUSES].sort());
  });

  describe.each(callouts)(
    'for a $status check',
    ({ status, check, sentence }) => {
      it('says what to do next', async () => {
        await renderRecordedCheck({ ...check, status });

        expect(screen.getByText(sentence)).toBeInTheDocument();
      });

      it('offers the one primary action: logging a run for this check', async () => {
        const { container } = await renderRecordedCheck({ ...check, status });

        const button = screen.getByRole('link', { name: 'Log a test run' });
        expect(button).toHaveAttribute('href', paths.newRun({ check: id }));
        expect(button).toHaveClass('button--primary');
        expect(container.querySelectorAll('.button--primary')).toHaveLength(1);
      });
    },
  );

  it('is not shown for a Proven check, which can still log a run', async () => {
    await renderRecordedCheck({ status: 'PROVEN', lastCaughtOn: '2026-09-06' });

    expect(screen.getByText('Proven')).toBeInTheDocument();
    for (const { sentence } of callouts) {
      expect(screen.queryByText(sentence)).not.toBeInTheDocument();
    }
    expect(
      screen.getByRole('link', { name: 'Log a test run' }),
    ).toHaveAttribute('href', paths.newRun({ check: id }));
  });

  it('is the only brick fill on the screen, shell included', async () => {
    const { container } = renderApp({
      route: paths.check(id),
      answers: [answer(CheckDetailDocument, { check: aCheck() })],
    });
    await screen.findByRole('heading', { level: 1, name: aCheck().name });

    // The shell's own "Log a test run" is outlined, and goes to the form
    // with nothing selected, so the one fill is told apart by where it goes.
    const fills = container.querySelectorAll('.button--primary');
    expect(fills).toHaveLength(1);
    expect(fills[0]).toHaveAttribute('href', paths.newRun({ check: id }));
  });
});

describe('what the check is for', () => {
  it('shows what it protects and how to tell it is on', async () => {
    await renderRecordedCheck();

    expect(
      screen.getByRole('region', { name: 'What it protects' }),
    ).toHaveTextContent(
      'Code that no longer compiles reaching the main branch.',
    );
    expect(
      screen.getByRole('region', {
        name: 'How you can tell it is switched on',
      }),
    ).toHaveTextContent('A type check job is listed on every pull request.');
  });

  it.each([
    { field: 'protects', card: 'What it protects' },
    { field: 'howToTellArmed', card: 'How you can tell it is switched on' },
  ] as const)(
    'says $field is not written down yet when it is blank',
    async ({ field, card }) => {
      await renderRecordedCheck({ [field]: '' });

      expect(screen.getByRole('region', { name: card })).toHaveTextContent(
        'Not written down yet',
      );
      expect(screen.getAllByText('Not written down yet')).toHaveLength(1);
    },
  );
});

/** The value beside a term in the page's summary of its latest evidence. */
function latest(term: 'Latest observation' | 'Latest test run') {
  // A term is found by its text: testing-library gives a dt no accessible name.
  const found = screen.getByText(term, { selector: 'dt' }).nextElementSibling;
  if (found === null) {
    throw new Error(`Nothing is given for ${term}.`);
  }
  return found;
}

describe('the latest evidence', () => {
  it('says nobody has checked and nothing has run when there is no evidence', async () => {
    await renderRecordedCheck();

    expect(latest('Latest observation')).toHaveTextContent('Never checked');
    expect(latest('Latest test run')).toHaveTextContent('None yet');
  });

  it('reads the latest observation when it found the check on', async () => {
    await renderRecordedCheck({
      armingObservations: [
        { id: 'o2', observedOn: '2026-09-13', armed: true, note: null },
        { id: 'o1', observedOn: '2026-09-05', armed: false, note: null },
      ],
    });

    expect(latest('Latest observation')).toHaveTextContent(
      'Found switched on, 2 days ago',
    );
  });

  it('reads the latest observation when it found the check off', async () => {
    await renderRecordedCheck({
      armingObservations: [
        { id: 'o2', observedOn: '2026-09-05', armed: false, note: null },
        { id: 'o1', observedOn: '2026-09-01', armed: true, note: null },
      ],
    });

    expect(latest('Latest observation')).toHaveTextContent(
      'Found switched off, 10 days ago',
    );
  });

  it('reads the latest run, caught or missed', async () => {
    await renderRecordedCheck({
      status: 'BROKEN',
      runs: [
        aRun({ id: 'r2', runOn: '2026-09-14', outcome: 'MISSED' }),
        aRun({ id: 'r1', runOn: '2026-09-01' }),
      ],
    });

    expect(latest('Latest test run')).toHaveTextContent('Missed it, yesterday');
  });
});

describe('the two kinds of evidence', () => {
  const evidence = () => screen.getByRole('region', { name: 'Evidence' });

  it('names the question each kind answers, and offers its action there', async () => {
    await renderRecordedCheck();

    const switchedOn = within(evidence()).getByRole('region', {
      name: 'Is it switched on?',
    });
    expect(switchedOn).toHaveTextContent(
      'An observation. Somebody looked at the check, without planting anything, and recorded what they found.',
    );
    expect(
      within(switchedOn).getByRole('button', { name: 'Record an observation' }),
    ).not.toHaveClass('button--primary');

    const works = within(evidence()).getByRole('region', {
      name: 'Does it work?',
    });
    expect(works).toHaveTextContent(
      'A test run. Somebody planted the defect this check exists to catch and saw what happened.',
    );
    expect(
      within(works).getByRole('link', { name: 'Log a test run' }),
    ).toHaveClass('button--primary');
  });

  it('counts what each kind holds', async () => {
    await renderRecordedCheck({
      status: 'BROKEN',
      lastCaughtOn: '2026-08-01',
      runCount: 3,
      caughtCount: 2,
      missedCount: 1,
      armingObservations: [
        { id: 'o2', observedOn: '2026-09-13', armed: true, note: null },
        { id: 'o1', observedOn: '2026-09-05', armed: true, note: null },
      ],
    });

    expect(
      within(evidence()).getByRole('region', { name: 'Is it switched on?' }),
    ).toHaveTextContent('2 observations, the latest 2 days ago');
    expect(
      within(evidence()).getByRole('region', { name: 'Does it work?' }),
    ).toHaveTextContent('3 runs, 2 caught and 1 missed');
  });

  it('says when nothing of a kind is recorded', async () => {
    await renderRecordedCheck();

    for (const name of ['Is it switched on?', 'Does it work?']) {
      expect(
        within(evidence()).getByRole('region', { name }),
      ).toHaveTextContent('Nothing recorded yet');
    }
  });
});

describe('the observations', () => {
  const observationsSection = () =>
    screen.getByRole('region', { name: 'Observations' });

  it('lists every observation newest first, with what was found and its note', async () => {
    await renderRecordedCheck({
      status: 'UNARMED',
      armingObservations: [
        {
          id: 'o2',
          observedOn: '2026-09-13',
          armed: false,
          note: 'Hook removed while the repository moved.',
        },
        { id: 'o1', observedOn: '2026-09-05', armed: true, note: null },
      ],
    });

    const entries = within(observationsSection()).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    const [newest, older] = entries;
    if (newest === undefined || older === undefined) {
      throw new Error('Two observations were not rendered.');
    }
    expect(newest).toHaveTextContent('2 days ago13 Sep 2026');
    expect(newest).toHaveTextContent('✕Found switched off');
    expect(newest).toHaveTextContent(
      'Hook removed while the repository moved.',
    );
    expect(older).toHaveTextContent('10 days ago5 Sep 2026');
    expect(older).toHaveTextContent('✓Found switched on');
    // Its age, its day and what was found: no empty paragraph for a note.
    expect(within(older).getAllByRole('paragraph')).toHaveLength(3);
    expect(observationsSection()).toHaveTextContent('Newest first.');
  });

  it('says nobody has checked, with the hint to look, when there are none', async () => {
    await renderRecordedCheck();

    expect(observationsSection()).toHaveTextContent('Never checked');
    expect(observationsSection()).toHaveTextContent(
      'Look at the check where it runs, then record whether you found it on or off.',
    );
    expect(
      within(observationsSection()).queryByRole('list'),
    ).not.toBeInTheDocument();
    expect(observationsSection()).not.toHaveTextContent('Newest first.');
  });

  it('holds an empty status line, ready to say when one is saved', async () => {
    await renderRecordedCheck();

    const line = within(observationsSection()).getByRole('status');
    expect(line).toBeEmptyDOMElement();
  });
});

describe('the test runs', () => {
  const runsSection = () => screen.getByRole('region', { name: 'Test runs' });

  const missedRun = aRun({
    id: 'r2',
    runOn: '2026-08-20',
    planted: 'An unused variable',
    expected: 'The job fails',
    outcome: 'MISSED',
  });

  const runs: Run[] = [
    aRun({
      id: 'r3',
      runOn: '2026-09-13',
      planted: 'A missing return type',
      note: 'Planted on a branch and deleted afterwards.',
    }),
    missedRun,
    aRun({ id: 'r1', runOn: '2026-07-06', planted: 'A wrong import path' }),
  ];

  it('lists the runs in the order the API sends them, newest first', async () => {
    await renderRecordedCheck({
      status: 'PROVEN',
      lastCaughtOn: '2026-09-13',
      runs,
    });

    const cards = within(runsSection()).getAllByRole('listitem');
    expect(
      cards.map(
        (card) => within(card).getAllByRole('definition')[0]?.textContent,
      ),
    ).toEqual([
      'A missing return type',
      'An unused variable',
      'A wrong import path',
    ]);
  });

  it('says when the last catch was', async () => {
    await renderRecordedCheck({
      status: 'PROVEN',
      lastCaughtOn: '2026-09-13',
      runs,
    });

    expect(runsSection()).toHaveTextContent(
      'Newest first. Last caught 2 days ago.',
    );
  });

  it('says so when no run has ever caught', async () => {
    await renderRecordedCheck({
      status: 'BROKEN',
      runs: [missedRun],
    });

    expect(runsSection()).toHaveTextContent(
      'Newest first. Never caught a defect.',
    );
  });

  it('starts the age of a run from today with a capital', async () => {
    await renderRecordedCheck({
      status: 'PROVEN',
      lastCaughtOn: '2026-09-15',
      runs: [aRun({ id: 'r4', runOn: '2026-09-15' })],
    });

    const [card] = within(runsSection()).getAllByRole('listitem');
    expect(card).toHaveTextContent('Today15 Sep 2026');
  });

  it('shows a caught run with its age, its day and its three rows', async () => {
    await renderRecordedCheck({
      status: 'PROVEN',
      lastCaughtOn: '2026-09-13',
      runs,
    });

    const [caught] = within(runsSection()).getAllByRole('listitem');
    if (caught === undefined) {
      throw new Error('No run card rendered.');
    }
    expect(caught).toHaveTextContent('2 days ago');
    expect(caught).toHaveTextContent('13 Sep 2026');
    expect(caught).toHaveTextContent('✓Caught');
    expect(
      within(caught)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual(['Planted', 'Expected', 'Observed']);
    expect(
      within(caught)
        .getAllByRole('definition')
        .map((row) => row.textContent),
    ).toEqual([
      'A missing return type',
      'The job fails and names the line',
      'Caught it',
    ]);
    expect(caught).toHaveTextContent(
      'Planted on a branch and deleted afterwards.',
    );
  });

  it('shows a missed run as missed, with no note when none was written', async () => {
    await renderRecordedCheck({
      status: 'PROVEN',
      lastCaughtOn: '2026-09-13',
      runs,
    });

    const missed = within(runsSection()).getAllByRole('listitem')[1];
    if (missed === undefined) {
      throw new Error('No second run card rendered.');
    }
    expect(missed).toHaveTextContent('26 days ago');
    expect(missed).toHaveTextContent('20 Aug 2026');
    expect(missed).toHaveTextContent('✕Missed');
    expect(
      within(missed)
        .getAllByRole('definition')
        .map((row) => row.textContent),
    ).toEqual(['An unused variable', 'The job fails', 'Missed it']);
    expect(within(missed).getAllByRole('paragraph')).toHaveLength(2);
  });

  it('says there are no runs yet, with the hint to plant one', async () => {
    await renderRecordedCheck({ status: 'UNPROVEN' });

    expect(runsSection()).toHaveTextContent('No runs yet');
    expect(runsSection()).toHaveTextContent(
      'Plant the defect this check exists to catch, then log what it did.',
    );
    expect(within(runsSection()).queryByRole('list')).not.toBeInTheDocument();
    expect(runsSection()).not.toHaveTextContent('Newest first.');
  });
});
