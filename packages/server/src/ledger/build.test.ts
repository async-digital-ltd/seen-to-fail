import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, it } from 'vitest';

import { listCheckSummaries } from '../database/summaries.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { writeTemporaryLedger } from '../testing/ledger.ts';
import {
  buildLedger,
  exportFilename,
  LedgerRefusedError,
  pageFilename,
} from './build.ts';
import type { BuildResult } from './build.ts';
import { ledgerCheckUuid } from './identity.ts';
import { recordRun } from './record.ts';
import type { PublishedLedger } from './snapshot.ts';

/**
 * The build, end to end, against a real PostgreSQL: files in a directory, in
 * through the migrations and the status function, out as a page and an export.
 *
 * The status rules are not retested here; they have their own tests. What is
 * tested is that the published output is the record, derived by the one
 * derivation, with nothing lost on the way and nothing invented.
 *
 * One thing is deliberately not tested here, and it is worth saying why. The
 * build refuses to publish when the record and the export disagree, and there
 * is no way to make them disagree through the build's inputs: the disagreement
 * would have to come from a fault in the exporter itself. So that guard is
 * tested against planted disagreements in verify.test.ts, over pages and
 * exports the real builder produced, and it has also been watched refusing a
 * defect planted in the exporter by hand, which is recorded as a run in this
 * repository's own ledger.
 */

const database = useTestDatabase();

/** The day every fixture below is read as of, and dated against. */
const asOf = '2026-09-18';

/** The commit the build pretends to be running against. */
const builtFrom = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** The commit a recorded run pretends to have been recorded by. */
const recordedIn = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const repository = 'async-digital-ltd/seen-to-fail';

const check = {
  id: 'ci-lint',
  name: 'Lint',
  area: 'CI',
  protects: 'A lint rule being broken on main.',
  howToTellArmed: 'The step appears in the run list.',
};

async function build(
  directory: string,
  recordingCommits: ReadonlyMap<string, string> = new Map(),
): Promise<BuildResult & { readonly outputDirectory: string }> {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'seen-to-fail-site-'));
  const result = await buildLedger(database.client(), {
    directory,
    ledgerPath: 'ledger',
    outputDirectory,
    repository,
    builtFrom,
    recordingCommits,
    asOf,
  });
  return { ...result, outputDirectory };
}

it('publishes a check with the status the record gives it', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'runs/one.json': {
      checkId: 'ci-lint',
      runOn: '2026-09-18',
      planted: 'A rule violation.',
      expected: 'The lint step fails.',
      outcome: 'caught',
    },
  });

  const { ledger } = await build(directory);
  expect(ledger.checks.map((published) => published.status)).toEqual([
    'Proven',
  ]);
  expect(ledger.statusCounts.Proven).toBe(1);
});

/**
 * A run recorded by the step a job runs, appearing on the page, with the commit
 * that recorded it reachable from it. This is the whole path the story is
 * about, minus the job, and the job runs exactly this code.
 */
it('shows a run recorded by the recorder, and the commit that recorded it', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  const recorded = await recordRun({
    directory,
    today: asOf,
    input: {
      checkId: 'ci-lint',
      runOn: asOf,
      planted: 'A rule violation.',
      expected: 'The lint step fails.',
      outcome: 'caught',
    },
  });
  if (!recorded.ok) {
    throw new Error('The run was refused.');
  }

  const { page, ledger } = await build(
    directory,
    new Map([[`ledger/${recorded.file}`, recordedIn]]),
  );

  expect(page).toContain('A rule violation.');
  expect(page).toContain(
    `https://github.com/${repository}/commit/${recordedIn}`,
  );
  expect(ledger.checks[0]?.runs[0]?.sourceFile).toBe(`ledger/${recorded.file}`);
});

/**
 * A run that settled nothing, all the way through: recorded by the step a job
 * runs, loaded into the database, read back through the status function, and
 * published.
 *
 * The check is Proven from a catch three weeks earlier and stays Proven with
 * a newer run that settled nothing against it. Every step between the file and
 * the page has its own tests; this is the one that says they agree with each
 * other, and it is the path a replay whose plant has stopped applying takes.
 */
it('publishes a run that settled nothing without moving the status', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  const caught = await recordRun({
    directory,
    today: asOf,
    input: {
      checkId: 'ci-lint',
      runOn: '2026-08-28',
      planted: 'A rule violation.',
      expected: 'The lint step fails.',
      outcome: 'caught',
    },
  });
  const toldNothing = await recordRun({
    directory,
    today: asOf,
    input: {
      checkId: 'ci-lint',
      runOn: asOf,
      planted: 'A rule violation.',
      expected: 'The lint step fails.',
      outcome: 'inconclusive',
      inconclusiveReason:
        'The anchor matches 0 times in the file and has to match once.',
      source: 'replay',
      sourceCommit: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      sourceRunUrl: 'https://ci.example.com/runs/91',
    },
  });
  if (!caught.ok || !toldNothing.ok) {
    throw new Error('A run was refused.');
  }

  const { page, ledger } = await build(directory);
  const published = ledger.checks[0];

  expect(published?.status).toBe('Proven');
  expect(published?.inconclusiveCount).toBe(1);
  expect(published?.caughtCount).toBe(1);
  expect(published?.missedCount).toBe(0);
  // The status is as old as the catch, and the newest run is the later one.
  expect(published?.lastSettledOn).toBe('2026-08-28');
  expect(published?.lastRunOn).toBe(asOf);
  expect(page).toContain('settled nothing');
  expect(page).toContain('The anchor matches 0 times in the file');
});

