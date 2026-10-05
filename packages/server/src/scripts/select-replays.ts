// node packages/server/src/scripts/select-replays.ts \
//   --config <canfail.json> --out <where to write the checks that are due> \
//   [--since <a commit>] [--directory <a ledger>] [--repository <a checkout>]
//
// Which checks a replay is owed for. Each check declares what it depends on
// beside its plant, and this script answers with the ones that are due, written
// out as a plant declaration canfail can be handed directly.
//
// It exists because of what the workflow has to decide before it spends
// anything. A replay on every commit says nothing and costs money, so the
// scheduled lane asks this first and installs the replay tool only if the
// answer is yes.
//
// Two reasons a check is due, and a check is selected on either.
//
//   1. A dependency changed. Something the check declares it depends on is
//      different between the tree its proof was made against and HEAD (#68).
//   2. Its proof has aged. The check's newest settled run is older than
//      REPLAY_AFTER_DAYS, whatever has or has not changed.
//
// The second contradicts #68, which ruled that the schedule deliberately does
// not refresh a proof that is merely old. That ruling is superseded rather than
// bent, and this is the sentence that supersedes it. #68's reasoning was about
// cost and about the record: a replay is a dated observation, and refreshing
// one on a timer files near identical proofs that bury the runs saying
// something. Both hold. What #68 did not account for is what happens when the
// repository goes quiet. Nothing changes, so nothing is ever selected, so every
// proof ages out on the thirty-day backstop and the published page reads Stale
// across the board. Epic #62's goal clause, "a check stays Proven for as long
// as it keeps catching that defect", is false while that holds, and it was
// measured to be about to happen: on 19 September 2026 every check in the
// record was due to read Stale within about four weeks with no route back.
//
// The floor is set well below the backstop so that a weekly cadence gets more
// than one attempt at a refresh before the backstop bites, and well above the
// cadence so that a quiet check is replayed about once every three weeks rather
// than every second week. The arithmetic for both is on REPLAY_AFTER_DAYS in
// ../staleness.ts, and the relationship is asserted in staleness.test.ts.
//
// The floor can only rescue a check that has a plant in canfail.json, because
// that file is the whole of what this script reads checks from. A check the
// ledger holds and the declaration does not is not selectable here by either
// route, and no amount of ageing changes that.
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
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parseArgs, promisify } from 'node:util';

import {
  checksTouchedBy,
  declarationChangeFor,
  declarationOf,
  parseDeclaredChecks,
} from '@seen-to-fail/replay';
import type { DeclaredCheck } from '@seen-to-fail/replay';

import { outcomeSettlesSomething } from '../database/rows.ts';
import type { IsoDate } from '../database/rows.ts';
import { todayInUtc } from '../day.ts';
import { isShallowRepository } from '../ledger/commits.ts';
import { loadLedger } from '../ledger/load.ts';
import { ledgerDirectory, repositoryRoot } from '../ledger/location.ts';
import { REPLAY_AFTER_DAYS } from '../staleness.ts';
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
    //
    // It replaces the anchor a dependency is measured from and nothing else.
    // The age floor is still read from the ledger, because how old a check's
    // proof is has no answer a commit could give.
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

/** What this script needs out of the ledger, per check. */
interface LedgerReading {
  /** The commits a replay of each check has already run against, by check id. */
  readonly replayedCommits: ReadonlyMap<string, string[]>;
  /**
   * The day of each check's newest settled run, by check id, however that run
   * was recorded.
   *
   * Newest settled, and not newest replay, because this is the number the floor
   * is measured against and the floor exists to beat the backstop. The backstop
   * reads the latest run the status rules read, which is the latest run that
   * caught or missed, from whatever source. Two cases separate the two readings
   * and both favour this one. A check somebody typed a run in for yesterday is
   * Proven for another month, and selecting it because its last replay was old
   * would file exactly the near identical run the cadence was chosen to avoid.
   * And a replay that came back inconclusive settles nothing: reading it as the
   * check's freshness would hold the floor off while the last real catch aged
   * quietly past the backstop, which is the failure this floor is here to stop.
   *
   * Whether an outcome settles anything is read from the same map the status
   * SQL mirrors rather than from a list spelled again here.
   */
  readonly newestSettledRun: ReadonlyMap<string, IsoDate>;
}

/**
 * The ledger, read once, for both of the questions asked of it.
 *
 * Read whatever `--since` says, because `--since` replaces the anchor a
 * dependency is measured from and nothing else. The floor is a different
 * question, how old this check's proof is, and a commit handed in on the
 * command line is no answer to it. So a ledger that does not read is a refusal
 * on both lanes, for the reason it always was on one: falling back would let a
 * broken record quietly replay everything.
 */
