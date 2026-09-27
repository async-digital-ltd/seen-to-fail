import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { outcomeSettlesSomething } from '../database/rows.ts';
import type { IsoDate, TestRunOutcome } from '../database/rows.ts';
import { todayInUtc } from '../day.ts';
import { REPLAY_AFTER_DAYS } from '../staleness.ts';

/**
 * Choosing which checks to replay, judged the way the workflow judges it: by
 * what it exits with and by what is on disk afterwards.
 *
 * The workflow reads a status to decide whether to install the replay tool at
 * all, so a status is what these tests assert. Nothing here reads a printed
 * message.
 *
 * Every case runs against a real git repository made for the test, because the
 * question the script answers is a git question: what has changed since the
 * commit a check was last replayed against. A fixture that handed it a list of
 * paths would test the matcher, which has its own tests in the replay package,
 * and would leave the part that can silently answer "everything changed"
 * untested.
 */

const scripts = fileURLToPath(new URL('.', import.meta.url));
const run = promisify(execFile);

/** What the script exits with when no check is due. */
const nothingIsDue = 3;

/**
 * git, told to read no configuration but the repository's own.
 *
 * Without this, these tests answer a question about the machine they run on
 * rather than about the script. A global `core.hooksPath` runs somebody's hooks
 * inside the fixture, a global `commit.gpgsign` asks for a key that is not
 * there, and a global `init.defaultBranch` decides what the first branch is
 * called. Measured on 19 September 2026: a global pre-commit hook refusing
 * commits on a branch named `main` failed every fixture here at its second
 * commit, and the failure was about the machine.
 */
async function git(
  directory: string,
  ...args: readonly string[]
): Promise<string> {
  const { stdout } = await run('git', ['-C', directory, ...args], {
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  });
  return stdout;
}

/** A declaration with two checks in it, each depending on its own workflow. */
const declaration = {
  checks: [
    {
      name: 'Type check',
      checkId: 'ci-type-check',
      dependsOn: ['.github/workflows/ci.yml', 'packages'],
      expected: 'The type check fails.',
      run: 'pnpm typecheck',
      breaks: [
        {
          name: 'A plant.',
          file: 'packages/a.ts',
          replace: 'a',
          with: 'b',
        },
      ],
    },
    {
      name: 'Record a run',
      checkId: 'ledger-record-validation',
      dependsOn: ['.github/workflows/record-run.yml'],
      expected: 'The recorder refuses the run.',
      run: 'pnpm ledger:validate',
      breaks: [
        {
          name: 'Another plant.',
          file: 'packages/b.ts',
          replace: 'a',
          with: 'b',
        },
      ],
    },
  ],
};

function aCheck(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    area: 'CI',
    protects: 'A defect reaching main.',
    howToTellArmed: 'The step appears in the run list.',
  };
}

/**
 * A day this many days before today, as the ledger spells one.
 *
 * Counted from the same `todayInUtc` the script counts from, so the fixtures
 * move with the clock rather than pinning a day that stops meaning what it
 * meant. Every case below dates its runs from `REPLAY_AFTER_DAYS` rather than
 * from a number of its own, so moving the floor moves the fixtures with it and
 * there is no second copy of the policy to disagree.
 */
function daysBeforeToday(days: number): IsoDate {
  const day = 24 * 60 * 60 * 1000;
  return new Date(Date.parse(`${todayInUtc()}T00:00:00Z`) - days * day)
    .toISOString()
    .slice(0, 10);
}

interface RunOptions {
  readonly checkId: string;
  /** Today when it is left out, which is what the anchor cases want. */
  readonly runOn?: IsoDate;
  /** Caught when it is left out. */
  readonly outcome?: TestRunOutcome;
  /**
   * The commit a replay ran against. Left out, the run is one somebody typed
   * in, which the ledger insists carries neither a commit nor a run link.
   */
  readonly sourceCommit?: string;
}

