import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { writeTemporaryLedger } from '../testing/ledger.ts';

/**
 * The two scripts a recording workflow runs, judged the way the workflow judges
 * them: by what they exit with.
 *
 * A workflow step does not read a message. It reads a status, and it commits or
 * it does not. So these tests run the real scripts as real processes and assert
 * on the code, which is the thing that actually decides whether a malformed
 * record becomes a commit. Asserting on the wording instead would pass a script
 * that printed a refusal and exited 0, which is the failure that matters.
 */

const scripts = fileURLToPath(new URL('.', import.meta.url));

const check = {
  id: 'ci-lint',
  name: 'Lint',
  area: 'CI',
  protects: 'A lint rule being broken on main.',
  howToTellArmed: 'The step appears in the run list.',
};

const soundRun = {
  checkId: 'ci-lint',
  runOn: '2026-09-18',
  planted: 'A rule violation.',
  expected: 'The lint step fails.',
  outcome: 'caught',
};

/**
 * Runs a script as its own process and answers with the code it exited on.
 *
 * A process rather than an import, because a script that sets `process.exitCode`
 * and one that does not look identical from inside the same process. What is
 * being tested is the number the workflow reads.
 */
async function exitCodeOf(
  script: string,
  args: readonly string[],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(scripts, script), ...args], {
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === null) {
        reject(new Error(`${script} was killed rather than exiting.`));
        return;
      }
      resolve(code);
    });
  });
}

it('validates a sound ledger and exits 0', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'runs/one.json': soundRun,
  });

  expect(
    await exitCodeOf('validate-ledger.ts', ['--directory', directory]),
  ).toBe(0);
});

/**
 * The documented form, `pnpm ledger:validate -- --directory <path>`, reaches
 * the script with the separator still on the front. A script that read it as
 * a positional would refuse its own flag, which is what the build script did
 * (#97). Run through the real process so the wiring is what is tested, not the
 * helper alone.
 */
it('validates a sound ledger through the separator pnpm forwards, and exits 0', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'runs/one.json': soundRun,
  });

  expect(
    await exitCodeOf('validate-ledger.ts', ['--', '--directory', directory]),
  ).toBe(0);
});

it('records a sound run through the separator pnpm forwards, and exits 0', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  expect(
    await exitCodeOf('record-run.ts', [
      '--',
      '--directory',
      directory,
      '--check-id',
      'ci-lint',
      '--run-on',
      '2026-09-18',
      '--planted',
      'A rule violation.',
      '--expected',
      'The lint step fails.',
      '--outcome',
      'caught',
    ]),
  ).toBe(0);
  expect(await readdir(join(directory, 'runs'))).toHaveLength(1);
});

it('refuses a malformed record and exits 1', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'runs/one.json': { ...soundRun, outcome: 'passed' },
  });

  expect(
    await exitCodeOf('validate-ledger.ts', ['--directory', directory]),
  ).toBe(1);
});

it('refuses a run against a check that is not in the ledger, and exits 1', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'runs/one.json': { ...soundRun, checkId: 'ci-test' },
  });

  expect(
    await exitCodeOf('validate-ledger.ts', ['--directory', directory]),
  ).toBe(1);
});

/**
 * A check's name is a label and its id is its address, so a rename is an
 * ordinary edit to the check's file. What a rename cannot do is take a name
 * another check already holds: the app keeps names unique, and the build
 * would refuse the pair by constraint after both files had been committed. So
 * the validator refuses it first, and the workflow reads that as a failed
 * step rather than as a record to commit.
 */
it('refuses two checks with the same name and exits 1', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'checks/ci-lint-again.json': { ...check, id: 'ci-lint-again' },
  });

  expect(
    await exitCodeOf('validate-ledger.ts', ['--directory', directory]),
  ).toBe(1);
});

/**
 * A run logged against a check identified by nothing but its id, which is what
 * a person writes in a file and what a workflow input quotes. No uuid appears
 * anywhere in the call.
 */
it('records a sound run and exits 0', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  expect(
    await exitCodeOf('record-run.ts', [
      '--directory',
      directory,
      '--check-id',
      'ci-lint',
      '--run-on',
      '2026-09-18',
      '--planted',
      'A rule violation.',
      '--expected',
      'The lint step fails.',
      '--outcome',
      'caught',
    ]),
  ).toBe(0);
  expect(await readdir(join(directory, 'runs'))).toHaveLength(1);
});

/**
 * An address that matches nothing is refused, and nothing is brought into
 * being to receive the run. Judged by the exit code, which is what the job
 * reads, and by what is on disk afterwards: no run, and the same one check
 * file there was before. A recorder that answered a misspelled id by creating
 * the check would publish a status nobody recorded, which is the exact
 * failure this product exists to expose.
 */
it('refuses a run against a check that is not in the ledger, exits 1, and leaves no file', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  expect(
    await exitCodeOf('record-run.ts', [
      '--directory',
      directory,
      '--check-id',
      'ci-test',
      '--run-on',
      '2026-09-18',
      '--planted',
      'A rule violation.',
      '--expected',
      'The lint step fails.',
      '--outcome',
      'caught',
    ]),
  ).toBe(1);
  await expect(readdir(join(directory, 'runs'))).rejects.toThrow();
  expect(await readdir(join(directory, 'checks'))).toEqual(['ci-lint.json']);
});

/**
 * The route a replay takes when its plant would not apply, which is the case
 * the third outcome exists for and the one a job will be taking from #67. The
 * flag has to reach the reader, so this runs the real script rather than
 * calling the reader directly: a flag the script never forwards would leave a
 * refusal here rather than a record with no reason in it.
 */
it('records a run that settled nothing, with its reason, and exits 0', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  expect(
    await exitCodeOf('record-run.ts', [
      '--directory',
      directory,
      '--check-id',
      'ci-lint',
      '--run-on',
      '2026-09-18',
      '--planted',
      'A rule violation.',
      '--expected',
      'The lint step fails.',
      '--outcome',
      'inconclusive',
      '--inconclusive-reason',
      'The anchor matches 0 times and has to match exactly once.',
    ]),
  ).toBe(0);
  expect(await readdir(join(directory, 'runs'))).toHaveLength(1);
});

it('refuses a run that settled nothing with no reason, exits 1, and leaves no file', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  expect(
    await exitCodeOf('record-run.ts', [
      '--directory',
      directory,
      '--check-id',
      'ci-lint',
      '--run-on',
      '2026-09-18',
      '--planted',
      'A rule violation.',
      '--expected',
      'The lint step fails.',
      '--outcome',
      'inconclusive',
    ]),
  ).toBe(1);
  await expect(readdir(join(directory, 'runs'))).rejects.toThrow();
});

/**
 * The gate the workflow relies on: the record never becomes a file, so the
 * commit step has nothing to commit and the job stops before it.
 */
it('refuses a malformed run, exits 1, and leaves no file behind', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  expect(
    await exitCodeOf('record-run.ts', [
      '--directory',
      directory,
      '--check-id',
      'ci-lint',
      '--run-on',
      '2026-09-18',
      '--planted',
      'A rule violation.',
      '--expected',
      'The lint step fails.',
      '--outcome',
      'passed',
    ]),
  ).toBe(1);
  await expect(readdir(join(directory, 'runs'))).rejects.toThrow();
});

it('refuses a run with a field missing, rather than filling it in', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  expect(
    await exitCodeOf('record-run.ts', [
      '--directory',
      directory,
      '--check-id',
      'ci-lint',
      '--run-on',
      '2026-09-18',
      '--expected',
      'The lint step fails.',
      '--outcome',
      'caught',
    ]),
  ).toBe(1);
});
