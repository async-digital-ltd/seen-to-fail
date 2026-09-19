import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { writeTemporaryLedger } from '../testing/ledger.ts';

/**
 * The adapter, judged the way a workflow judges it: by what it exits with and
 * by what is on disk afterwards.
 *
 * A workflow step does not read a message. It reads a status, and it commits or
 * it does not, so every assertion here is on the code and on the files rather
 * than on anything printed. A refusal that exited 0 would be committed, and a
 * refusal that left a file behind would be committed by the step after it.
 *
 * The reports below are the documents canfail 0.2.1 really produced against
 * this repository, measured on this branch: two plants against `pnpm typecheck`
 * scoring `catches` on a clean tree, and the same two scoring `look` on a tree
 * that was already red. Both of those runs exited 0, which is the trap #66
 * pinned and the reason nothing in the adapter reads an exit code.
 */

const scripts = fileURLToPath(new URL('.', import.meta.url));

const check = {
  id: 'ci-type-check',
  name: 'Type check',
  area: 'CI',
  protects: 'A type error reaching main.',
  howToTellArmed: 'The step appears in the run list.',
};

const declaration = {
  checks: [
    {
      name: 'Type check',
      checkId: 'ci-type-check',
      expected: 'The type check fails.',
      run: 'pnpm typecheck',
      breaks: [{ name: 'A plant.', file: 'a.ts', replace: 'a', with: 'b' }],
    },
  ],
};

/** What canfail printed on a clean tree, with both plants caught. */
const caughtBoth = {
  breaks: 2,
  catches: 2,
  findings: 0,
  look: 0,
  outcomes: [
    {
      break_name: 'STATUSES loses its as const, so Status widens to string.',
      check: 'Type check',
      detail:
        'broke packages/filter/src/types.ts, the check went red as declared',
      verdict: 'catches',
    },
    {
      break_name:
        'STALE_AFTER_DAYS is written as a string rather than a number.',
      check: 'Type check',
      detail:
        'broke packages/server/src/staleness.ts, the check went red as declared',
      verdict: 'catches',
    },
  ],
};

/**
 * The character canfail puts between the two halves of a detail sentence.
 *
 * Built from its code point rather than typed into the source. The fixture
 * below has to be canfail's words exactly, and a fixture that quietly said
 * something the tool never said would go on passing after the tool changed,
 * which is the shape of defect this repository exists to expose. Spelling the
 * character out here keeps the assertion faithful and keeps the source itself
 * in the punctuation this project writes in.
 */
const canfailDash = String.fromCodePoint(0x2014);

/** What canfail printed with the build already broken before the plant. */
const redBaselineReason = `the check already FAILS on the clean tree (exit 1: [ELIFECYCLE] Command failed with exit code 1.) ${canfailDash} breaking something can prove nothing from here`;

const redBaseline = {
  breaks: 1,
  catches: 0,
  findings: 0,
  look: 1,
  outcomes: [
    {
      break_name: 'STATUSES loses its as const, so Status widens to string.',
      check: 'Type check',
      detail: redBaselineReason,
      verdict: 'look',
    },
  ],
};

const commit = '31a56ad94b3dad9a5cb7ae285d734df2a8bd45eb';
const runUrl =
  'https://github.com/async-digital-ltd/seen-to-fail/actions/runs/35405970369';

/**
 * A ledger holding one check, with a report and a plant declaration beside it.
 *
 * The two input files sit at the root of the temporary ledger because the
 * loader reads the three record directories and nothing else, so a file beside
 * them is invisible to it.
 */
async function aLedgerWith(
  report: unknown,
  plants: unknown = declaration,
): Promise<string> {
  const directory = await writeTemporaryLedger({
    'checks/ci-type-check.json': check,
  });
  await writeFile(
    join(directory, 'report.json'),
    JSON.stringify(report),
    'utf8',
  );
  await writeFile(
    join(directory, 'canfail.json'),
    JSON.stringify(plants),
    'utf8',
  );
  return directory;
}

async function runAdapter(
  directory: string,
  extra: readonly string[] = [],
): Promise<number> {
  return exitCodeOf('record-replay.ts', [
    '--directory',
    directory,
    '--report',
    join(directory, 'report.json'),
    '--config',
    join(directory, 'canfail.json'),
    '--source-commit',
    commit,
    '--source-run-url',
    runUrl,
    ...extra,
  ]);
}

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

/** The runs in a ledger, or an empty list when none were ever written. */
async function runsIn(directory: string): Promise<string[]> {
  try {
    return await readdir(join(directory, 'runs'));
  } catch {
    return [];
  }
}

async function onlyRunIn(directory: string): Promise<Record<string, unknown>> {
  const files = await runsIn(directory);
  expect(files).toHaveLength(1);
  const [file] = files;
  if (file === undefined) {
    throw new Error('There is no run to read.');
  }
  return JSON.parse(
    await readFile(join(directory, 'runs', file), 'utf8'),
  ) as Record<string, unknown>;
}