/** One run in the ledger, built the one way, however this file needs it. */
function aRun(options: RunOptions): Record<string, unknown> {
  const outcome = options.outcome ?? 'caught';
  const replayed = options.sourceCommit !== undefined;
  return {
    checkId: options.checkId,
    runOn: options.runOn ?? todayInUtc(),
    planted: 'A plant.',
    expected: 'The check fails.',
    outcome,
    // The ledger refuses a settled run carrying a reason and an unsettled one
    // without, so which of the two this is decides the field rather than the
    // caller.
    inconclusiveReason: outcomeSettlesSomething[outcome]
      ? null
      : 'The plant no longer applied.',
    note: null,
    source: replayed ? 'replay' : 'hand',
    sourceCommit: options.sourceCommit ?? null,
    sourceRunUrl: replayed ? 'https://ci.example.com/runs/1' : null,
  };
}

/** A run a replay recorded against a given commit, for the anchor lookup. */
function aReplayRun(
  checkId: string,
  sourceCommit: string,
): Record<string, unknown> {
  return aRun({ checkId, sourceCommit });
}

async function write(
  directory: string,
  files: Readonly<Record<string, unknown>>,
): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    const path = join(directory, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(
      path,
      typeof contents === 'string'
        ? contents
        : `${JSON.stringify(contents, null, 2)}\n`,
      'utf8',
    );
  }
}

async function commit(directory: string, message: string): Promise<string> {
  await git(directory, 'add', '--all');
  await git(directory, 'commit', '--message', message);
  return (await git(directory, 'rev-parse', 'HEAD')).trim();
}

/**
 * A repository holding the declaration above, a ledger with both checks in it,
 * and one commit.
 *
 * The ledger is inside the repository because that is where the real one sits,
 * and the script is told about both separately, so a test can point either of
 * them somewhere else.
 */
async function aRepository(): Promise<{
  readonly directory: string;
  readonly first: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'seen-to-fail-select-'));
  await git(directory, 'init', '--initial-branch', 'main');
  await git(directory, 'config', 'user.name', 'A test');
  await git(directory, 'config', 'user.email', 'test@example.com');

  await write(directory, {
    'canfail.json': declaration,
    '.github/workflows/ci.yml': 'name: CI\n',
    '.github/workflows/record-run.yml': 'name: Record a run\n',
    'packages/a.ts': 'export const a = 1;\n',
    'packages/b.ts': 'export const b = 1;\n',
    'docs/notes.md': 'Notes.\n',
    'ledger/checks/ci-type-check.json': aCheck('ci-type-check', 'Type check'),
    'ledger/checks/ledger-record-validation.json': aCheck(
      'ledger-record-validation',
      'Record a run',
    ),
  });

  return { directory, first: await commit(directory, 'The first commit.') };
}

/**
 * Runs the script as its own process and answers with the code it exited on.
 *
 * A process rather than an import, because the number a workflow step reads is
 * what is being tested, and a script that sets `process.exitCode` and one that
 * does not look identical from inside the same process.
 */
async function selectIn(
  directory: string,
  extra: readonly string[] = [],
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        join(scripts, 'select-replays.ts'),
        '--repository',
        directory,
        '--config',
        join(directory, 'canfail.json'),
        '--directory',
        join(directory, 'ledger'),
        '--out',
        join(directory, 'due.json'),
        ...extra,
      ],
      { stdio: 'ignore' },
    );
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === null) {
        reject(new Error('select-replays.ts was killed rather than exiting.'));
        return;
      }
      resolve(code);
    });
  });
}

/** The ids in the declaration the script wrote, or null when it wrote none. */
async function dueIn(directory: string): Promise<string[] | null> {
  let text: string;
  try {
    text = await readFile(join(directory, 'due.json'), 'utf8');
  } catch {
    return null;
  }
  const written = JSON.parse(text) as {
    checks: { checkId: string }[];
  };
  return written.checks.map((check) => check.checkId);
}

