import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { writeTemporaryLedger } from '../testing/ledger.ts';
import { recordRun, runFilename } from './record.ts';
import type { RecordResult } from './record.ts';

/**
 * Adding a run, which is the step a job runs before it commits anything.
 *
 * The property that matters most is what happens when the record is wrong:
 * nothing is written. A record that reaches the working tree and is refused
 * afterwards is a record somebody has to remember to take out again, and a
 * workflow that does not remember commits it.
 */

const today = '2026-09-18';

const check = {
  id: 'ci-lint',
  name: 'Lint',
  area: 'CI',
  protects: 'A lint rule being broken on main.',
  howToTellArmed: 'The step appears in the run list.',
};

const run = {
  checkId: 'ci-lint',
  runOn: '2026-09-18',
  planted: 'A rule violation.',
  expected: 'The lint step fails.',
  outcome: 'caught',
};

async function ledgerWithACheck(): Promise<string> {
  return writeTemporaryLedger({ 'checks/ci-lint.json': check });
}

async function record(
  directory: string,
  input: unknown,
): Promise<RecordResult> {
  return recordRun({ directory, input, today });
}

/** Every run file in the ledger, by name. */
async function runFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(join(directory, 'runs'))).sort();
  } catch {
    return [];
  }
}

it('writes the run it was given', async () => {
  const directory = await ledgerWithACheck();
  const result = await record(directory, run);

  expect(result.ok && result.created).toBe(true);
  expect(await runFiles(directory)).toHaveLength(1);
});

it('writes a record the loader will read back', async () => {
  const directory = await ledgerWithACheck();
  const result = await record(directory, { ...run, note: 'Seen twice.' });
  if (!result.ok) {
    throw new Error('The run was refused.');
  }

  const written: unknown = JSON.parse(
    await readFile(join(directory, result.file), 'utf8'),
  );
  // The record is written as the reader parsed it, not as it was handed over,
  // so the source the reader filled in for a run that did not say is in the
  // file. A record that dropped it on the way to disk would be published with
  // nothing saying where it came from.
  expect(written).toEqual({
    ...run,
    note: 'Seen twice.',
    source: 'hand',
    sourceCommit: null,
    sourceRunUrl: null,
  });
});

/**
 * A replay records the two things that let a reader check it, and they reach
 * the file unchanged.
 */
it('writes a replay with the commit and the run it names', async () => {
  const directory = await ledgerWithACheck();
  const result = await record(directory, {
    ...run,
    source: 'replay',
    sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    sourceRunUrl: 'https://ci.example.com/runs/91',
  });
  if (!result.ok) {
    throw new Error('The replay was refused.');
  }

  const written: unknown = JSON.parse(
    await readFile(join(directory, result.file), 'utf8'),
  );
  expect(written).toEqual({
    ...run,
    note: null,
    source: 'replay',
    sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    sourceRunUrl: 'https://ci.example.com/runs/91',
  });
});

/**
 * The gate the recording workflow leans on: a replay that lost half its
 * evidence never becomes a file, so it never becomes a commit.
 */
it('refuses a replay with no commit and writes nothing', async () => {
  const directory = await ledgerWithACheck();
  const result = await record(directory, {
    ...run,
    source: 'replay',
    sourceRunUrl: 'https://ci.example.com/runs/91',
  });

  expect(result.ok ? [] : result.errors.map((issue) => issue.path)).toEqual([
    'sourceCommit',
  ]);
  expect(await runFiles(directory)).toEqual([]);
});

/**
 * Two jobs finishing at the same moment write two paths, so there is nothing to
 * merge. The names differ because the digest does, and the digest is of the
 * whole record.
 */
it('gives two different runs two different files', async () => {
  const directory = await ledgerWithACheck();
  await record(directory, run);
  await record(directory, { ...run, outcome: 'missed' });

  expect(await runFiles(directory)).toHaveLength(2);
});

/**
 * A job that retries records one run rather than two, because the same record
 * always names the same file.
 */
it('records the same run once, however many times it is told', async () => {
  const directory = await ledgerWithACheck();
  const first = await record(directory, run);
  const second = await record(directory, run);

  expect(second.ok && second.created).toBe(false);
  expect(first.ok && second.ok && first.file).toBe(
    second.ok ? second.file : '',
  );
  expect(await runFiles(directory)).toHaveLength(1);
});

/**
 * The filename is a function of the record and not of the order its fields were
 * built in, so a caller that assembles the same run differently still writes one
 * file.
 */
it('names a file for what is in it, not for how it was built', () => {
  const forwards = {
    checkId: 'ci-lint',
    runOn: '2026-09-18',
    planted: 'A rule violation.',
    expected: 'The lint step fails.',
    outcome: 'caught',
    note: null,
    source: 'hand',
    sourceCommit: null,
    sourceRunUrl: null,
  } as const;
  const backwards = {
    sourceRunUrl: null,
    sourceCommit: null,
    source: 'hand',
    note: null,
    outcome: 'caught',
    expected: 'The lint step fails.',
    planted: 'A rule violation.',
    runOn: '2026-09-18',
    checkId: 'ci-lint',
  } as const;

  expect(runFilename(forwards)).toBe(runFilename(backwards));
});

it('refuses a malformed run and writes nothing', async () => {
  const directory = await ledgerWithACheck();
  const result = await record(directory, { ...run, outcome: 'passed' });

  expect(result.ok).toBe(false);
  expect(await runFiles(directory)).toEqual([]);
});

it('refuses a run against a check nobody has written down', async () => {
  const directory = await ledgerWithACheck();
  const result = await record(directory, { ...run, checkId: 'ci-test' });

  expect(result.ok ? [] : result.errors.map((issue) => issue.path)).toEqual([
    'checkId',
  ]);
  expect(await runFiles(directory)).toEqual([]);
});

/**
 * Adding a record to a ledger already known to be wrong buries the first fault
 * under a second one, and the job that did it looks like the one that broke it.
 */
it('refuses to add to a ledger that does not load', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'runs/broken.json': '{ not json',
  });

  await expect(record(directory, run)).rejects.toThrow(/sound/);
});
