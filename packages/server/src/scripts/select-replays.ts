// node packages/server/src/scripts/select-replays.ts \
//   --config <canfail.json> --out <where to write the checks that are due> \
//   [--since <a commit>] [--directory <a ledger>] [--repository <a checkout>]
//
// Which checks a change touches (#68). Each check declares what it depends on
// beside its plant, and this script answers with the ones a replay is owed for,
// written out as a plant declaration canfail can be handed directly.
//
// It exists because of what the workflow has to decide before it spends
// anything. A replay on every commit says nothing and costs money, so the
// scheduled lane asks this first and installs the replay tool only if the
// answer is yes.
//
// Three exit codes, because a workflow step reads a status and nothing else:
//
//   0  at least one check is due, and --out holds the declaration for it
//   3  nothing is due; nothing was written and nothing should be replayed
//   1  a refusal; nothing was written and the run should stop
//
// Nothing is a distinct code rather than an empty file at 0, so that a step
// which cannot parse JSON can still tell "here is the work" from "there is
// none", and so that a --out nobody wrote is never mistaken for one this script
// left empty.
//
// The answer per check is "what has changed since this check was last proved",
// which is why the anchor comes from the ledger rather than from a window of
// days. A window keyed to the cadence loses a change whenever a scheduled run
// is dropped; the ledger's own record of the commit a replay ran against cannot
// drift, because it is the same field the published page reads.

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs, promisify } from 'node:util';

import {
  checksTouchedBy,
  declarationOf,
  parseDeclaredChecks,
} from '@seen-to-fail/replay';
import type { DeclaredCheck } from '@seen-to-fail/replay';

import { isShallowRepository } from '../ledger/commits.ts';
import { loadLedger } from '../ledger/load.ts';
import { ledgerDirectory, repositoryRoot } from '../ledger/location.ts';
import { forwardedArguments } from './arguments.ts';

/** What this script exits with when no check is due. */
const nothingIsDue = 3;

const { values } = parseArgs({
  args: forwardedArguments(),
  options: {
    config: { type: 'string' },
    out: { type: 'string' },
    // One anchor for every check, in place of the ledger's own. It is how a
    // person asks "what would a change since here replay?" without waiting for
    // the schedule, and how the tests pin a range.
    since: { type: 'string' },
    // A ledger other than this repository's own, and a checkout other than the
    // one this file sits in, which is how the tests run this over a temporary
    // repository without touching the real record.
    directory: { type: 'string' },
    repository: { type: 'string' },
  },
});

function refuse(problems: readonly string[]): never {
  for (const problem of problems) {
    console.error(problem);
  }
  console.error('\nNothing was selected.');
  process.exit(1);
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined) {
    refuse([`${flag} is required.`]);
  }
  return value;
}

const run = promisify(execFile);