describe('which checks a change touches', () => {
  /**
   * #68's first criterion, end to end. The assertion is the whole list, so a
   * selection that replayed both checks fails it: the second check's only
   * dependency is the workflow that was not touched.
   */
  it('selects the check whose workflow changed and no other, and exits 0', async () => {
    const { directory, first } = await aRepository();
    await write(directory, {
      '.github/workflows/ci.yml': 'name: CI\n# edited\n',
    });
    await commit(directory, 'Edit the CI workflow.');

    expect(await selectIn(directory, ['--since', first])).toBe(0);
    expect(await dueIn(directory)).toEqual(['ci-type-check']);
  });

  it('selects the other check when the other workflow changed', async () => {
    const { directory, first } = await aRepository();
    await write(directory, {
      '.github/workflows/record-run.yml': 'name: Record a run\n# edited\n',
    });
    await commit(directory, 'Edit the recording workflow.');

    expect(await selectIn(directory, ['--since', first])).toBe(0);
    expect(await dueIn(directory)).toEqual(['ledger-record-validation']);
  });

  /**
   * #68's second criterion. A change on nobody's list posts no runs at all,
   * and the way this script says so is the status: the workflow reads it and
   * never installs the replay tool, so there is nothing to record.
   */
  it('exits 3 and writes nothing when the change touches nothing on any list', async () => {
    const { directory, first } = await aRepository();
    await write(directory, { 'docs/notes.md': 'Notes, edited.\n' });
    await commit(directory, 'Edit a document nothing depends on.');

    expect(await selectIn(directory, ['--since', first])).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });

  it('exits 3 and writes nothing when nothing has changed at all', async () => {
    const { directory } = await aRepository();

    expect(await selectIn(directory, ['--since', 'HEAD'])).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });

  /**
   * The subject of the matching is the window, not a commit.
   *
   * A cadence puts several commits between one dispatch and the next, so the
   * question is whether anything in the accumulated set touches a list. The
   * workflow edit below is the middle commit of three, with a document either
   * side of it, so a selection reading only `HEAD~1..HEAD` selects nothing and
   * fails here. It is the case that puts the edit that should be selected
   * anywhere but last, which is exactly why it is here.
   */
  it('selects on anything in the window, not only on the last commit', async () => {
    const { directory, first } = await aRepository();
    await write(directory, { 'docs/notes.md': 'Notes, once.\n' });
    await commit(directory, 'Edit a document.');
    await write(directory, {
      '.github/workflows/ci.yml': 'name: CI\n# edited\n',
    });
    await commit(directory, 'Edit the CI workflow.');
    await write(directory, { 'docs/notes.md': 'Notes, twice.\n' });
    await commit(directory, 'Edit the document again.');

    expect(await selectIn(directory, ['--since', first])).toBe(0);
    expect(await dueIn(directory)).toEqual(['ci-type-check']);
  });

  /** The second criterion, over a window rather than over one commit. */
  it('exits 3 when no commit in the window touches any list', async () => {
    const { directory, first } = await aRepository();
    await write(directory, { 'docs/notes.md': 'Notes, once.\n' });
    await commit(directory, 'Edit a document.');
    await write(directory, { 'docs/more-notes.md': 'More notes.\n' });
    await commit(directory, 'Add another document.');

    expect(await selectIn(directory, ['--since', first])).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });

  /**
   * The window is the difference between two trees, not the union of every
   * path the commits in it touched.
   *
   * A dependency edited and put back leaves the check's proof standing,
   * because the proof is about a tree and the tree is the one it was proved
   * against. The other reading is defensible, so this pins the one the script
   * makes rather than leaving it to be discovered by whoever reverts a
   * workflow. The second commit carries a document as well, because a commit
   * that only put the workflow back would have nothing in it to commit.
   */
  it('leaves a check alone when a dependency was changed and changed back', async () => {
    const { directory, first } = await aRepository();
    await write(directory, {
      '.github/workflows/ci.yml': 'name: CI\n# edited\n',
    });
    await commit(directory, 'Edit the CI workflow.');
    await write(directory, {
      '.github/workflows/ci.yml': 'name: CI\n',
      'docs/notes.md': 'Notes, edited.\n',
    });
    await commit(directory, 'Put the CI workflow back.');

    expect(await selectIn(directory, ['--since', first])).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });

  /**
   * #68's third task. A check whose list is missing is never selected by a
   * change, however plainly the change bears on it. Its proof still ages: the
   * age floor selects it once that proof is old enough, which a test further
   * down holds. This one has no runs in the ledger, so only matching is asked.
   */
  it('never selects a check that declares no dependencies for a change', async () => {
    const { directory, first } = await aRepository();
    await write(directory, {
      'canfail.json': {
        checks: [
          {
            name: 'Type check',
            checkId: 'ci-type-check',
            expected: 'The type check fails.',
            run: 'pnpm typecheck',
            breaks: declaration.checks[0]?.breaks,
          },
        ],
      },
      '.github/workflows/ci.yml': 'name: CI\n# edited\n',
      'packages/a.ts': 'export const a = 2;\n',
    });
    await commit(directory, 'Edit everything that check reads.');

    expect(await selectIn(directory, ['--since', first])).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });

  it('writes the selected check out with every key canfail reads', async () => {
    const { directory, first } = await aRepository();
    await write(directory, { 'packages/a.ts': 'export const a = 2;\n' });
    await commit(directory, 'Edit a package.');

    expect(await selectIn(directory, ['--since', first])).toBe(0);
    expect(
      JSON.parse(await readFile(join(directory, 'due.json'), 'utf8')),
    ).toEqual({ checks: [declaration.checks[0]] });
  });
});

