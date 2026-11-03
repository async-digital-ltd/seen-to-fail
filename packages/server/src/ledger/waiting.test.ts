import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { recordDirectories } from './load.ts';
import {
  LANDING_GRACE_DAYS,
  describeWaitingAnnotations,
  describeWaitingReport,
  isRecordPath,
  judgeRecordedBranches,
  landCommand,
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

/**
 * Only records decide whether a branch has landed (#287). A replay branch
 * pushed before #272 carries the generated counts #272 took out of
 * `ledger/README.md`, so that file can never match `main` again however the
 * records landed.
 */
describe('a file under the ledger that is not a record', () => {
  it('leaves a branch landed when it is the only thing main does not hold', () => {
    const report = judgeRecordedBranches(
      [
        aBranch({
          daysOld: 90,
          ledgerPaths: ['ledger/README.md', 'ledger/runs/one.json'],
          unlandedPaths: ['ledger/README.md'],
        }),
      ],
      [],
      now,
    );
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'landed',
    ]);
    expect(report.needsAPerson).toBe(false);
  });

  it('leaves a branch overdue, counting only its records, when a record is unlanded beside it', () => {
    const report = judgeRecordedBranches(
      [
        aBranch({
          daysOld: LANDING_GRACE_DAYS + 1,
          ledgerPaths: ['ledger/README.md', 'ledger/runs/one.json'],
          unlandedPaths: ['ledger/README.md', 'ledger/runs/one.json'],
        }),
      ],
      [],
      now,
    );
    expect(
      report.verdicts.map((verdict) =>
        verdict.kind === 'overdue' ? verdict.unlandedRecords : verdict.kind,
      ),
    ).toStrictEqual([['ledger/runs/one.json']]);
    expect(report.needsAPerson).toBe(true);
  });

  it('leaves a branch waiting inside the grace when a record is unlanded beside it', () => {
    const report = judgeRecordedBranches(
      [
        aBranch({
          daysOld: 1,
          ledgerPaths: ['ledger/README.md', 'ledger/runs/one.json'],
          unlandedPaths: ['ledger/README.md', 'ledger/runs/one.json'],
        }),
      ],
      [],
      now,
    );
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'waiting',
    ]);
    expect(report.needsAPerson).toBe(false);
  });

  it('is not a record to carry when it is all a branch changed', () => {
    const report = judgeRecordedBranches(
      [
        aBranch({
          daysOld: 90,
          ledgerPaths: ['ledger/README.md'],
          unlandedPaths: ['ledger/README.md'],
        }),
      ],
      [],
      now,
    );
    expect(report.verdicts.map((verdict) => verdict.kind)).toStrictEqual([
      'no-record',
    ]);
    expect(report.needsAPerson).toBe(false);
  });

  it('does not keep an exclusion covering once every record has landed', () => {
    const report = judgeRecordedBranches(
      [
        aBranch({
          daysOld: 90,
          ledgerPaths: ['ledger/README.md', 'ledger/runs/one.json'],
          unlandedPaths: ['ledger/README.md'],
        }),
      ],
      [anEntry()],
      now,
    );
    expect(report.staleExclusions.map((stale) => stale.why)).toStrictEqual([
      'landed',
    ]);
  });

  it.each(recordDirectories)(
    'leaves every file in ledger/%s/ a record',
    (directory) => {
      expect(isRecordPath(`ledger/${directory}/x.json`)).toBe(true);
      expect(isRecordPath(`ledger/${directory}/notes.txt`)).toBe(true);
    },
  );

  it.each([
    'ledger/README.md',
    'ledger/other/x.json',
    'ledger/runs.json',
    'ledger/runsx/x.json',
    'docs/tests.md',
  ])('does not read %s as a record', (path) => {
    expect(isRecordPath(path)).toBe(false);
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

/**
 * What a reader who never opens the run is told (#287). The annotations are
 * one line each and name what to do, and the command they give is run here
 * under a stand-in `gh`, so its quoting is held rather than read.
 */
describe('the annotations', () => {
  const head = 'c'.repeat(40);

  it('give one line per overdue branch and per stale entry, and none otherwise', () => {
    const report = judgeRecordedBranches(
      [
        aBranch({ branch: 'replay/1', daysOld: LANDING_GRACE_DAYS + 2, head }),
        aBranch({ branch: 'replay/2', daysOld: 0 }),
        aBranch({ branch: 'replay/3', daysOld: 90, unlandedPaths: [] }),
      ],
      [anEntry({ branch: 'record/9' })],
      now,
    );
    const annotations = describeWaitingAnnotations(
      report,
      '.github/kept-off-main.json',
    );
    expect(annotations).toHaveLength(2);
    for (const annotation of annotations) {
      expect(annotation).toMatch(/^::error title=[^:\n]+::[^\n]+$/u);
    }
    const [overdue = '', stale = ''] = annotations;
    expect(overdue).toContain('title=replay/1 is overdue::');
    expect(overdue).toContain(landCommand('replay/1'));
    expect(overdue).toContain(`"head": "${head}"`);
    expect(overdue).toContain('.github/kept-off-main.json');
    expect(stale).toContain('record/9');
    expect(stale).toContain('is no longer on the remote');
  });

  it('give nothing when nothing needs a person', () => {
    const report = judgeRecordedBranches(
      [
        aBranch({ daysOld: 0 }),
        aBranch({ branch: 'replay/2', daysOld: 90, unlandedPaths: [] }),
      ],
      [],
      now,
    );
    expect(report.needsAPerson).toBe(false);
    expect(describeWaitingAnnotations(report, 'kept.json')).toStrictEqual([]);
  });

  it('escape a title so its commas and colons cannot end it early', () => {
    const report = judgeRecordedBranches(
      [],
      [anEntry({ branch: 'replay/a,b:c' })],
      now,
    );
    expect(describeWaitingAnnotations(report, 'kept.json')).toStrictEqual([
      '::error title=replay/a%2Cb%3Ac in kept.json is stale::The entry for replay/a,b:c in kept.json is no longer on the remote. Remove or update the entry.',
    ]);
  });

  it('give the same land command the run summary does', () => {
    const report = judgeRecordedBranches(
      [aBranch({ daysOld: LANDING_GRACE_DAYS + 2 })],
      [],
      now,
    );
    expect(describeWaitingReport(report, 'kept.json')).toContain(
      landCommand('replay/1'),
    );
  });

  async function runUnderAStandInGh(command: string) {
    const bin = await mkdtemp(join(tmpdir(), 'waiting-gh-'));
    try {
      const gh = join(bin, 'gh');
      await writeFile(gh, '#!/bin/sh\nprintf \'%s\\n\' "$@"\n');
      await chmod(gh, 0o755);
      return await promisify(execFile)('bash', ['-c', command], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
      }).then(
        ({ stdout }) => ({ code: 0, stdout }),
        (error: unknown) => ({
          code:
            typeof error === 'object' && error !== null && 'code' in error
              ? Number(error.code)
              : -1,
          stdout:
            typeof error === 'object' && error !== null && 'stdout' in error
              ? String(error.stdout)
              : '',
        }),
      );
    } finally {
      await rm(bin, { recursive: true, force: true });
    }
  }

  it('give a land command that refuses to run until a ticket is set', async () => {
    const result = await runUnderAStandInGh(landCommand('replay/1'));
    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe('');
  });

  it('give a land command that opens the pull request once a ticket is set', async () => {
    const command = landCommand('replay/1');
    expect(command.startsWith('TICKET=; ')).toBe(true);
    const result = await runUnderAStandInGh(
      command.replace('TICKET=; ', 'TICKET=287; '),
    );
    expect(result.code).toBe(0);
    expect(result.stdout.split('\n')).toStrictEqual([
      'pr',
      'create',
      '--base',
      'main',
      '--head',
      'replay/1',
      '--title',
      'Land replay/1 (#287)',
      '--body',
      'Lands the records on replay/1.',
      '',
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
