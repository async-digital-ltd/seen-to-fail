import { expect, it } from 'vitest';

import {
  fixtureContents,
  fixtureContentsFromAReplay,
  fixtureContentsWithAnUnsettledRun,
  fixtureDatabaseTotals,
  fixtureLedgerPath,
  fixtureSnapshot,
  fixtureStatusTotals,
  fixtureSummaries,
  fixtureSummariesWithAnUnsettledRun,
} from '../testing/ledger.ts';
import { ledgerCheckUuid, ledgerFileUuid } from './identity.ts';
import { renderPage } from './page.ts';
import type { PublishedLedger, PublishedRun } from './snapshot.ts';
import { disagreements } from './verify.ts';
import type { VerificationInput } from './verify.ts';

/**
 * The guard that decides whether anything is published.
 *
 * Most tests below plant one disagreement and expect it to be found. The rest
 * plant nothing and expect nothing, and the first of them is the one that makes
 * the others mean anything: with nothing planted the guard finds nothing, so a
 * guard that reported a problem whatever it was given would fail there rather
 * than looking vigilant.
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
    summaries: fixtureSummaries(),
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
 * A page built at the commit that added one of its runs names that commit
 * twice over: on its "Built from" lines, and inside that run's `Recorded in`
 * link. A guard that looked for the commit anywhere on the page found it in
 * the row whatever the lines said, which is the defect #141 removed from the
 * CI step (#164).
 */