describe('recording what a replay found', () => {
  it('records one run per declared break and exits 0', async () => {
    const directory = await aLedgerWith(caughtBoth);

    expect(await runAdapter(directory)).toBe(0);
    expect(await runsIn(directory)).toHaveLength(2);
  });

  it('records through the separator pnpm forwards, and exits 0', async () => {
    const directory = await aLedgerWith(redBaseline);

    expect(
      await exitCodeOf('record-replay.ts', [
        '--',
        '--directory',
        directory,
        '--report',
        join(directory, 'report.json'),
        '--config',
        join(directory, 'canfail.json'),
        '--source-commit',
        commit,
        '--source-run-url',
        runUrl,
      ]),
    ).toBe(0);
    expect(await runsIn(directory)).toHaveLength(1);
  });

  it('records a catch against the ledger id, carrying its source', async () => {
    const directory = await aLedgerWith({
      ...caughtBoth,
      breaks: 1,
      catches: 1,
      outcomes: [caughtBoth.outcomes[0]],
    });

    expect(await runAdapter(directory)).toBe(0);
    expect(await onlyRunIn(directory)).toMatchObject({
      checkId: 'ci-type-check',
      outcome: 'caught',
      expected: 'The type check fails.',
      planted: 'STATUSES loses its as const, so Status widens to string.',
      inconclusiveReason: null,
      source: 'replay',
      sourceCommit: commit,
      sourceRunUrl: runUrl,
    });
  });

  /**
   * The negative half of this story's own observation, as far as a suite can
   * reach it: a baseline that was already red scores `look`, which is
   * inconclusive with canfail's reason, and is not a caught row. The other
   * half of that observation is the workflow running in CI, which cannot
   * happen before this lands on the default branch.
   */
  it('records a red baseline as inconclusive with the reason verbatim, never as caught', async () => {
    const directory = await aLedgerWith(redBaseline);

    expect(await runAdapter(directory)).toBe(0);
    const run = await onlyRunIn(directory);
    expect(run).toMatchObject({
      outcome: 'inconclusive',
      inconclusiveReason: redBaselineReason,
      source: 'replay',
    });
    expect(run.outcome).not.toBe('caught');
  });
});

describe('what the adapter refuses', () => {
  /**
   * #67's own criterion, asserted the way it asks for: the exit code and the
   * absent file, never the printed message. Nothing at all is written,
   * including the outcome that WAS recognised, because a fifth verdict means
   * the mapping no longer describes the tool that produced either of them.
   */
  it('refuses an unrecognised verdict, exits 1, and leaves no file', async () => {
    const directory = await aLedgerWith({
      breaks: 2,
      catches: 1,
      findings: 0,
      look: 0,
      outcomes: [
        caughtBoth.outcomes[0],
        { ...caughtBoth.outcomes[1], verdict: 'flagrant' },
      ],
    });

    expect(await runAdapter(directory)).toBe(1);
    expect(await runsIn(directory)).toEqual([]);
  });

  /**
   * The report names the check `ci-type-check`, and the declaration declares
   * that check under the name `Type check`. So the name in the report is not a
   * declared name, and it IS the id of a check this ledger holds.
   *
   * That pairing is deliberate and the test is worth nothing without it. The
   * obvious version of this test names the check `Lint`, and it passes whether
   * or not the mapping refuses anything: `Lint` is not a legal ledger id, so an
   * adapter that fell back to using the report's name as the address would be
   * stopped by the id pattern instead, and the refusal being tested here would
   * never have been reached. Measured by planting that fallback and watching
   * this test pass with it in place.
   *
   * With the name below, a fallback produces a well formed id naming a check
   * that exists, so a run would be written and only this refusal can stop it.
   * It is also the realistic mistake: somebody renames a check in the plant
   * declaration to match its id, an adapter starts resolving by name, and every
   * check whose name happens to equal an id silently keeps working until one
   * does not. #71 ruled that a check is reached by its id and never by its name.
   */
  it('refuses a report naming a check the declaration does not declare, exits 1, and leaves no file', async () => {
    const directory = await aLedgerWith({
      ...caughtBoth,
      breaks: 1,
      catches: 1,
      outcomes: [{ ...caughtBoth.outcomes[0], check: 'ci-type-check' }],
    });

    expect(await runAdapter(directory)).toBe(1);
    expect(await runsIn(directory)).toEqual([]);
  });

  /**
   * An address that matches nothing is a refusal naming it, never a check
   * brought into being to receive the run (#71). The declaration here is
   * well formed and points at an id the ledger does not hold.
   */
  it('refuses a ledger id that matches no check, exits 1, and leaves no file', async () => {
    const directory = await aLedgerWith(caughtBoth, {
      checks: [{ ...declaration.checks[0], checkId: 'ci-lint' }],
    });

    expect(await runAdapter(directory)).toBe(1);
    expect(await runsIn(directory)).toEqual([]);
    expect(await readdir(join(directory, 'checks'))).toEqual([
      'ci-type-check.json',
    ]);
  });

  it('refuses a report that is not JSON, exits 1, and leaves no file', async () => {
    const directory = await aLedgerWith(caughtBoth);
    await writeFile(join(directory, 'report.json'), 'not json', 'utf8');

    expect(await runAdapter(directory)).toBe(1);
    expect(await runsIn(directory)).toEqual([]);
  });

  it('refuses a report with no outcomes, exits 1, and leaves no file', async () => {
    const directory = await aLedgerWith({
      breaks: 0,
      catches: 0,
      findings: 0,
      look: 0,
      outcomes: [],
    });

    expect(await runAdapter(directory)).toBe(1);
    expect(await runsIn(directory)).toEqual([]);
  });

  it('refuses an abbreviated commit rather than expanding it, and leaves no file', async () => {
    const directory = await aLedgerWith(redBaseline);

    expect(
      await exitCodeOf('record-replay.ts', [
        '--directory',
        directory,
        '--report',
        join(directory, 'report.json'),
        '--config',
        join(directory, 'canfail.json'),
        '--source-commit',
        '31a56ad',
        '--source-run-url',
        runUrl,
      ]),
    ).toBe(1);
    expect(await runsIn(directory)).toEqual([]);
  });

  it('refuses a run link that is not https, and leaves no file', async () => {
    const directory = await aLedgerWith(redBaseline);

    expect(
      await exitCodeOf('record-replay.ts', [
        '--directory',
        directory,
        '--report',
        join(directory, 'report.json'),
        '--config',
        join(directory, 'canfail.json'),
        '--source-commit',
        commit,
        '--source-run-url',
        'javascript:alert(1)',
      ]),
    ).toBe(1);
    expect(await runsIn(directory)).toEqual([]);
  });
});

