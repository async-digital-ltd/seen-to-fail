import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { StatusTotals } from '../database/checks.ts';
import type { CheckSummary } from '../database/summaries.ts';
import { ledgerCheckUuid, ledgerFileUuid } from '../ledger/identity.ts';
import type { LedgerContents } from '../ledger/load.ts';
import { buildSnapshot } from '../ledger/snapshot.ts';
import type { PublishedLedger } from '../ledger/snapshot.ts';
import type { DatabaseTotals } from '../ledger/verify.ts';

/**
 * A small ledger that agrees with itself, for the tests that are about what
 * happens when something stops agreeing.
 *
 * The summaries are written by hand rather than derived, because these tests
 * are about the export and the page rather than about the status rules, which
 * have their own tests against a real database. What matters here is that every
 * number below is consistent with the records above it, so a test that breaks
 * one thing breaks exactly one thing.
 */

/** Where this ledger pretends to sit in the repository. */
export const fixtureLedgerPath = 'ledger';

/**
 * A ledger on disk, written from whatever a test wants in it, in a directory of
 * its own under the system's temporary one.
 *
 * The files are written exactly as given, including the ones that are wrong on
 * purpose, because what is being tested is the reader rather than the writer: a
 * test that could only write records the writer accepts could never watch the
 * reader refuse anything.
 */
export async function writeTemporaryLedger(
  files: Readonly<Record<string, unknown>>,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'seen-to-fail-ledger-'));

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

  return directory;
}

/** The day the fixture is read as of. */
export const fixtureAsOf = '2026-09-18';

/** The commit the fixture build pretends to have run against. */
export const fixtureCommit = 'ffffffffffffffffffffffffffffffffffffffff';

/**
 * What a replay would have recorded about itself, for the tests that need a
 * run nobody typed in.
 *
 * Deliberately not a github.com address. The page links to a commit on GitHub
 * because that is where this repository is; the run a replay came from is
 * wherever that replay ran, and a fixture that only ever used one host would
 * let a page that can only render that host pass.
 */
export const fixtureReplayCommit = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd';
export const fixtureReplayRunUrl = 'https://ci.example.com/runs/91';

export function fixtureContents(): LedgerContents {
  return {
    checks: [
      {
        file: 'checks/first-check.json',
        record: {
          id: 'first-check',
          name: 'A check with a catch behind it',
          area: 'CI',
          protects: 'A defect reaching main.',
          howToTellArmed: 'The step appears in the run list.',
        },
      },
      {
        file: 'checks/second-check.json',
        record: {
          id: 'second-check',
          name: 'A check nobody has planted anything for',
          area: 'Review',
          protects: '',
          howToTellArmed: '',
        },
      },
    ],
    runs: [
      {
        file: 'runs/2026-09-10-first-check-abcdef123456.json',
        record: {
          checkId: 'first-check',
          runOn: '2026-09-10',
          planted: 'A type error.',
          expected: 'The type check fails.',
          outcome: 'caught',
          inconclusiveReason: null,
          note: null,
          source: 'hand',
          sourceCommit: null,
          sourceRunUrl: null,
        },
      },
    ],
    observations: [
      {
        file: 'observations/2026-09-01-second-check.json',
        record: {
          checkId: 'second-check',
          observedOn: '2026-09-01',
          armed: true,
          note: null,
        },
      },
    ],
  };
}

/**
 * The same ledger, with its one run recorded by a replay rather than typed in.
 *
 * Every count is untouched, so the summaries, the totals and the status tallies
 * below describe this ledger exactly as well as they describe the other one.
 * Where a run came from changes nothing a status is worked out from, and a
 * fixture that had to be recounted for it would be saying otherwise.
 */
export function fixtureContentsFromAReplay(): LedgerContents {
  const contents = fixtureContents();
  const [run, ...rest] = contents.runs;
  if (run === undefined) {
    throw new Error('The fixture has no runs.');
  }
  return {
    ...contents,
    runs: [
      {
        ...run,
        record: {
          ...run.record,
          source: 'replay',
          sourceCommit: fixtureReplayCommit,
          sourceRunUrl: fixtureReplayRunUrl,
        },
      },
      ...rest,
    ],
  };
}

/** The file the run that settled nothing is recorded in, for the variant below. */
export const fixtureUnsettledRunFile =
  'runs/2026-09-16-first-check-fedcba654321.json';