describe('what a check was last replayed against', () => {
  /**
   * With no `--since`, the range comes from the ledger: the commit the newest
   * replay of that check ran against. This is the lane the schedule uses, and
   * the one a fixed window of days cannot do, because a scheduled run that
   * GitHub drops takes its window's changes with it.
   */
  it('measures each check against the commit its own last replay ran on', async () => {
    const { directory, first } = await aRepository();
    await write(directory, {
      'ledger/runs/a-replay-of-the-type-check.json': aReplayRun(
        'ci-type-check',
        first,
      ),
    });
    const recorded = await commit(directory, 'Record a replay.');
    await write(directory, {
      'ledger/runs/a-replay-of-the-recorder.json': aReplayRun(
        'ledger-record-validation',
        recorded,
      ),
      '.github/workflows/ci.yml': 'name: CI\n# edited\n',
    });
    await commit(directory, 'Edit the CI workflow.');

    expect(await selectIn(directory)).toBe(0);
    expect(await dueIn(directory)).toEqual(['ci-type-check']);
  });

  /**
   * A check nothing has ever replayed is measured against the empty tree, so
   * every tracked file counts as changed. The matching still runs, which is
   * why the second check below is not selected: nothing it depends on is in
   * this repository at all.
   */
  it('selects a check with a list that has never been replayed', async () => {
    const { directory } = await aRepository();
    await write(directory, {
      'canfail.json': {
        checks: [
          declaration.checks[0],
          {
            ...declaration.checks[1],
            dependsOn: ['.github/workflows/nothing-here.yml'],
          },
        ],
      },
    });
    await commit(directory, 'Point the second check at a file nobody has.');

    expect(await selectIn(directory)).toBe(0);
    expect(await dueIn(directory)).toEqual(['ci-type-check']);
  });

  /**
   * A commit the ledger names and this checkout cannot reach is not an anchor.
   * It happens whenever a replay was recorded on a branch nobody merged, and
   * treating it as a range would make git refuse and take the whole run down.
   */
  it('falls back to the empty tree when the recorded commit is unreachable', async () => {
    const { directory } = await aRepository();
    await write(directory, {
      'ledger/runs/a-replay-from-elsewhere.json': aReplayRun(
        'ci-type-check',
        'a'.repeat(40),
      ),
    });
    await commit(directory, 'Record a replay from a commit nobody has.');

    expect(await selectIn(directory)).toBe(0);
    expect(await dueIn(directory)).toEqual([
      'ci-type-check',
      'ledger-record-validation',
    ]);
  });
});

