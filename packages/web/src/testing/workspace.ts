import {
  AreasDocument,
  CheckDetailDocument,
  CheckOptionsDocument,
  ChecksDocument,
  StatusCountsDocument,
} from '../graphql/generated/graphql';
import type { ListedCheck } from '../pages/checks/check-row';
import type { Answer } from './client';
import { answer } from './client';
import { aRecordedCheck, aRun } from './records';

/**
 * A workspace of two checks, for the tests that walk the whole app rather
 * than one screen: enough for the list to have rows, the run form a choice,
 * and a check's page a record to show. Every screen is given the answers it
 * asks for, so what a test reads on it is the screen and not the notice a
 * missing answer would put in its place (#47).
 */

export const lint = {
  id: 'ci-lint',
  name: 'Lint on every push',
  area: 'CI',
};

export const listed: readonly ListedCheck[] = [
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

export const recorded = aRecordedCheck({
  ...lint,
  protects: 'A file that no longer lints reaching the main branch.',
  howToTellArmed: 'The lint job is listed on every push.',
  status: 'PROVEN',
  lastCaughtOn: '2026-09-12',
  lastSettledOn: '2026-09-12',
  runCount: 1,
  caughtCount: 1,
  runs: [
    aRun({
      id: 'run-1',
      runOn: '2026-09-12',
      planted: 'An unused import.',
      expected: 'The push is refused.',
    }),
  ],
});

export const areas = answer(AreasDocument, { areas: ['CI', 'Git'] });

/** The list's answers for the workspace above. */
export const populated: readonly Answer[] = [
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

/** The list's answers for a workspace with nothing in it. */
export const empty: readonly Answer[] = [
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

/** The checks the run form offers. */
export const options = answer(CheckOptionsDocument, {
  checks: { checks: listed.map(({ id, name }) => ({ id, name })) },
});

/** The record of the first check, for its own page. */
export const detail = answer(CheckDetailDocument, { check: recorded });