/**
 * The acceptance criterion this whole design turns on: the published statuses
 * are the database's, not a second implementation's. The database is asked
 * again here, by this test rather than by the build, and the two answers are
 * compared.
 */
it('publishes the statuses the check_summaries function derives', async () => {
  const directory = await writeTemporaryLedger({
    'checks/proven.json': { ...check, id: 'proven', name: 'Proven' },
    'checks/broken.json': { ...check, id: 'broken', name: 'Broken' },
    'checks/stale.json': { ...check, id: 'stale', name: 'Stale' },
    'checks/unproven.json': { ...check, id: 'unproven', name: 'Unproven' },
    'checks/unarmed.json': { ...check, id: 'unarmed', name: 'Unarmed' },
    'runs/proven.json': {
      checkId: 'proven',
      runOn: '2026-09-18',
      planted: 'A defect.',
      expected: 'It fails.',
      outcome: 'caught',
    },
    'runs/broken.json': {
      checkId: 'broken',
      runOn: '2026-09-18',
      planted: 'A defect.',
      expected: 'It fails.',
      outcome: 'missed',
    },
    'runs/stale.json': {
      checkId: 'stale',
      runOn: '2026-07-01',
      planted: 'A defect.',
      expected: 'It fails.',
      outcome: 'caught',
    },
    'observations/unproven.json': {
      checkId: 'unproven',
      observedOn: '2026-09-18',
      armed: true,
    },
  });

  const { ledger } = await build(directory);
  const derived = new Map(
    (await listCheckSummaries(database.client(), asOf)).map((summary) => [
      summary.checkId,
      summary,
    ]),
  );

  expect(ledger.checks).toHaveLength(5);
  for (const published of ledger.checks) {
    const summary = derived.get(ledgerCheckUuid(published.id));
    expect(summary).toBeDefined();
    expect(published.status).toBe(summary?.status);
    expect(published.runCount).toBe(summary?.runCount);
    expect(published.caughtCount).toBe(summary?.caughtCount);
    expect(published.lastCaughtOn).toBe(summary?.lastCaughtOn);
    expect(published.lastArmed).toBe(summary?.lastArmed);
  }

  // All five statuses, which is what makes this a test of the derivation rather
  // than of one branch of it.
  expect(
    [...new Set(ledger.checks.map((published) => published.status))].sort(),
  ).toEqual(['Broken', 'Proven', 'Stale', 'Unarmed', 'Unproven']);
});

/**
 * Nothing in the published output needs a running server: two files, no script,
 * and nothing fetched. The directory listing is part of the claim, because a
 * third file nobody accounted for is a dependency nobody accounted for.
 */
it('writes a page and an export, and nothing else', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  const { outputDirectory } = await build(directory);
  expect((await readdir(outputDirectory)).sort()).toEqual(
    [exportFilename, pageFilename].sort(),
  );

  const page = await readFile(join(outputDirectory, pageFilename), 'utf8');
  expect(page).not.toMatch(/<script/i);
  expect(page).not.toMatch(/fetch\(/);
});

it('writes an export the page was rendered from', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });

  const { outputDirectory, ledger } = await build(directory);
  const written: PublishedLedger = JSON.parse(
    await readFile(join(outputDirectory, exportFilename), 'utf8'),
  ) as PublishedLedger;

  expect(written).toEqual(ledger);
});

/**
 * The build replaces the workspace rather than adding to it, so a record that
 * was taken out of the ledger is taken off the page. Without this, a run
 * deleted from the repository would keep being published from a row nobody can
 * see.
 */
it('publishes what the ledger holds now, not what it held before', async () => {
  const withARun = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'runs/one.json': {
      checkId: 'ci-lint',
      runOn: '2026-09-18',
      planted: 'A rule violation.',
      expected: 'The lint step fails.',
      outcome: 'caught',
    },
  });
  await build(withARun);

  const withoutIt = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
  });
  const { ledger } = await build(withoutIt);

  expect(ledger.checks[0]?.runCount).toBe(0);
  expect(ledger.checks[0]?.status).toBe('Unarmed');
});

it('refuses a ledger that does not load, and writes nothing', async () => {
  const directory = await writeTemporaryLedger({
    'checks/ci-lint.json': check,
    'runs/one.json': {
      checkId: 'ci-lint',
      runOn: '2026-09-18',
      planted: 'A rule violation.',
      expected: 'The lint step fails.',
      outcome: 'passed',
    },
  });

  const outputDirectory = await mkdtemp(join(tmpdir(), 'seen-to-fail-site-'));
  await expect(
    buildLedger(database.client(), {
      directory,
      ledgerPath: 'ledger',
      outputDirectory,
      repository,
      builtFrom,
      recordingCommits: new Map(),
      asOf,
    }),
  ).rejects.toThrow(LedgerRefusedError);

  expect(await readdir(outputDirectory)).toEqual([]);
});
