import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LANDING_GRACE_DAYS } from '../ledger/waiting.ts';

/**
 * Finding a recorded branch left waiting (#122), judged the way the workflow
 * judges it: by the status the script exits with. Nothing here reads a printed
 * message.
 *
 * Every case runs against a real remote and a real clone of it, because the
 * part that can silently pass is the git reading: which refs are listed, where
 * a branch left main, and whether main holds its files after a squash merge,
 * which leaves the branch no ancestor of main.
 */

const scripts = fileURLToPath(new URL('.', import.meta.url));
const run = promisify(execFile);

/** What the script exits with when a branch needs a person. */
const needsAPerson = 2;

const day = 24 * 60 * 60 * 1000;

/**
 * git, told to read no configuration but the repository's own, so a hook or
 * signing setting on the machine running the tests cannot decide the answer.
 */
async function git(
  directory: string,
  args: readonly string[],
  committedAt?: Date,
): Promise<string> {
  const date = committedAt?.toISOString();
  const { stdout } = await run('git', ['-C', directory, ...args], {
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      ...(date === undefined
        ? {}
        : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
    },
  });
  return stdout;
}

let workspace: string;
let origin: string;

async function put(directory: string, path: string, text: string) {
  await mkdir(dirname(join(directory, path)), { recursive: true });
  await writeFile(join(directory, path), text);
}

async function commit(message: string, committedAt?: Date): Promise<string> {
  await git(origin, ['add', '--all']);
  await git(origin, ['commit', '--quiet', '--message', message], committedAt);
  return (await git(origin, ['rev-parse', 'HEAD'])).trim();
}

/**
 * Push a recorded branch onto the remote, carrying one run file, committed
 * this many days ago. Returns its head.
 */
async function aRecordedBranch(
  branch: string,
  daysOld: number,
  file: string,
): Promise<string> {
  await git(origin, ['switch', '--quiet', '--create', branch, 'main']);
  await put(origin, `ledger/runs/${file}`, `{"run":"${file}"}\n`);
  const head = await commit(
    `Record ${file}`,
    new Date(Date.now() - daysOld * day),
  );
  await git(origin, ['switch', '--quiet', 'main']);
  return head;
}

/** Land a branch's files on main the way a squash merge does. */
async function squashOntoMain(branch: string) {
  await git(origin, ['merge', '--quiet', '--squash', branch]);
  await commit(`Land ${branch}`);
}

async function keptOffMain(entries: readonly unknown[]) {
  await put(
    origin,
    '.github/kept-off-main.json',
    `${JSON.stringify({ keptOffMain: entries })}\n`,
  );
  await commit('Write the kept-off file');
}

/** Clone the remote fresh and run the script in the clone. */
async function judge(): Promise<number> {
  const checkout = join(workspace, `checkout-${String(Date.now())}`);
  await git(workspace, ['clone', '--quiet', origin, checkout]);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(scripts, 'check-waiting-branches.ts'), '--repository', checkout],
      { stdio: 'ignore' },
    );
    child.on('error', reject);
    child.on('exit', (code) => {
      resolve(code ?? -1);
    });
  });
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'waiting-branches-'));
  origin = join(workspace, 'origin');
  await mkdir(origin);
  await git(origin, ['init', '--quiet', '--initial-branch', 'main']);
  await put(origin, 'ledger/runs/landed.json', '{"run":"landed"}\n');
  await put(origin, '.github/kept-off-main.json', '{"keptOffMain":[]}\n');
  await commit('Start a ledger', new Date(Date.now() - 30 * day));
});

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true });
});

describe('a recorded branch', () => {
  it('passes when there is none', async () => {
    expect(await judge()).toBe(0);
  });

  it('passes while an unlanded branch is inside the grace', async () => {
    await aRecordedBranch('replay/1', LANDING_GRACE_DAYS - 1, 'one.json');
    expect(await judge()).toBe(0);
  });

  it('fails once an unlanded branch has waited past the grace', async () => {
    await aRecordedBranch('replay/1', LANDING_GRACE_DAYS + 2, 'one.json');
    expect(await judge()).toBe(needsAPerson);
  });

  it('fails on the record lane too', async () => {
    await aRecordedBranch('record/1', LANDING_GRACE_DAYS + 2, 'one.json');
    expect(await judge()).toBe(needsAPerson);
  });

  it('passes a branch squash-merged and left behind, which is no ancestor of main', async () => {
    await aRecordedBranch('record/1', LANDING_GRACE_DAYS + 2, 'one.json');
    await squashOntoMain('record/1');
    expect(await judge()).toBe(0);
  });

  it('ignores branches outside the recorded lanes', async () => {
    await aRecordedBranch('ci-control/1', LANDING_GRACE_DAYS + 2, 'one.json');
    expect(await judge()).toBe(0);
  });
});

describe('a branch kept off main', () => {
  it('passes while the entry names its head', async () => {
    const head = await aRecordedBranch('replay/9', 30, 'control.json');
    await keptOffMain([
      { branch: 'replay/9', head, issue: 67, reason: 'A control.' },
    ]);
    expect(await judge()).toBe(0);
  });

  it('fails once the branch is deleted, so the entry cannot pass silently', async () => {
    const head = await aRecordedBranch('replay/9', 30, 'control.json');
    await keptOffMain([
      { branch: 'replay/9', head, issue: 67, reason: 'A control.' },
    ]);
    await git(origin, ['branch', '--quiet', '--delete', '--force', 'replay/9']);
    expect(await judge()).toBe(needsAPerson);
  });

  it('fails once the branch lands, so the entry cannot pass silently', async () => {
    const head = await aRecordedBranch('replay/9', 30, 'control.json');
    await keptOffMain([
      { branch: 'replay/9', head, issue: 67, reason: 'A control.' },
    ]);
    await squashOntoMain('replay/9');
    expect(await judge()).toBe(needsAPerson);
  });

  it('refuses a kept-off file that does not read', async () => {
    await keptOffMain([{ branch: 'replay/9', reason: 'No head.' }]);
    expect(await judge()).toBe(1);
  });
});
