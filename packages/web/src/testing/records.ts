import type { CheckDetailQuery } from '../graphql/generated/graphql';

/**
 * A check as the check-detail query answers it, and a run on one, for every
 * web test that needs either.
 *
 * One factory each, taking overrides, so that when the query selects a new
 * field the field gets its default here, once, and every test that builds a
 * check or a run keeps compiling. Before, two tests built these inline and one
 * through a helper of its own, and each new field broke whichever unrelated
 * branch rebased next. It broke one object literal at a time, too: `tsc`
 * reported the inner run first and the outer check only once that was fixed,
 * so the first error looked like all of them (#93).
 */

export type RecordedCheck = NonNullable<CheckDetailQuery['check']>;
export type RecordedRun = RecordedCheck['runs'][number];

/**
 * A check nothing has been recorded against yet, which reads Unarmed. A test
 * names the check and overrides what it is about.
 */
export function aRecordedCheck(
  overrides: Partial<RecordedCheck> & Pick<RecordedCheck, 'id'>,
): RecordedCheck {
  return {
    name: 'Type check on every push',
    area: 'CI',
    protects: 'Code that no longer compiles reaching the main branch.',
    howToTellArmed: 'A type check job is listed on every pull request.',
    status: 'UNARMED',
    lastCaughtOn: null,
    lastSettledOn: null,
    runCount: 0,
    caughtCount: 0,
    missedCount: 0,
    inconclusiveCount: 0,
    runs: [],
    armingObservations: [],
    ...overrides,
  };
}

/** A run typed in by hand that caught its plant. */
export function aRun(
  overrides: Partial<RecordedRun> & Pick<RecordedRun, 'id' | 'runOn'>,
): RecordedRun {
  return {
    planted: 'A string passed where a number is expected',
    expected: 'The job fails and names the line',
    outcome: 'CAUGHT',
    inconclusiveReason: null,
    note: null,
    source: 'HAND',
    sourceCommit: null,
    sourceRunUrl: null,
    ...overrides,
  };
}

/** The same run, recorded by a replay rather than typed in. */
export function aReplayRun(
  overrides: Partial<RecordedRun> & Pick<RecordedRun, 'id' | 'runOn'>,
): RecordedRun {
  return aRun({
    source: 'REPLAY',
    sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    sourceRunUrl: 'https://ci.example.com/runs/91',
    ...overrides,
  });
}
