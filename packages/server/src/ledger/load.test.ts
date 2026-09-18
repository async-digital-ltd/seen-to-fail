import { expect, it } from 'vitest';

import { writeTemporaryLedger } from '../testing/ledger.ts';
import { loadLedger } from './load.ts';
import type { LoadResult } from './load.ts';

/**
 * Reading a directory of records, and the rules that only exist once more than
 * one file is in view.
 *
 * Every test writes a real ledger to a real directory, because half of what is
 * being tested is about files: a filename that does not match what is in it, a
 * file that is not JSON at all, a directory that is not there. None of that can
 * be exercised against an object in memory.
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
  runOn: '2026-09-17',
  planted: 'A rule violation.',
  expected: 'The lint step fails.',
  outcome: 'caught',
};

async function load(
  files: Readonly<Record<string, unknown>>,
): Promise<LoadResult> {
  return loadLedger({ directory: await writeTemporaryLedger(files), today });
}

/** Every message, as one string, for a test that cares which rule fired. */
function said(result: LoadResult): string {
  return result.ok
    ? ''
    : result.issues
        .map((issue) => `${issue.file} ${issue.path} ${issue.message}`)
        .join('\n');
}

it('reads a ledger that is sound', async () => {
  const result = await load({
    'checks/ci-lint.json': check,
    'runs/one.json': run,
    'observations/one.json': {
      checkId: 'ci-lint',
      observedOn: '2026-09-17',
      armed: true,
    },
  });

  expect(result.ok && result.contents.checks.length).toBe(1);
  expect(result.ok && result.contents.runs.length).toBe(1);
  expect(result.ok && result.contents.observations.length).toBe(1);
});

/**
 * An empty ledger is a true state of the world: nothing has been recorded yet.
 * It is not the same as a ledger that could not be read, and the difference
 * matters because the second one publishes a page saying nothing is recorded.
 */
it('reads an empty ledger as empty rather than as broken', async () => {
  const result = await load({});
  expect(result.ok && result.contents.runs).toEqual([]);
});

it('says where a record is when it refuses one', async () => {
  const result = await load({
    'checks/ci-lint.json': check,
    'runs/one.json': { ...run, outcome: 'passed' },
  });
  expect(said(result)).toContain('runs/one.json outcome');
});

/**
 * The name of a check's file is how a person finds it, and a file whose name
 * and id disagree is a check that is impossible to find twice.
 */
it('refuses a check whose file is not named after its id', async () => {
  const result = await load({ 'checks/lint.json': check });
  expect(said(result)).toContain('checks/ci-lint.json');
});

it('refuses two checks with the same id', async () => {
  const result = await load({
    'checks/ci-lint.json': check,
    'checks/ci-lint.json.json': { ...check, id: 'ci-lint' },
  });
  expect(said(result)).toContain('already has this id');
});

/**
 * A run against a check nobody wrote down would otherwise be committed, and
 * then refused by a foreign key when the build inserted it, which is after the
 * record is in the history.
 */
it('refuses a run against a check that is not in the ledger', async () => {
  const result = await load({
    'checks/ci-lint.json': check,
    'runs/one.json': { ...run, checkId: 'ci-test' },
  });
  expect(said(result)).toContain(
    'There is no check in the ledger with this id',
  );
});

it('refuses an observation against a check that is not in the ledger', async () => {
  const result = await load({
    'observations/one.json': {
      checkId: 'ci-test',
      observedOn: '2026-09-17',
      armed: true,
    },
  });
  expect(said(result)).toContain(
    'There is no check in the ledger with this id',
  );
});

it('refuses a file that is not JSON', async () => {
  const result = await load({
    'checks/ci-lint.json': check,
    'runs/one.json': '{ this is not json',
  });
  expect(said(result)).toContain('not valid JSON');
});

/**
 * A file the loader skips is a record that is in the repository and not in the
 * ledger, which reads as "nobody recorded that" to everybody who looks.
 */
it('refuses a file that is not a .json file at all', async () => {
  const result = await load({
    'checks/ci-lint.json': check,
    'runs/notes.txt': 'a run, written in prose',
  });
  expect(said(result)).toContain('.json');
});

it('refuses a directory nested inside a record directory', async () => {
  const result = await load({
    'checks/ci-lint.json': check,
    'runs/september/one.json': run,
  });
  expect(said(result)).toContain('Only files belong');
});

/**
 * Everything wrong at once, because a job about to commit wants the whole list
 * rather than one fault per attempt.
 */
it('reports every problem rather than the first', async () => {
  const result = await load({
    'checks/ci-lint.json': check,
    'runs/one.json': { ...run, outcome: 'passed' },
    'runs/two.json': { ...run, runOn: '2099-01-01' },
  });
  expect(result.ok ? [] : result.issues).toHaveLength(2);
});
