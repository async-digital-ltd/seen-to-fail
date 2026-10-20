import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LANDING_GRACE_DAYS,
  judgeRecordedBranches,
  parseKeptOffMain,
} from './waiting.ts';
import type { KeptOffMain, RecordedBranch } from './waiting.ts';

/**
 * The rules for a recorded branch left waiting (#122), without a repository.
 * What git says about a real one is pinned by the exit-code tests beside the
 * script; these pin what is done with it.
 */

const now = new Date('2026-10-20T12:00:00Z');
const day = 24 * 60 * 60 * 1000;

function aBranch(
  overrides: Partial<RecordedBranch> & { readonly daysOld?: number },
): RecordedBranch {
  const { daysOld = 0, ...rest } = overrides;
  return {
    branch: 'replay/1',
    head: 'a'.repeat(40),
    committedAt: new Date(now.getTime() - daysOld * day),
    ledgerPaths: ['ledger/runs/one.json'],
    unlandedPaths: ['ledger/runs/one.json'],
    ...rest,
  };
}

function anEntry(overrides: Partial<KeptOffMain> = {}): KeptOffMain {
  return {
    branch: 'replay/1',
    head: 'a'.repeat(40),
    issue: 67,
    reason: 'A control.',
    ...overrides,
  };
}

describe('a recorded branch', () => {
  it('waits inside the grace without needing a person', () => {
    const report = judgeRecordedBranches(
      [aBranch({ daysOld: LANDING_GRACE_DAYS })],
      [],
      now,
    );
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'waiting',
    ]);
    expect(report.needsAPerson).toBe(false);
  });

  it('is overdue the day after the grace ends', () => {
    const report = judgeRecordedBranches(
      [aBranch({ daysOld: LANDING_GRACE_DAYS + 1 })],
      [],
      now,
    );
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'overdue',
    ]);
    expect(report.needsAPerson).toBe(true);
  });

  it('is landed when main holds every ledger file it changed, however old', () => {
    const report = judgeRecordedBranches(
      [aBranch({ daysOld: 90, unlandedPaths: [] })],
      [],
      now,
    );
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'landed',
    ]);
    expect(report.needsAPerson).toBe(false);
  });

  it('carries no record when it changed nothing under the ledger', () => {
    const report = judgeRecordedBranches(
      [aBranch({ daysOld: 90, ledgerPaths: [], unlandedPaths: [] })],
      [],
      now,
    );
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'no-record',
    ]);
    expect(report.needsAPerson).toBe(false);
  });
});

describe('a branch kept off main', () => {
  it('passes while the entry names its head and it is still unlanded', () => {
    const report = judgeRecordedBranches(
      [aBranch({ daysOld: 90 })],
      [anEntry()],
      now,
    );
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'kept-off-main',
    ]);
    expect(report.staleExclusions).toStrictEqual([]);
    expect(report.needsAPerson).toBe(false);
  });

  it('turns stale when the branch is deleted', () => {
    const report = judgeRecordedBranches([], [anEntry()], now);
    expect(report.staleExclusions.map((stale) => stale.why)).toStrictEqual([
      'gone',
    ]);
    expect(report.needsAPerson).toBe(true);
  });

  it('turns stale when the branch lands', () => {
    const report = judgeRecordedBranches(
      [aBranch({ daysOld: 90, unlandedPaths: [] })],
      [anEntry()],
      now,
    );
    expect(report.staleExclusions.map((stale) => stale.why)).toStrictEqual([
      'landed',
    ]);
    expect(report.needsAPerson).toBe(true);
  });

  it('stops covering a branch that moved, which is then judged on its own', () => {
    const report = judgeRecordedBranches(
      [aBranch({ daysOld: 90, head: 'b'.repeat(40) })],
      [anEntry()],
      now,
    );
    expect(report.staleExclusions.map((stale) => stale.why)).toStrictEqual([
      'moved',
    ]);
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'overdue',
    ]);
  });
});

describe('the kept-off file', () => {
  it('reads the one this repository holds', async () => {
    const text = await readFile(
      fileURLToPath(
        new URL('../../../../.github/kept-off-main.json', import.meta.url),
      ),
      'utf8',
    );
    expect(parseKeptOffMain(JSON.parse(text) as unknown).ok).toBe(true);
  });

  it.each([
    ['an entry with no reason', { ...anEntry(), reason: '  ' }],
    ['a short head', { ...anEntry(), head: 'b3e67e5' }],
    ['a branch outside the recorded lanes', anEntry({ branch: 'main' })],
    ['an unknown field', { ...anEntry(), note: 'x' }],
  ])('refuses %s', (_, entry) => {
    expect(parseKeptOffMain({ keptOffMain: [entry] }).ok).toBe(false);
  });

  it('refuses a branch listed twice', () => {
    expect(parseKeptOffMain({ keptOffMain: [anEntry(), anEntry()] }).ok).toBe(
      false,
    );
  });
});

/**
 * The grace against the two schedules, read off their own crons.
 *
 * The grace exists so that a branch is flagged before the next weekly replay
 * covers the same range again. That is a propagation pair across YAML and
 * TypeScript, so it is asserted rather than argued: the first day a branch can
 * read overdue, plus one daily run that GitHub drops, plus the run that then
 * fires, has to fall inside one replay cadence.
 */
async function cronOf(workflow: string): Promise<string> {
  const text = await readFile(
    fileURLToPath(
      new URL(`../../../../.github/workflows/${workflow}`, import.meta.url),
    ),
    'utf8',
  );
  const crons = [...text.matchAll(/^\s*- cron: '([^']+)'$/gmu)].map(
    (match) => match[1],
  );
  expect(crons).toHaveLength(1);
  return crons[0] ?? '';
}

it('flags a waiting branch before the next weekly replay', async () => {
  // minute, hour, day of month, month, day of week.
  expect(await cronOf('replay.yml')).toMatch(/^\S+ \S+ \* \* [0-6]$/u);
  expect(await cronOf('waiting-branches.yml')).toMatch(/^\S+ \S+ \* \* \*$/u);
  const replayCadence = 7;
  const checkCadence = 1;

  expect(LANDING_GRACE_DAYS + 1 + 2 * checkCadence).toBeLessThan(replayCadence);
});