it('refuses "Built from" lines naming another commit, though a run row names the right one', () => {
  const input = sound();
  const built = input.snapshot.builtFrom;
  const snapshot: PublishedLedger = {
    ...input.snapshot,
    checks: input.snapshot.checks.map((check) => ({
      ...check,
      runs: check.runs.map((run) => ({ ...run, recordedIn: built })),
    })),
  };
  const page = renderPage(snapshot);
  const stamp = (commit: string): string =>
    `Built from commit <a href="https://github.com/${snapshot.repository}/commit/${commit}"><code>${commit.slice(0, 7)}</code></a>`;
  const planted = page.replaceAll(
    stamp(built),
    stamp('0123456789abcdef0123456789abcdef01234567'),
  );

  // The plant is the one described: both lines moved, and a row still names
  // the commit the page was built from.
  expect(page.split(stamp(built))).toHaveLength(3);
  expect(planted).not.toContain(stamp(built));
  expect(planted).toContain(built.slice(0, 7));

  expect(disagreements({ ...input, snapshot, page })).toStrictEqual([]);
  expect(
    disagreements({ ...input, snapshot, page: planted }).join('\n'),
  ).toContain(`does not name ${built}`);
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

/**
 * The same ledger with a run that settled nothing in it, so the comparisons
 * about that outcome have something to compare. The database totals gain the
 * extra run, because those are counted off the tables rather than derived.
 */
function soundUnsettled(): VerificationInput {
  const contents = fixtureContentsWithAnUnsettledRun();
  const snapshot = fixtureSnapshot(
    contents,
    fixtureSummariesWithAnUnsettledRun(),
  );
  const totals = fixtureDatabaseTotals();
  return {
    ...sound(),
    contents,
    snapshot,
    page: renderPage(snapshot),
    databaseTotals: { ...totals, runs: totals.runs + 1 },
    summaries: fixtureSummariesWithAnUnsettledRun(),
  };
}

/** The same input, with one published run changed. */
function withUnsettledRun(
  change: (run: PublishedRun) => PublishedRun,
): VerificationInput {
  const input = soundUnsettled();
  const snapshot = {
    ...input.snapshot,
    checks: input.snapshot.checks.map((check) => ({
      ...check,
      runs: check.runs.map(change),
    })),
  };
  return { ...input, snapshot, page: renderPage(snapshot) };
}

it('finds nothing wrong with a ledger whose newest run settled nothing', () => {
  expect(disagreements(soundUnsettled())).toEqual([]);
});

/**
 * The one this outcome exists to stop, at the last step before publishing: a
 * run whose file says it settled nothing, published as a catch. Every count
 * the build takes off the database still agrees, because the database was
 * given the file's own outcome; what disagrees is the row that reached the
 * export.
 */
it('finds a run published as a catch when its record settled nothing', () => {
  const found = disagreements(
    withUnsettledRun((run) =>
      run.outcome === 'inconclusive'
        ? { ...run, outcome: 'caught', inconclusiveReason: null }
        : run,
    ),
  );

  expect(found.join('\n')).toContain('what the check did');
});

it('finds a run published without the reason its record gives', () => {
  const found = disagreements(
    withUnsettledRun((run) =>
      run.outcome === 'inconclusive'
        ? { ...run, inconclusiveReason: 'Something else entirely.' }
        : run,
    ),
  );

  expect(found.join('\n')).toContain('why it settled nothing');
});

/**
 * The count and the date that travel with the status. A build that folded a
 * run that settled nothing into one of the other tallies, or that published a
 * last-settled date the records do not support, is published saying the
 * evidence is fresher than it is.
 */
it('finds a count of runs that settled nothing which the records do not support', () => {
  const input = soundUnsettled();
  const found = disagreements({
    ...input,
    snapshot: {
      ...input.snapshot,
      checks: input.snapshot.checks.map((check) => ({
        ...check,
        inconclusiveCount: 0,
      })),
    },
  });

  expect(found.join('\n')).toContain('settled nothing');
});

it('finds a last-settled date that no run supports', () => {
  const input = soundUnsettled();
  const found = disagreements({
    ...input,
    snapshot: {
      ...input.snapshot,
      checks: input.snapshot.checks.map((check) => ({
        ...check,
        lastSettledOn: check.lastRunOn,
      })),
    },
  });

  expect(found.join('\n')).toContain('last settled');
});

/** The file of a second catch, on the same day as the fixture's first. */
const tiedRunFile = 'runs/2026-09-10-first-check-0123456789ab.json';

/**
 * The ids of the two tied runs: the one with the larger id, which is the run
 * the status is read from, and the other.
 */
function tiedIds(): { readonly latest: string; readonly other: string } {
  const [first] = fixtureContents().runs;
  if (first === undefined) {
    throw new Error('The fixture has no runs.');
  }
  const [one, two] = [first.file, tiedRunFile].map((file) =>
    ledgerFileUuid(`${fixtureLedgerPath}/${file}`),
  ) as [string, string];
  return one > two ? { latest: one, other: two } : { latest: two, other: one };
}

/**
 * The fixture with a second catch on the first check's day, so the check holds
 * two runs that tie on the day and the outcome, and the run its status was
 * read from is one of two candidates rather than the only one.
 *
 * The summary names whichever of the two has the larger id, worked out here
 * from the ids themselves rather than by sorting, so this does not borrow the
 * exporter's order to describe what the exporter should have produced.
 */
function soundTied(): VerificationInput {
  const base = fixtureContents();
  const [first] = base.runs;
  if (first === undefined) {
    throw new Error('The fixture has no runs.');
  }
  const contents = {
    ...base,
    runs: [
      ...base.runs,
      { file: tiedRunFile, record: { ...first.record, planted: 'Another.' } },
    ],
  };
  const { latest } = tiedIds();
  const summaries = fixtureSummaries().map((summary) =>
    summary.checkId === ledgerCheckUuid('first-check')
      ? {
          ...summary,
          runCount: 2,
          caughtCount: 2,
          latestSettledRunId: latest,
        }
      : summary,
  );
  const snapshot = fixtureSnapshot(contents, summaries);
  const totals = fixtureDatabaseTotals();
  return {
    ...sound(),
    contents,
    snapshot,
    page: renderPage(snapshot),
    databaseTotals: { ...totals, runs: totals.runs + 1 },
    summaries,
  };
}

it('finds nothing wrong when two tied runs head the table the way the status was read', () => {
  expect(disagreements(soundTied())).toEqual([]);
});

/**
 * The class #108 is about: a table headed by one run and a status read from
 * another. Every count and date agrees, because the two runs tie on both the
 * day and the outcome; only which run comes first differs.
 */
it('finds a table headed by a different run from the one the status was read from', () => {
  const input = soundTied();
  const snapshot = {
    ...input.snapshot,
    checks: input.snapshot.checks.map((check) => ({
      ...check,
      runs: [...check.runs].reverse(),
    })),
  };
  const found = disagreements({
    ...input,
    snapshot,
    page: renderPage(snapshot),
  });

  const { latest, other } = tiedIds();
  expect(found).toEqual([
    `The check first-check: the status was read from the run ${latest}, and the first run in the export that settled anything is the run ${other}.`,
  ]);
});

/** The same disagreement from the other side: the export is right, the status is not. */
it('finds a status read from the other of two tied runs than the one the export heads its table with', () => {
  const input = soundTied();
  const { latest, other } = tiedIds();
  const found = disagreements({
    ...input,
    summaries: input.summaries.map((summary) =>
      summary.latestSettledRunId === latest
        ? { ...summary, latestSettledRunId: other }
        : summary,
    ),
  });

  expect(found).toEqual([
    `The check first-check: the status was read from the run ${other}, and the first run in the export that settled anything is the run ${latest}.`,
  ]);
});

/**
 * A status the derivation says was read from no run, above a table headed by
 * a catch. The refusal says what the absence means rather than printing it.
 */
it('says a status was read from no run, rather than from "null"', () => {
  const input = soundTied();
  const found = disagreements({
    ...input,
    summaries: input.summaries.map((summary) => ({
      ...summary,
      latestSettledRunId: null,
    })),
  });

  expect(found).toHaveLength(1);
  expect(found.join('\n')).toContain(
    'the status was read from no run, because none settled anything',
  );
  expect(found.join('\n')).not.toContain('null');
});

/**
 * A check handed to the guard with no summary at all. The build cannot get
 * here, because buildSnapshot refuses first, so this is the only place the
 * refusal is seen.
 */
it('finds a check with no status derived for it', () => {
  const input = sound();
  const found = disagreements({
    ...input,
    summaries: input.summaries.filter(
      (summary) => summary.checkId !== ledgerCheckUuid('first-check'),
    ),
  });

  expect(found).toEqual([
    'The check first-check has no status derived for it.',
  ]);
});
