import { expect, it } from 'vitest';

import {
  fixtureContents,
  fixtureContentsFromAReplay,
  fixtureDatabaseTotals,
  fixtureLedgerPath,
  fixtureSnapshot,
  fixtureStatusTotals,
} from '../testing/ledger.ts';
import { renderPage } from './page.ts';
import type { PublishedLedger, PublishedRun } from './snapshot.ts';
import { disagreements } from './verify.ts';
import type { VerificationInput } from './verify.ts';

/**
 * The guard that decides whether anything is published.
 *
 * Every test below plants one disagreement and expects it to be found. The
 * first test is the one that makes the rest mean anything: with nothing planted
 * the guard finds nothing, so a guard that reported a problem whatever it was
 * given would fail here rather than looking vigilant.
 */

function sound(): VerificationInput {
  const snapshot = fixtureSnapshot();
  return {
    contents: fixtureContents(),
    snapshot,
    page: renderPage(snapshot),
    ledgerPath: fixtureLedgerPath,
    databaseTotals: fixtureDatabaseTotals(),
    statusTotals: fixtureStatusTotals(),
  };
}

/** The same input, with the export changed and the page rebuilt from it. */
function withSnapshot(
  change: (snapshot: PublishedLedger) => PublishedLedger,
): VerificationInput {
  const snapshot = change(fixtureSnapshot());
  return { ...sound(), snapshot, page: renderPage(snapshot) };
}

it('finds nothing wrong with a build that agrees with its record', () => {
  expect(disagreements(sound())).toEqual([]);
});

it('finds a run the export left out', () => {
  const found = disagreements(
    withSnapshot((snapshot) => ({
      ...snapshot,
      checks: snapshot.checks.map((check) => ({ ...check, runs: [] })),
    })),
  );
  expect(found.join('\n')).toContain('The number of runs published');
});

it('finds a check the export left out', () => {
  const found = disagreements(
    withSnapshot((snapshot) => ({
      ...snapshot,
      checks: snapshot.checks.slice(1),
    })),
  );
  expect(found.join('\n')).toContain('is recorded and not published');
});

it('finds a check the export invented', () => {
  const found = disagreements(
    withSnapshot((snapshot) => {
      const [first] = snapshot.checks;
      if (first === undefined) {
        throw new Error('The fixture has no checks.');
      }
      return {
        ...snapshot,
        checks: [...snapshot.checks, { ...first, id: 'made-up', runs: [] }],
      };
    }),
  );
  expect(found.join('\n')).toContain('is published and is not recorded');
});

it('finds a count that does not match the runs behind it', () => {
  const found = disagreements(
    withSnapshot((snapshot) => ({
      ...snapshot,
      checks: snapshot.checks.map((check) => ({
        ...check,
        caughtCount: check.caughtCount + 1,
      })),
    })),
  );
  expect(found.join('\n')).toContain('caught');
});

it('finds a last-caught date that no run supports', () => {
  const found = disagreements(
    withSnapshot((snapshot) => ({
      ...snapshot,
      checks: snapshot.checks.map((check) => ({
        ...check,
        lastCaughtOn: '2026-09-17',
      })),
    })),
  );
  expect(found.join('\n')).toContain('last caught');
});

/**
 * The insert is a step between the files and the statuses, and a record it
 * dropped would be missing from every number the database derived without
 * anything raising.
 */
it('finds a record the database did not end up holding', () => {
  expect(
    disagreements({
      ...sound(),
      databaseTotals: { ...fixtureDatabaseTotals(), runs: 0 },
    }).join('\n'),
  ).toContain('The number of runs in the database');
});

/**
 * The export counts its own tiles and the database counts the same thing
 * separately. Comparing the tiles with the rows they sit above is the only way
 * a tile saying five over four rows gets noticed.
 */
it('finds tiles that disagree with the database count', () => {
  expect(
    disagreements({
      ...sound(),
      statusTotals: { ...fixtureStatusTotals(), Proven: 2 },
    }).join('\n'),
  ).toContain('Proven');
});

it('finds an export naming a file that is not in the ledger', () => {
  const found = disagreements(
    withSnapshot((snapshot) => ({
      ...snapshot,
      checks: snapshot.checks.map((check) => ({
        ...check,
        runs: check.runs.map((run) => ({
          ...run,
          sourceFile: 'ledger/runs/nothing-wrote-this.json',
        })),
      })),
    })),
  );
  expect(found.join('\n')).toContain('nothing-wrote-this.json');
});

it('finds a check the page left out although the export holds it', () => {
  const input = sound();
  const [first] = input.snapshot.checks;
  if (first === undefined) {
    throw new Error('The fixture has no checks.');
  }
  const found = disagreements({
    ...input,
    page: input.page.replaceAll(first.name, 'something else'),
  });
  expect(found.join('\n')).toContain('its name is not on the page');
});

it('refuses a page that carries a script', () => {
  const input = sound();
  expect(
    disagreements({
      ...input,
      page: `${input.page}<script>fetch('/graphql')</script>`,
    }).join('\n'),
  ).toContain('script');
});

it('refuses a page that does not name the commit it was built from', () => {
  const input = sound();
  expect(
    disagreements({
      ...input,
      page: input.page.replaceAll(
        input.snapshot.builtFrom.slice(0, 7),
        'zzzzzzz',
      ),
    }).join('\n'),
  ).toContain('the commit it was built from');
});

/**
 * The same ledger read as a replay, so the provenance comparison has something
 * to compare. Without this the fixture's only run is hand-written with two
 * nulls beside it, and a build that published every run as hand-written would
 * agree with it exactly.
 */
function soundReplay(): VerificationInput {
  const contents = fixtureContentsFromAReplay();
  const snapshot = fixtureSnapshot(contents);
  return { ...sound(), contents, snapshot, page: renderPage(snapshot) };
}

/** The same input, with one run's published fields changed. */
function withRun(
  change: (run: PublishedRun) => PublishedRun,
): VerificationInput {
  const input = soundReplay();
  const snapshot = {
    ...input.snapshot,
    checks: input.snapshot.checks.map((check) => ({
      ...check,
      runs: check.runs.map(change),
    })),
  };
  return { ...input, snapshot, page: renderPage(snapshot) };
}

it('finds nothing wrong with a replay that agrees with its record', () => {
  expect(disagreements(soundReplay())).toEqual([]);
});

/**
 * A run published as one somebody typed in when a job recorded it. Every count
 * still adds up, the page still renders, and the answer to the question this
 * story exists to answer is wrong.
 */
it('finds a run published as coming from somewhere it did not', () => {
  const found = disagreements(
    withRun((run) => ({
      ...run,
      source: 'hand',
      sourceCommit: null,
      sourceRunUrl: null,
    })),
  );

  expect(found.join('\n')).toContain('where it came from');
});

it('finds a replay published against a commit its record does not name', () => {
  const found = disagreements(
    withRun((run) => ({
      ...run,
      sourceCommit: '0000000000000000000000000000000000000000',
    })),
  );

  expect(found.join('\n')).toContain('the commit it ran against');
});

it('finds a replay published with a run link its record does not name', () => {
  const found = disagreements(
    withRun((run) => ({
      ...run,
      sourceRunUrl: 'https://ci.example.com/runs/other',
    })),
  );

  expect(found.join('\n')).toContain('the run that produced it');
});
