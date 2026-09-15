import { STATUSES } from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import { STALE_AFTER_DAYS } from '../staleness.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import type { IsoDate } from './rows.ts';
import { seedChecks, seedWorkspace } from './seed.ts';
import { listCheckSummaries } from './summaries.ts';
import type { CheckSummary } from './summaries.ts';

/**
 * What the seed claims about itself, read back off a real PostgreSQL.
 *
 * The seed exists so that every status can be seen working, and that claim is
 * only worth anything if something checks it. So these tests load the workspace
 * and read it through the same derivation the application reads it through,
 * rather than through a second copy of the rules. A record that stops reaching
 * the status it was written for fails here, on the day it is edited, instead of
 * turning up as a status tile that is always empty.
 *
 * Nothing pins a day. The workspace is dated back from the day it is loaded, so
 * the day it is read as of is the day the seed returns, and the two cannot fall
 * either side of midnight.
 */
const database = useTestDatabase();

const millisecondsPerDay = 86_400_000;

interface SeededWorkspace {
  /** The day the workspace was dated back from, and is read as of. */
  readonly asOf: IsoDate;
  /** Each check's summary, found by the check's name. */
  readonly byName: ReadonlyMap<string, CheckSummary>;
}

/**
 * Loads the workspace and reads every summary back, keyed by name.
 *
 * A summary carries an id and no name, so the names come from the checks table
 * and are joined on here. The default threshold is used throughout: the point
 * is what a reader of the running application sees, not what some other
 * threshold would show.
 */
async function seedAndRead(): Promise<SeededWorkspace> {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);

  const named = await client.query<{ id: string; name: string }>(
    'SELECT id, name FROM checks',
  );
  const nameOf = new Map<string, string>();
  for (const row of named.rows) {
    nameOf.set(row.id, row.name);
  }

  const byName = new Map<string, CheckSummary>();
  for (const summary of await listCheckSummaries(client, asOf)) {
    const name = nameOf.get(summary.checkId);
    if (name === undefined) {
      throw new Error('A summary came back for a check that is not there.');
    }
    byName.set(name, summary);
  }

  return { asOf, byName };
}

function summaryFor(workspace: SeededWorkspace, name: string): CheckSummary {
  const summary = workspace.byName.get(name);
  if (summary === undefined) {
    throw new Error(`The seeded workspace has no check called ${name}.`);
  }
  return summary;
}

/** A day the summary should have, named so a missing one says which. */
function dayOf(day: IsoDate | null, what: string): IsoDate {
  if (day === null) {
    throw new Error(`The summary has no ${what}.`);
  }
  return day;
}

/** How many days apart two days are, worked out from the days themselves. */
function daysBetween(from: IsoDate, to: IsoDate): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return (start - end) / millisecondsPerDay;
}

it('loads a workspace of eight checks', async () => {
  const workspace = await seedAndRead();

  expect(seedChecks).toHaveLength(8);
  expect(workspace.byName.size).toBe(8);
});

it('reports what it wrote', async () => {
  const result = await seedWorkspace(database.client());

  expect(result.checkCount).toBe(8);
  expect(result.runCount).toBe(9);
  expect(result.observationCount).toBe(8);
  // The day is the day it ran, so the shape is what there is to assert.
  expect(result.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it('shows every status the vocabulary has', async () => {
  const workspace = await seedAndRead();

  const present = new Set(
    [...workspace.byName.values()].map((summary) => summary.status),
  );

  expect([...present].sort()).toEqual([...STATUSES].sort());
});

it('derives the status each check was written to show', async () => {
  const workspace = await seedAndRead();

  const derived: Record<string, string> = {};
  for (const [name, summary] of workspace.byName) {
    derived[name] = summary.status;
  }

  const intended: Record<string, string> = {};
  for (const check of seedChecks) {
    intended[check.name] = check.intendedStatus;
  }

  expect(derived).toEqual(intended);
});

it('reaches Unarmed by both of the routes the rule has', async () => {
  const workspace = await seedAndRead();

  const nothingRecorded = summaryFor(workspace, 'Release notes present');
  const switchedOff = summaryFor(workspace, 'Dependency licence allow-list');

  expect(nothingRecorded.status).toBe('Unarmed');
  expect(switchedOff.status).toBe('Unarmed');

  // The first route: nothing has been run against it and no observation has
  // ever said it is on. Having no runs at all is what puts this check on that
  // route and off the other one, which only applies to a check that has some.
  expect(nothingRecorded.runCount).toBe(0);
  expect(nothingRecorded.lastRunOn).toBeNull();
  expect(nothingRecorded.lastArmed).toBeNull();

  // The second route: it caught a planted defect, and was then seen switched
  // off more recently than that run. Having a run is what keeps it off the
  // first route, so the two checks are Unarmed for genuinely different reasons
  // rather than by the same rule twice.
  expect(switchedOff.caughtCount).toBeGreaterThan(0);
  expect(switchedOff.lastRunOn).not.toBeNull();
  expect(switchedOff.lastArmed).toBe(false);
  expect(switchedOff.lastSeenArmedOn).not.toBeNull();
});

it('dates no run on the staleness boundary', () => {
  const offsets = seedChecks.flatMap((check) =>
    (check.runs ?? []).map((run) => run.daysAgo),
  );

  // A catch dated exactly on the threshold is Proven by one comparison and
  // Stale by the next one along, and the filter language's age comparisons are
  // strict at both ends, so such a run would sit in neither half of a
  // partition. Keeping the seed clear of the boundary keeps a later test of
  // those filters reading the filter rather than this choice.
  expect(offsets).not.toContain(STALE_AFTER_DAYS);
});

it('counts its dates back from the day it returns', async () => {
  const workspace = await seedAndRead();

  const proven = summaryFor(workspace, 'Test suite required to merge');
  const stale = summaryFor(workspace, 'Secrets never committed');
  const broken = summaryFor(workspace, 'No focused tests left behind');

  const { asOf } = workspace;

  expect(daysBetween(asOf, dayOf(proven.lastRunOn, 'latest run'))).toBe(3);
  expect(daysBetween(asOf, dayOf(stale.lastCaughtOn, 'latest catch'))).toBe(71);
  expect(daysBetween(asOf, dayOf(broken.lastRunOn, 'latest run'))).toBe(5);
  expect(daysBetween(asOf, dayOf(broken.lastCaughtOn, 'latest catch'))).toBe(
    20,
  );
});

it('replaces its own workspace when it is run again', async () => {
  const first = await seedAndRead();
  const second = await seedAndRead();

  expect(second.byName.size).toBe(first.byName.size);

  const statusesOf = (workspace: SeededWorkspace): Record<string, string> => {
    const statuses: Record<string, string> = {};
    for (const [name, summary] of workspace.byName) {
      statuses[name] = summary.status;
    }
    return statuses;
  };

  expect(statusesOf(second)).toEqual(statusesOf(first));
});