/** What a replay that could not apply its plant reported, word for word. */
export const fixtureUnsettledReason =
  'The anchor matches 0 times in packages/filter/src/types.ts and must match exactly once, so nothing was broken.';

/**
 * The same ledger, with a newer run against the first check that settled
 * nothing.
 *
 * For the tests that are about a status not moving. The catch it already has is
 * left exactly where it was, so a page or an export that started reading the
 * newer row as evidence would change something that this fixture says should
 * not change.
 */
export function fixtureContentsWithAnUnsettledRun(): LedgerContents {
  const contents = fixtureContents();
  return {
    ...contents,
    runs: [
      ...contents.runs,
      {
        file: fixtureUnsettledRunFile,
        record: {
          checkId: 'first-check',
          runOn: '2026-09-16',
          planted: 'A type error at the declared anchor.',
          expected: 'The type check fails.',
          outcome: 'inconclusive',
          inconclusiveReason: fixtureUnsettledReason,
          note: null,
          source: 'replay',
          sourceCommit: fixtureReplayCommit,
          sourceRunUrl: fixtureReplayRunUrl,
        },
      },
    ],
  };
}

/**
 * What the database derives from that variant: one more run, counted as neither
 * a catch nor a miss, and a status still read from the catch six days earlier.
 */
export function fixtureSummariesWithAnUnsettledRun(): CheckSummary[] {
  return fixtureSummaries().map((summary) =>
    summary.checkId === ledgerCheckUuid('first-check')
      ? {
          ...summary,
          lastRunOn: '2026-09-16',
          runCount: 2,
          inconclusiveCount: 1,
        }
      : summary,
  );
}

/** What the database would derive from those records, read as of the day above. */
export function fixtureSummaries(): CheckSummary[] {
  return [
    {
      checkId: ledgerCheckUuid('first-check'),
      status: 'Proven',
      lastCaughtOn: '2026-09-10',
      lastRunOn: '2026-09-10',
      lastSettledOn: '2026-09-10',
      latestSettledRunId: ledgerFileUuid(
        `${fixtureLedgerPath}/runs/2026-09-10-first-check-abcdef123456.json`,
      ),
      runCount: 1,
      caughtCount: 1,
      missedCount: 0,
      inconclusiveCount: 0,
      lastSeenArmedOn: null,
      lastArmed: null,
      latestObservationId: null,
    },
    {
      checkId: ledgerCheckUuid('second-check'),
      status: 'Unproven',
      lastCaughtOn: null,
      lastRunOn: null,
      lastSettledOn: null,
      latestSettledRunId: null,
      runCount: 0,
      caughtCount: 0,
      missedCount: 0,
      inconclusiveCount: 0,
      lastSeenArmedOn: '2026-09-01',
      lastArmed: true,
      latestObservationId: ledgerFileUuid(
        `${fixtureLedgerPath}/observations/2026-09-01-second-check.json`,
      ),
    },
  ];
}

/** What the tables hold once those records have been inserted. */
export function fixtureDatabaseTotals(): DatabaseTotals {
  return { checks: 2, runs: 1, observations: 1 };
}

/** The database's own count of checks by status, for the same records. */
export function fixtureStatusTotals(): StatusTotals {
  return { Proven: 1, Unproven: 1, Broken: 0, Stale: 0, Unarmed: 0 };
}

/**
 * The export those records and summaries produce.
 *
 * Both are arguments so that a test can hand it a variant, such as the replay
 * or the run that settled nothing above, without a second copy of everything
 * else the build needs.
 */
export function fixtureSnapshot(
  contents: LedgerContents = fixtureContents(),
  summaries: readonly CheckSummary[] = fixtureSummaries(),
): PublishedLedger {
  return buildSnapshot({
    contents,
    summaries,
    ledgerPath: fixtureLedgerPath,
    repository: 'async-digital-ltd/seen-to-fail',
    builtFrom: fixtureCommit,
    builtOn: fixtureAsOf,
    staleAfterDays: 30,
    recordingCommits: new Map([
      [
        `${fixtureLedgerPath}/runs/2026-09-10-first-check-abcdef123456.json`,
        '1234567890abcdef1234567890abcdef12345678',
      ],
    ]),
  });
}