describe('what the selection refuses', () => {
  it('refuses a --since that is not a commit here, exits 1, and writes nothing', async () => {
    const { directory } = await aRepository();

    expect(await selectIn(directory, ['--since', 'b'.repeat(40)])).toBe(1);
    expect(await dueIn(directory)).toBeNull();
  });

  it('refuses a declaration that is not JSON, exits 1, and writes nothing', async () => {
    const { directory, first } = await aRepository();
    await writeFile(join(directory, 'canfail.json'), 'not json', 'utf8');

    expect(await selectIn(directory, ['--since', first])).toBe(1);
    expect(await dueIn(directory)).toBeNull();
  });

  it('refuses a dependency that is not a path, exits 1, and writes nothing', async () => {
    const { directory, first } = await aRepository();
    await write(directory, {
      'canfail.json': {
        checks: [{ ...declaration.checks[0], dependsOn: ['/packages'] }],
      },
    });

    expect(await selectIn(directory, ['--since', first])).toBe(1);
    expect(await dueIn(directory)).toBeNull();
  });

  /**
   * The ledger is where the anchor comes from, so a ledger that does not read
   * is a range nobody can work out. Refusing here rather than falling back to
   * the empty tree is what stops a broken record quietly replaying everything.
   */
  it('refuses a ledger that does not read, exits 1, and writes nothing', async () => {
    const { directory } = await aRepository();
    await rm(join(directory, 'ledger/checks/ci-type-check.json'));
    await write(directory, {
      'ledger/runs/a-replay-of-a-check-nobody-declared.json': aReplayRun(
        'ci-type-check',
        'c'.repeat(40),
      ),
    });

    expect(await selectIn(directory)).toBe(1);
    expect(await dueIn(directory)).toBeNull();
  });
});

/**
 * The age floor: a proof that has aged past it is due a replay whether or not
 * anything the check depends on has changed.
 *
 * Every case in this block is built so that the dependency lane selects
 * nothing. That is the point of them. A case the dependency lane would also
 * have selected passes under both the selection #68 shipped and the one this
 * block describes, and a test that passes under both has tested nothing about
 * the difference between them.
 *
 * The first case is the one to read if only one is read. It is the quiet
 * repository #68's ruling did not account for: the check was replayed against
 * the commit that is still the tip of what it depends on, nothing it depends on
 * has changed since, and the proof has simply got old.
 */