describe('the same run recorded twice', () => {
  /**
   * The property #67 asks to be proved rather than assumed: a run's filename is
   * a digest of the record, so the same report replayed twice for one commit
   * writes the same paths with the same bytes. Proved by counting the files
   * after each pass, which is what "does not create two rows" means on disk,
   * and by reading the record back to show the second pass did not change it.
   *
   * A job that retries therefore records one run. Two genuinely different runs
   * still land separately, because a different run carries a different link and
   * a different link is a different record.
   */
  it('writes one file per outcome however many times it runs', async () => {
    const directory = await aLedgerWith(caughtBoth);

    expect(await runAdapter(directory)).toBe(0);
    const first = await runsIn(directory);
    expect(first).toHaveLength(2);
    const before = await readFile(
      join(directory, 'runs', first[0] ?? ''),
      'utf8',
    );

    expect(await runAdapter(directory)).toBe(0);
    const second = await runsIn(directory);
    expect(second).toHaveLength(2);
    expect(second).toEqual(first);
    expect(
      await readFile(join(directory, 'runs', first[0] ?? ''), 'utf8'),
    ).toBe(before);
  });

  it('records a second run separately when it came from a different run', async () => {
    const directory = await aLedgerWith(redBaseline);

    expect(await runAdapter(directory)).toBe(0);
    expect(await runsIn(directory)).toHaveLength(1);

    expect(
      await exitCodeOf('record-replay.ts', [
        '--directory',
        directory,
        '--report',
        join(directory, 'report.json'),
        '--config',
        join(directory, 'canfail.json'),
        '--source-commit',
        commit,
        '--source-run-url',
        'https://github.com/async-digital-ltd/seen-to-fail/actions/runs/2',
      ]),
    ).toBe(0);
    expect(await runsIn(directory)).toHaveLength(2);
  });
});

describe('a record that does not say where it came from', () => {
  /**
   * The assertion #64's comment asked this story to make, and it is the test
   * rather than the behaviour that is the point. Absence of a source reads as
   * `hand`, deliberately, so that the records written before sources existed
   * stay valid. The one path that could reach that default with a NEW record
   * is an adapter that posted a replay without setting the source, and the
   * result would be a replay filed as something a person typed in.
   *
   * Asserted against the recorder itself, with the evidence a replay carries
   * and no source beside it, because that is the record the adapter would
   * produce if it ever stopped setting one. The refusal is what stops it being
   * filed as a person's work, and it leaves nothing behind.
   */
  it('refuses a replay that omits its source rather than filing it as hand', async () => {
    const directory = await writeTemporaryLedger({
      'checks/ci-type-check.json': check,
    });

    expect(
      await exitCodeOf('record-run.ts', [
        '--directory',
        directory,
        '--check-id',
        'ci-type-check',
        '--run-on',
        '2026-09-18',
        '--planted',
        'A type error.',
        '--expected',
        'The type check fails.',
        '--outcome',
        'caught',
        '--source-commit',
        commit,
        '--source-run-url',
        runUrl,
      ]),
    ).toBe(1);
    expect(await runsIn(directory)).toEqual([]);
  });
});