async function git(root: string, ...args: readonly string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', root, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Whether a git command succeeded, for the questions git answers with a status
 * rather than with output.
 *
 * `merge-base --is-ancestor` is one of those, and it fails both when the commit
 * is not an ancestor and when this checkout has never heard of it. Both are the
 * same answer here: a commit this checkout cannot reach cannot anchor a diff.
 */
async function gitSucceeds(
  root: string,
  ...args: readonly string[]
): Promise<boolean> {
  try {
    await run('git', ['-C', root, ...args]);
    return true;
  } catch {
    return false;
  }
}

/**
 * The paths that changed between a commit and HEAD, as git spells them.
 *
 * `-z` rather than plain `--name-only`, so the names arrive unquoted. git
 * escapes a filename carrying a space or a non-ASCII character when it prints
 * one per line, and an escaped name matches no dependency, which would read as
 * a check that depends on nothing having changed.
 */
async function changedSince(root: string, anchor: string): Promise<string[]> {
  const output = await git(root, 'diff', '--name-only', '-z', anchor, 'HEAD');
  return output.split('\0').filter((path) => path !== '');
}

/*
 * Two things about that range are decisions rather than details.
 *
 * It is the whole window since the check was last replayed, not the last
 * commit. A cadence puts several commits between one dispatch and the next, so
 * a selection reading `HEAD~1..HEAD` would answer about whichever change
 * happened to land last and would miss the one that mattered. It would also
 * pass a fixture with a single commit in it, which is why the tests put three
 * in the window and assert on the one in the middle.
 *
 * And it is the difference between two trees, not the union of every path the
 * commits in it touched. A dependency edited and put back inside the window
 * leaves the check's proof standing, because the proof is about a tree and the
 * tree is the one it was proved against. The other reading is defensible, so
 * the tests pin this one rather than leaving it to be discovered.
 */

/**
 * The tree with nothing in it, which is what a check that has never been
 * replayed is compared against.
 *
 * Derived from git rather than written down as the well known hash, so that it
 * is this repository's git answering rather than a constant in a file nobody
 * rechecks. Diffing it against HEAD lists every tracked file, which is the
 * honest reading of "changed since the last replay" when there was no last
 * replay: nothing about the tree has ever been proved for that check.
 *
 * The matching still applies afterwards, so this does not make a check with no
 * dependency list replay. It makes a check with one replay on its first run and
 * on no other.
 */
async function emptyTree(root: string): Promise<string> {
  return (await git(root, 'hash-object', '-t', 'tree', '/dev/null')).trim();
}

/**
 * The newest of these commits that this checkout can reach from HEAD, or null
 * when it can reach none of them.
 *
 * Newest by git's own reckoning rather than by the day the run was recorded on.
 * Two replays recorded on one day are two rows the ledger does not order
 * between, and this needs a total order; the number of commits between a
 * candidate and HEAD is one, and it is git's.
 */
async function newestReachable(
  root: string,
  candidates: readonly string[],
): Promise<string | null> {
  let newest: string | null = null;
  let fewest = Number.POSITIVE_INFINITY;

  for (const commit of candidates) {
    if (
      !(await gitSucceeds(root, 'merge-base', '--is-ancestor', commit, 'HEAD'))
    ) {
      continue;
    }
    const distance = Number(
      (await git(root, 'rev-list', '--count', `${commit}..HEAD`)).trim(),
    );
    if (distance < fewest) {
      fewest = distance;
      newest = commit;
    }
  }

  return newest;
}

/** The commits a replay of each check has already run against, by check id. */
async function replayedCommits(
  directory: string,
): Promise<ReadonlyMap<string, string[]>> {
  const ledger = await loadLedger({ directory });
  if (!ledger.ok) {
    refuse([
      'The ledger has to read before a replay can be chosen from it, and it does not:',
      ...ledger.issues.map((issue) => `  ${issue.file}: ${issue.message}`),
    ]);
  }

  const commits = new Map<string, string[]>();
  for (const { record } of ledger.contents.runs) {
    if (record.source !== 'replay' || record.sourceCommit === null) {
      continue;
    }
    const seen = commits.get(record.checkId) ?? [];
    seen.push(record.sourceCommit);
    commits.set(record.checkId, seen);
  }
  return commits;
}

const configPath = required(values.config, '--config');
const outPath = required(values.out, '--out');
const root = values.repository ?? repositoryRoot;

// The one question to ask before the history is trusted, and the same one the
// build asks. Ancestry read from a shallow clone is a lie that reads as an
// answer: every recorded commit is unreachable, so every check falls back to
// the empty tree and every check with a list is replayed, on every run.
if (await isShallowRepository(root)) {
  refuse([
    'This is a shallow clone, so what a check was last replayed against cannot be reached. Check the repository out with its full history.',
  ]);
}

let configText: string;
try {
  configText = await readFile(configPath, 'utf8');
} catch (cause) {
  refuse([
    `--config could not be read: ${cause instanceof Error ? cause.message : String(cause)}`,
  ]);
}

let configInput: unknown;
try {
  configInput = JSON.parse(configText);
} catch (cause) {
  refuse([
    `--config is not JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
  ]);
}

const declared = parseDeclaredChecks(configInput);
if (!declared.ok) {
  refuse(declared.problems);
}

const since = values.since;
if (
  since !== undefined &&
  !(await gitSucceeds(root, 'rev-parse', '--verify', `${since}^{commit}`))
) {
  refuse([`--since names ${since}, which is not a commit in this checkout.`]);
}

const alreadyReplayed =
  since === undefined
    ? await replayedCommits(values.directory ?? ledgerDirectory)
    : new Map<string, string[]>();

// Grouped by anchor rather than asked per check, because the common case is
// every check sharing one: a diff is a process, and the number of them should
// depend on how many answers there are rather than on how many checks.
const grouped = new Map<string, DeclaredCheck[]>();
for (const check of declared.value) {
  const anchor =
    since ??
    (await newestReachable(root, alreadyReplayed.get(check.checkId) ?? [])) ??
    (await emptyTree(root));
  const group = grouped.get(anchor) ?? [];
  group.push(check);
  grouped.set(anchor, group);
}

const due = new Set<DeclaredCheck>();
for (const [anchor, checks] of grouped) {
  const changedPaths = await changedSince(root, anchor);
  for (const check of checksTouchedBy({ checks, changedPaths })) {
    due.add(check);
  }
  for (const check of checks) {
    console.log(
      `${check.name} (${check.checkId}) is measured against ${anchor}, where ${String(changedPaths.length)} path(s) changed.`,
    );
  }
}

// In the order the declaration lists them, which is the order a person reading
// canfail.json expects to see them replayed in. The set above is keyed on the
// check itself, so a declaration with two checks sharing an id still selects
// each of them separately.
const selected = declared.value.filter((check) => due.has(check));

if (selected.length === 0) {
  console.log(
    '\nNothing a declared check depends on has changed since it was last replayed. Nothing to replay.',
  );
  process.exit(nothingIsDue);
}

await writeFile(
  outPath,
  `${JSON.stringify(declarationOf(selected), null, 2)}\n`,
  'utf8',
);

console.log(
  `\n${String(selected.length)} check(s) due: ${selected.map((check) => check.checkId).join(', ')}.`,
);
console.log(`Written to ${outPath}.`);