async function readLedger(directory: string): Promise<LedgerReading> {
  const ledger = await loadLedger({ directory });
  if (!ledger.ok) {
    refuse([
      'The ledger has to read before a replay can be chosen from it, and it does not:',
      ...ledger.issues.map((issue) => `  ${issue.file}: ${issue.message}`),
    ]);
  }

  const commits = new Map<string, string[]>();
  const settled = new Map<string, IsoDate>();
  for (const { record } of ledger.contents.runs) {
    if (record.source === 'replay' && record.sourceCommit !== null) {
      const seen = commits.get(record.checkId) ?? [];
      seen.push(record.sourceCommit);
      commits.set(record.checkId, seen);
    }
    if (!outcomeSettlesSomething[record.outcome]) {
      continue;
    }
    const newest = settled.get(record.checkId);
    if (newest === undefined || record.runOn > newest) {
      settled.set(record.checkId, record.runOn);
    }
  }
  return { replayedCommits: commits, newestSettledRun: settled };
}

/**
 * Whole days from one day to a later one.
 *
 * Both are days rather than instants and both are UTC, so there is no zone and
 * no hour to lose: the subtraction is exact and the rounding is there only
 * because a millisecond count is a float. The ledger refuses a run dated after
 * today, so the answer is never negative.
 */
function daysBetween(earlier: IsoDate, later: IsoDate): number {
  const day = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) /
      day,
  );
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

const ledger = await readLedger(values.directory ?? ledgerDirectory);

// Grouped by anchor rather than asked per check, because the common case is
// every check sharing one: a diff is a process, and the number of them should
// depend on how many answers there are rather than on how many checks.
const grouped = new Map<string, DeclaredCheck[]>();
for (const check of declared.value) {
  const anchor =
    since ??
    (await newestReachable(
      root,
      ledger.replayedCommits.get(check.checkId) ?? [],
    )) ??
    (await emptyTree(root));
  const group = grouped.get(anchor) ?? [];
  group.push(check);
  grouped.set(anchor, group);
}

// The declaration's own path, as git spells it, when it sits in the checkout.
// Every check lists it, because its plant lives there, so a change to it is
// read entry by entry rather than as a path: an edit to one check's entry
// touches that check, and an edit outside the entries touches every check
// (#165). A declaration outside the checkout never appears among the changed
// paths, so it needs no path here.
const fromRoot = relative(resolve(root), resolve(configPath));
const declarationPath =
  fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)
    ? undefined
    : fromRoot.split(sep).join('/');

/**
 * The declaration as it stood at a commit, or undefined when it was not there
 * or was not JSON. The empty tree an unreplayed check is measured from has no
 * declaration in it, and that reads as every entry having changed.
 */
async function declarationAt(anchor: string, path: string): Promise<unknown> {
  try {
    return JSON.parse(await git(root, 'show', `${anchor}:${path}`)) as unknown;
  } catch {
    return undefined;
  }
}

const due = new Set<DeclaredCheck>();
for (const [anchor, checks] of grouped) {
  const changedPaths = await changedSince(root, anchor);
  const declaration =
    declarationPath !== undefined && changedPaths.includes(declarationPath)
      ? {
          path: declarationPath,
          changed: declarationChangeFor(
            await declarationAt(anchor, declarationPath),
            configInput,
          ),
        }
      : undefined;
  for (const check of checksTouchedBy({ checks, changedPaths, declaration })) {
    due.add(check);
  }
  for (const check of checks) {
    console.log(
      `${check.name} (${check.checkId}) is measured against ${anchor}, where ${String(changedPaths.length)} path(s) changed.`,
    );
    if (declaration !== undefined && !declaration.changed(check.checkId)) {
      console.log(
        `  ${declaration.path} is one of them, and ${check.checkId}'s own entry in it and its shared fields are as they were.`,
      );
    }
  }
}

// The age floor, applied after the matching and on its own terms.
//
// Every declared check, including one with no dependency list and one whose
// list matches nothing. #68 left both of those to be replayed by hand, and this
// is where that changes: a missing list says nobody has worked out what voids
// this check's proof, which is a reason to keep proving it rather than a reason
// to stop. The dependency lane still never selects either of them, and the
// tests still hold it to that.
//
// A check with no settled run at all is passed over, and that is not the floor
// declining to act. Such a check is Unproven rather than Proven, so there is no
// proof for the backstop to void and nothing for the floor to keep alive. The
// dependency lane already measures it against the empty tree, which is where a
// check that has never been proved gets its first replay from.
//
// Strictly older than the floor, which is the boundary the backstop uses: there
// it is a catch exactly thirty days old that still reads Proven, and here it is
// a run exactly REPLAY_AFTER_DAYS old that is not yet owed a replay.
const today = todayInUtc();
for (const check of declared.value) {
  const newest = ledger.newestSettledRun.get(check.checkId);
  if (newest === undefined) {
    continue;
  }
  const age = daysBetween(newest, today);
  if (age > REPLAY_AFTER_DAYS) {
    due.add(check);
    console.log(
      `${check.name} (${check.checkId}) was last settled on ${newest}, ${String(age)} day(s) ago, which is past the ${String(REPLAY_AFTER_DAYS)}-day floor.`,
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
    `\nNothing a declared check depends on has changed since it was last replayed, and no declared check's newest settled run is more than ${String(REPLAY_AFTER_DAYS)} days old. Nothing to replay.`,
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
