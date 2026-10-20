// node packages/server/src/scripts/check-waiting-branches.ts \
//   [--repository <a checkout>] [--remote <name>] [--main <branch>] \
//   [--kept-off-main <file>]
//
// Whether a recorded branch has been left waiting for a person (#122).
//
// Both recording workflows push their record to a branch and stop, because
// GitHub Actions may not open a pull request here (#74). This reads every
// `replay/` and `record/` branch the checkout knows on the remote, asks git
// which of the ledger files each one changed are not on `main` byte for byte,
// and hands that to `judgeRecordedBranches` in ../ledger/waiting.ts, which owns
// the rules. Byte for byte rather than "is the branch an ancestor of main",
// because most of these land by squash merge: the branch then never becomes an
// ancestor, and an ancestry test reads every landed branch left behind as
// unlanded. Measured on 20 October 2026, `record/37295337395` is exactly that,
// landed as PR #231 and still on the remote.
//
// It reads the remote-tracking refs and does not fetch, so the caller decides
// how fresh they are. The workflow fetches the two lanes and `main` first.
//
// Three exit codes, because a workflow step reads a status and nothing else:
//
//   0  nothing needs a person; the report may still list branches waiting
//      inside the grace, landed branches left behind, and kept-off branches
//   2  a branch is overdue, or an entry in the kept-off file is stale
//   1  a refusal: the arguments, the kept-off file or the checkout would not
//      read, so nothing was judged
//
// The report goes to standard output as Markdown, which the workflow appends
// to its run summary.

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import { isShallowRepository } from '../ledger/commits.ts';
import { ledgerPath, repositoryRoot } from '../ledger/location.ts';
import {
  describeWaitingReport,
  judgeRecordedBranches,
  parseKeptOffMain,
  recordedBranchPrefixes,
} from '../ledger/waiting.ts';
import type { RecordedBranch } from '../ledger/waiting.ts';
import { forwardedArguments } from './arguments.ts';

/** What this script exits with when a branch needs a person. */
const needsAPerson = 2;

/** Where the branches deliberately kept off `main` are written down. */
const defaultKeptOffMain = join('.github', 'kept-off-main.json');

const { values } = parseArgs({
  args: forwardedArguments(),
  options: {
    // A checkout other than the one this file sits in, which is how the tests
    // run this over a temporary repository.
    repository: { type: 'string' },
    remote: { type: 'string', default: 'origin' },
    main: { type: 'string', default: 'main' },
    'kept-off-main': { type: 'string' },
  },
});

function refuse(problems: readonly string[]): never {
  for (const problem of problems) {
    console.error(problem);
  }
  console.error('\nNothing was judged.');
  process.exit(1);
}

const run = promisify(execFile);

async function git(root: string, ...args: readonly string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', root, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/** Paths from a `-z` listing, so a name with a space arrives unquoted. */
function paths(output: string): string[] {
  return output.split('\0').filter((path) => path !== '');
}

const root = values.repository ?? repositoryRoot;
const keptOffMainFile = values['kept-off-main'] ?? defaultKeptOffMain;
const remoteRefs = `refs/remotes/${values.remote}/`;
const mainRef = `${remoteRefs}${values.main}`;

let keptOffMainText: string;
try {
  keptOffMainText = await readFile(join(root, keptOffMainFile), 'utf8');
} catch (error) {
  refuse([`${keptOffMainFile} could not be read: ${String(error)}`]);
}

let keptOffMainJson: unknown;
try {
  keptOffMainJson = JSON.parse(keptOffMainText);
} catch (error) {
  refuse([`${keptOffMainFile} is not JSON: ${String(error)}`]);
}

const keptOffMain = parseKeptOffMain(keptOffMainJson);
if (!keptOffMain.ok) {
  refuse(
    keptOffMain.problems.map((problem) => `${keptOffMainFile}: ${problem}`),
  );
}

if (await isShallowRepository(root)) {
  refuse([
    'This is a shallow clone, so where a branch left main cannot be read. ' +
      'Check the repository out with its full history.',
  ]);
}

try {
  await git(root, 'rev-parse', '--verify', '--quiet', `${mainRef}^{commit}`);
} catch {
  refuse([
    `${mainRef} is not in this checkout. Fetch it first, or name the branch with --main.`,
  ]);
}

const listing = await git(
  root,
  'for-each-ref',
  '--format=%(refname)%00%(objectname)%00%(committerdate:unix)',
  ...recordedBranchPrefixes.map((prefix) => `${remoteRefs}${prefix}`),
);

const branches: RecordedBranch[] = [];
for (const line of listing.split('\n').filter((entry) => entry !== '')) {
  const [refname = '', head = '', seconds = ''] = line.split('\0');
  const branch = refname.slice(remoteRefs.length);

  let base: string;
  try {
    base = (await git(root, 'merge-base', mainRef, head)).trim();
  } catch {
    refuse([`${branch} shares no history with ${mainRef}.`]);
  }

  const ledgerPaths = paths(
    await git(
      root,
      'diff',
      '--name-only',
      '-z',
      '--no-renames',
      base,
      head,
      '--',
      ledgerPath,
    ),
  );
  // What the branch holds that main does not, among the files it changed.
  // A file main has since changed again would read as unlanded here; no
  // ledger record has ever been edited after landing, and a false alarm is
  // loud where a false pass would be silent.
  const unlandedPaths =
    ledgerPaths.length === 0
      ? []
      : paths(
          await git(
            root,
            'diff',
            '--name-only',
            '-z',
            '--no-renames',
            mainRef,
            head,
            '--',
            ...ledgerPaths,
          ),
        );

  branches.push({
    branch,
    head,
    committedAt: new Date(Number(seconds) * 1000),
    ledgerPaths,
    unlandedPaths,
  });
}

const report = judgeRecordedBranches(branches, keptOffMain.value, new Date());
process.stdout.write(describeWaitingReport(report, keptOffMainFile));
if (report.needsAPerson) {
  process.exitCode = needsAPerson;
}