describe('a proof that has aged past the floor', () => {
  /**
   * A repository where nothing either check depends on has changed, and where
   * the second check's proof is fresh.
   *
   * Both halves are load-bearing. Only files under `ledger` are written, and
   * neither check's list mentions the ledger, so the dependency lane has
   * nothing to say about either of them. And the second check is given a proof
   * dated today rather than left with none, because a check nothing has ever
   * replayed is measured against the empty tree: every tracked file would count
   * as changed, its list would match the workflow it names, and the dependency
   * lane would select it. That is the dependency lane working correctly, and it
   * would mask the floor in every assertion below.
   *
   * The files each case needs are written in the same commit, so the window a
   * check is measured over holds them all.
   */
  async function aQuietRepository(
    files: (first: string) => Readonly<Record<string, unknown>>,
  ): Promise<string> {
    const { directory, first } = await aRepository();
    await write(directory, {
      'ledger/runs/a-fresh-replay-of-the-recorder.json': aRun({
        checkId: 'ledger-record-validation',
        sourceCommit: first,
      }),
      ...files(first),
    });
    await commit(directory, 'Record what this case starts from.');
    return directory;
  }

  /**
   * Selected on age alone, and the case to read if only one is read.
   *
   * Under the dependency-only selection this exits 3 and writes nothing:
   * nothing in the window is on either check's list. Under the floor it exits 0
   * with the aged check alone. The assertion is the whole list, so a floor that
   * selected both would fail it: the second check's dependencies are just as
   * untouched, and its proof is fresh.
   */
  it('selects the check on age alone, though nothing it depends on changed', async () => {
    const directory = await aQuietRepository((first) => ({
      'ledger/runs/an-old-replay-of-the-type-check.json': aRun({
        checkId: 'ci-type-check',
        runOn: daysBeforeToday(REPLAY_AFTER_DAYS + 1),
        sourceCommit: first,
      }),
    }));

    expect(await selectIn(directory)).toBe(0);
    expect(await dueIn(directory)).toEqual(['ci-type-check']);
  });

  /**
   * The boundary, pinned in both directions, because a floor asserted on one
   * side only is a floor that could be anywhere below the day it was tested.
   *
   * It is the same boundary the backstop uses. There, a catch exactly
   * `STALE_AFTER_DAYS` old still reads Proven and one day older reads Stale;
   * here, a run exactly `REPLAY_AFTER_DAYS` old is not yet owed a replay and
   * one day older is.
   */
  it('leaves a proof that is exactly the floor old alone', async () => {
    const directory = await aQuietRepository((first) => ({
      'ledger/runs/a-replay-of-the-type-check.json': aRun({
        checkId: 'ci-type-check',
        runOn: daysBeforeToday(REPLAY_AFTER_DAYS),
        sourceCommit: first,
      }),
    }));

    expect(await selectIn(directory)).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });

  /**
   * A check with no dependency list is selected by age, and this is where the
   * floor parts company with #68 most plainly.
   *
   * #68 ruled that such a check is never replayed automatically and goes Stale
   * on the backstop instead. A missing list says nobody has worked out what
   * voids this check's proof, which is a reason to keep proving it rather than
   * a reason to stop, and nothing here can produce a false Proven: the floor
   * selects a check to be replayed and the replay records whatever happened.
   * The dependency lane still never selects it, which the case above in
   * "which checks a change touches" holds it to.
   */
  it('selects a check that declares no dependencies when its proof has aged', async () => {
    const directory = await aQuietRepository((first) => ({
      'canfail.json': {
        checks: [
          {
            name: 'Type check',
            checkId: 'ci-type-check',
            expected: 'The type check fails.',
            run: 'pnpm typecheck',
            breaks: declaration.checks[0]?.breaks,
          },
        ],
      },
      'ledger/runs/an-old-replay-of-the-type-check.json': aRun({
        checkId: 'ci-type-check',
        runOn: daysBeforeToday(REPLAY_AFTER_DAYS + 1),
        sourceCommit: first,
      }),
    }));

    expect(await selectIn(directory)).toBe(0);
    expect(await dueIn(directory)).toEqual(['ci-type-check']);
  });

  /**
   * A check nobody has ever run anything against is passed over, and that is
   * not the floor declining to act.
   *
   * Such a check is Unproven, so there is no proof for the backstop to void and
   * none for the floor to keep alive. Its first replay comes from the
   * dependency lane, which measures it against the empty tree. Asserted with
   * `--since HEAD` so that lane has nothing to offer either, which is what
   * leaves the floor as the only thing that could have selected it.
   */
  it('passes over a check with no run at all', async () => {
    const { directory } = await aRepository();

    expect(await selectIn(directory, ['--since', 'HEAD'])).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });

  /**
   * The floor reads the newest settled run and not the newest replay.
   *
   * A replay that settled nothing is not evidence about the check: the status
   * rules skip it, so the backstop still measures from the last real catch.
   * Reading it as the check's freshness would hold the floor off while that
   * catch aged quietly past the backstop, which is the failure the floor exists
   * to stop. The inconclusive run here is dated today, so a floor reading the
   * newest replay would exit 3.
   */
  it('is not refreshed by a replay that settled nothing', async () => {
    const directory = await aQuietRepository((first) => ({
      'ledger/runs/an-old-catch.json': aRun({
        checkId: 'ci-type-check',
        runOn: daysBeforeToday(REPLAY_AFTER_DAYS + 1),
        sourceCommit: first,
      }),
      'ledger/runs/a-replay-that-settled-nothing.json': aRun({
        checkId: 'ci-type-check',
        outcome: 'inconclusive',
        sourceCommit: first,
      }),
    }));

    expect(await selectIn(directory)).toBe(0);
    expect(await dueIn(directory)).toEqual(['ci-type-check']);
  });

  /**
   * And it reads a run whoever typed it in as readily as one a replay posted.
   *
   * The floor exists to keep the published page off Stale, and what takes a
   * check Stale is the age of its latest settled run from any source. A check
   * somebody proved by hand this morning is Proven for another month, and
   * selecting it because its last *replay* was old would file the near
   * identical run the weekly cadence was chosen to avoid.
   */
  it('is refreshed by a run somebody typed in', async () => {
    const directory = await aQuietRepository((first) => ({
      'ledger/runs/an-old-replay.json': aRun({
        checkId: 'ci-type-check',
        runOn: daysBeforeToday(REPLAY_AFTER_DAYS + 1),
        sourceCommit: first,
      }),
      'ledger/runs/a-run-somebody-typed-in.json': aRun({
        checkId: 'ci-type-check',
      }),
    }));

    expect(await selectIn(directory)).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });

  /**
   * `--since` replaces the anchor a dependency is measured from and nothing
   * else, so the floor still reads the ledger under it.
   *
   * `--since HEAD` is an empty window, so the dependency lane has nothing at
   * all to say here and the selection is the floor's alone.
   */
  it('still applies when --since pins the dependency window', async () => {
    const directory = await aQuietRepository((first) => ({
      'ledger/runs/an-old-replay-of-the-type-check.json': aRun({
        checkId: 'ci-type-check',
        runOn: daysBeforeToday(REPLAY_AFTER_DAYS + 1),
        sourceCommit: first,
      }),
    }));

    expect(await selectIn(directory, ['--since', 'HEAD'])).toBe(0);
    expect(await dueIn(directory)).toEqual(['ci-type-check']);
  });

  /**
   * Only a check the declaration declares can be selected, however old its
   * proof is.
   *
   * This is the limit of what the floor fixes, and it is worth an assertion
   * rather than a sentence in a pull request. Until #110, three of the four
   * checks that carry runs in this repository's real ledger had no plant in
   * `canfail.json` at all, so nothing on this path could reach them and the
   * floor did not rescue them; the five checks that carry an observation and
   * no run are still in that position. The second check is taken out of the
   * declaration below and left in the ledger with a proof well past the floor.
   */
  it('cannot select a check the declaration does not declare', async () => {
    const { directory, first } = await aRepository();
    await write(directory, {
      'canfail.json': { checks: [declaration.checks[0]] },
      'ledger/runs/an-old-replay-of-the-recorder.json': aRun({
        checkId: 'ledger-record-validation',
        runOn: daysBeforeToday(REPLAY_AFTER_DAYS + 1),
        sourceCommit: first,
      }),
    });
    await commit(directory, 'Leave the recorder out of the declaration.');

    expect(await selectIn(directory, ['--since', 'HEAD'])).toBe(nothingIsDue);
    expect(await dueIn(directory)).toBeNull();
  });
});
