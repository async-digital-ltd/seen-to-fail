import { STATUSES } from '@seen-to-fail/filter';
import type { Status } from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import { STALE_AFTER_DAYS } from '../staleness.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { listCheckSummaries } from './summaries.ts';
import type { CheckSummary } from './summaries.ts';
import {
  outcomeSettlesSomething,
  settledOutcomes,
  testRunOutcomes,
  unsettledOutcomes,
} from './rows.ts';
import type { IsoDate, TestRunOutcome } from './rows.ts';

/**
 * Every rule in the status table, and every boundary between two of them, read
 * off a real PostgreSQL.
 *
 * The rules are a table in the epic, so they are a table here: one fixture per
 * row, each naming the rule it exercises, and each reached only by that rule.
 * Written that way, a rule deleted from the function takes at least one of
 * these rows down with it, which is the whole point of the exercise. The tests
 * below the table are the ones that are not about a single rule: the counts and
 * dates that travel beside a status, the threshold being a parameter, and the
 * day being one too.
 *
 * Nothing here reads the clock. The day the fixtures are read as of is pinned,
 * and every fixture is dated back from it, so the same rows give the same
 * answer today and next year.
 */
const database = useTestDatabase();

/** The day every fixture below is read as of. */
const asOf: IsoDate = '2026-03-01';

/** The same day as a UTC instant, which is what the arithmetic below needs. */
const asOfInstant = Date.UTC(2026, 2, 1);

const millisecondsPerDay = 86_400_000;

/**
 * A day some whole number of days before the day the fixtures are read as of.
 *
 * Built in UTC at both ends, so it cannot land on the day before in one time
 * zone and the right one in another. The first test checks it against days
 * worked out by hand, because a fixture dated by a broken helper would read as
 * evidence rather than as a mistake.
 */
function daysBefore(days: number): IsoDate {
  return new Date(asOfInstant - days * millisecondsPerDay)
    .toISOString()
    .slice(0, 10);
}

/** The day the two same day fixtures put both of their runs on. */
const sharedDay = daysBefore(3);

/**
 * What a run that settled nothing says about why, on every fixture that has
 * one.
 *
 * The same sentence throughout, because none of these tests is about what the
 * reason says. The database insists there is one, and these tests are about
 * what the derivation does with the row it is on.
 */
const settledNothingBecause = 'The anchor no longer matches, so nothing broke.';

interface RunFixture {
  readonly runOn: IsoDate;
  readonly outcome: TestRunOutcome;
  /**
   * When the run was written down. Pinned only where two runs share a day and
   * the order they were recorded in is what decides which is latest. Left out
   * everywhere else, where the row is written now and the day it happened is
   * the only thing that matters.
   */
  readonly createdAt?: string;
  /**
   * What a replay recorded about itself, on the fixtures that are about a run
   * nobody typed in. Absent everywhere else.
   */
  readonly replay?: {
    readonly commit: string;
    readonly runUrl: string;
  };
}

interface ObservationFixture {
  readonly observedOn: IsoDate;
  readonly armed: boolean;
}

interface CheckFixture {
  /** The check's name, which is also what the test is called. */
  readonly name: string;
  readonly runs?: readonly RunFixture[];
  readonly observations?: readonly ObservationFixture[];
}

/** Inserts a check and everything recorded against it, and returns its id. */
async function insertCheck(fixture: CheckFixture): Promise<string> {
  const inserted = await database.client().query<{ id: string }>(
    `INSERT INTO checks (name, area, protects, how_to_tell_armed)
     VALUES ($1, 'Continuous integration', 'A defect reaching main',
             'The job shows in the run list')
     RETURNING id`,
    [fixture.name],
  );

  const id = inserted.rows[0]?.id;
  if (id === undefined) {
    throw new Error('Inserting a check returned no id.');
  }

  for (const run of fixture.runs ?? []) {
    await database.client().query(
      `INSERT INTO test_runs
         (check_id, run_on, planted, expected, outcome, inconclusive_reason,
          created_at, source, source_commit, source_run_url)
       VALUES ($1, $2, 'A removed semicolon', 'The job fails', $3, $4,
               coalesce($5::timestamptz, now()),
               $6, $7, $8)`,
      [
        id,
        run.runOn,
        run.outcome,
        // Filled in from the outcome rather than asked of each fixture. A run
        // that settled nothing needs one and a run that settled something is
        // refused for carrying one, so there is no fixture that could
        // reasonably say anything else.
        outcomeSettlesSomething[run.outcome] ? null : settledNothingBecause,
        run.createdAt ?? null,
        run.replay === undefined ? 'hand' : 'replay',
        run.replay?.commit ?? null,
        run.replay?.runUrl ?? null,
      ],
    );
  }

  for (const observation of fixture.observations ?? []) {
    await database.client().query(
      `INSERT INTO arming_observations (check_id, observed_on, armed)
         VALUES ($1, $2, $3)`,
      [id, observation.observedOn, observation.armed],
    );
  }

  return id;
}

/**
 * The summary of one check, read as of the pinned day.
 *
 * Passing no threshold calls the query the way the application calls it, which
 * is what keeps STALE_AFTER_DAYS on the path these tests exercise rather than
 * beside it.
 */
async function summaryOf(
  checkId: string,
  staleAfterDays?: number,
): Promise<CheckSummary> {
  const rows =
    staleAfterDays === undefined
      ? await listCheckSummaries(database.client(), asOf)
      : await listCheckSummaries(database.client(), asOf, staleAfterDays);

  const found = rows.find((row) => row.checkId === checkId);
  if (found === undefined) {
    throw new Error('The derivation returned no row for the check.');
  }
  return found;
}

interface StatusCase extends CheckFixture {
  /** The rule this fixture is reached by, as the status table words it. */
  readonly rule: string;
  readonly status: Status;
}

const statusCases: readonly StatusCase[] = [
  {
    name: 'a check with nothing recorded against it',
    rule: '1, no runs and nothing saying it is on',
    status: 'Unarmed',
  },
  {
    name: 'a check whose only observation says it is off',
    rule: '1, no runs and nothing saying it is on',
    status: 'Unarmed',
    observations: [{ observedOn: daysBefore(5), armed: false }],
  },
  {
    name: 'a check seen switched on and later seen switched off',
    rule: '1, the latest observation is the later of the two',
    status: 'Unarmed',
    observations: [
      { observedOn: daysBefore(30), armed: true },
      { observedOn: daysBefore(4), armed: false },
    ],
  },
  {
    name: 'a check that caught and was then seen switched off',
    rule: '1, the latest observation is off and is after the latest run',
    status: 'Unarmed',
    runs: [{ runOn: daysBefore(10), outcome: 'caught' }],
    observations: [{ observedOn: daysBefore(3), armed: false }],
  },
  {
    name: 'a check seen switched off on the day of its latest run',
    rule: '1, the latest observation is off and is on the day of the run',
    status: 'Unarmed',
    runs: [{ runOn: daysBefore(10), outcome: 'caught' }],
    observations: [{ observedOn: daysBefore(10), armed: false }],
  },
  {
    name: 'a check whose latest run missed',
    rule: '2, the latest run missed',
    status: 'Broken',
    runs: [{ runOn: daysBefore(2), outcome: 'missed' }],
    observations: [{ observedOn: daysBefore(20), armed: true }],
  },
  {
    name: 'a check that caught and then missed',
    rule: '2, the latest run missed',
    status: 'Broken',
    runs: [
      { runOn: daysBefore(20), outcome: 'caught' },
      { runOn: daysBefore(2), outcome: 'missed' },
    ],
  },
  {
    name: 'a check with a miss and a catch written down on one day',
    rule: '2, latest is by day and then by the order it was written down',
    status: 'Broken',
    runs: [
      {
        runOn: sharedDay,
        outcome: 'missed',
        createdAt: `${sharedDay}T17:00:00Z`,
      },
      {
        runOn: sharedDay,
        outcome: 'caught',
        createdAt: `${sharedDay}T09:00:00Z`,
      },
    ],
  },
  {
    name: 'a check that missed and then caught',
    rule: '3, the latest run caught and is recent enough',
    status: 'Proven',
    runs: [
      { runOn: daysBefore(20), outcome: 'missed' },
      { runOn: daysBefore(2), outcome: 'caught' },
    ],
  },
  {
    name: 'a check seen switched off and then seen to catch',
    rule: '3, the latest observation is off but is before the latest run',
    status: 'Proven',
    runs: [{ runOn: daysBefore(2), outcome: 'caught' }],
    observations: [{ observedOn: daysBefore(9), armed: false }],
  },
  {
    name: 'a check with a catch and a miss written down on one day',
    rule: '3, latest is by day and then by the order it was written down',
    status: 'Proven',
    runs: [
      {
        runOn: sharedDay,
        outcome: 'caught',
        createdAt: `${sharedDay}T17:00:00Z`,
      },
      {
        runOn: sharedDay,
        outcome: 'missed',
        createdAt: `${sharedDay}T09:00:00Z`,
      },
    ],
  },
  {
    name: 'a check whose latest catch is exactly as old as the threshold',
    rule: '3, at most stale_after_days old',
    status: 'Proven',
    runs: [{ runOn: daysBefore(STALE_AFTER_DAYS), outcome: 'caught' }],
  },
  {
    name: 'a check whose latest catch is a day older than the threshold',
    rule: '4, older than stale_after_days',
    status: 'Stale',
    runs: [{ runOn: daysBefore(STALE_AFTER_DAYS + 1), outcome: 'caught' }],
  },
  {
    name: 'a check seen switched on and never run against a planted defect',
    rule: '5, no runs and the latest observation says it is on',
    status: 'Unproven',
    observations: [{ observedOn: daysBefore(4), armed: true }],
  },
  {
    name: 'a check seen switched off and later seen switched on',
    rule: '5, the latest observation is the later of the two',
    status: 'Unproven',
    observations: [
      { observedOn: daysBefore(30), armed: false },
      { observedOn: daysBefore(4), armed: true },
    ],
  },
];

it('dates its fixtures back from the day they are read as of', () => {
  expect(daysBefore(0)).toBe(asOf);
  expect(daysBefore(1)).toBe('2026-02-28');
  expect(daysBefore(STALE_AFTER_DAYS)).toBe('2026-01-30');
  expect(daysBefore(STALE_AFTER_DAYS + 1)).toBe('2026-01-29');
});

it('has a fixture for every status the vocabulary has', () => {
  const covered = new Set(statusCases.map((statusCase) => statusCase.status));
  expect([...covered].sort()).toEqual([...STATUSES].sort());
});

it.each(statusCases)(
  'reads $name as $status, by rule $rule',
  async (fixture) => {
    const checkId = await insertCheck(fixture);

    expect((await summaryOf(checkId)).status).toBe(fixture.status);
  },
);

/**
 * Everything a run that settled nothing must leave exactly where it was.
 *
 * The status and every figure the status is read from. What it may change is
 * the count of runs, the count of runs that settled nothing, and the day of
 * the latest run, and those are asserted separately as the control: a test
 * that only checked what did not move would pass just as well if the row had
 * never been written.
 */
function whatMustNotMove(summary: CheckSummary) {
  return {
    status: summary.status,
    lastCaughtOn: summary.lastCaughtOn,
    lastSettledOn: summary.lastSettledOn,
    caughtCount: summary.caughtCount,
    missedCount: summary.missedCount,
    lastSeenArmedOn: summary.lastSeenArmedOn,
    lastArmed: summary.lastArmed,
  };
}

/**
 * The same table again, each fixture given one more run that settled nothing,
 * dated the day the workspace is read as of.
 *
 * Every status, by every rule, rather than one example of one of them. The
 * extra run is the newest row in each check's log, so a derivation that read
 * it at all would be reading it as the latest run, which is the position from
 * which a run decides three of the five rules. Nothing moves.
 */
it.each(statusCases)(
  'leaves $name reading $status when a later run settles nothing',
  async (fixture) => {
    const untouched = await insertCheck({
      ...fixture,
      name: `${fixture.name}, untouched`,
    });
    const told = await insertCheck({
      ...fixture,
      name: `${fixture.name}, told nothing`,
      runs: [
        ...(fixture.runs ?? []),
        { runOn: daysBefore(0), outcome: 'inconclusive' },
      ],
    });

    const before = await summaryOf(untouched);
    const after = await summaryOf(told);

    expect(whatMustNotMove(after)).toStrictEqual(whatMustNotMove(before));
    expect(after.status).toBe(fixture.status);
    // The control: the row really is there, and really is the latest run.
    expect(after.inconclusiveCount).toBe(before.inconclusiveCount + 1);
    expect(after.runCount).toBe(before.runCount + 1);
    expect(after.lastRunOn).toBe(daysBefore(0));
  },
);

/**
 * The acceptance criterion on #65, both halves of it.
 *
 * A check whose plant has stopped applying keeps being replayed, and every one
 * of those replays settles nothing. The proof behind its status does not get
 * any newer, so the only thing that can move the check is the calendar, and
 * the thirty-day backstop is what eventually does. Both halves are here
 * because either on its own is satisfied by a derivation that is wrong in the
 * other direction: one that refreshed the status on an unsettled run would
 * pass the first, and one that discarded the catch outright would pass the
 * second.
 */
it.each([
  {
    half: 'stays Proven while the catch behind it is inside the threshold',
    caughtDaysAgo: STALE_AFTER_DAYS,
    status: 'Proven',
  },
  {
    half: 'is taken Stale by the backstop once that catch is older',
    caughtDaysAgo: STALE_AFTER_DAYS + 1,
    status: 'Stale',
  },
] as const)('a check told nothing since it caught $half', async (fixture) => {
  const checkId = await insertCheck({
    name: `Type check, caught ${String(fixture.caughtDaysAgo)} days ago`,
    runs: [
      { runOn: daysBefore(fixture.caughtDaysAgo), outcome: 'caught' },
      // Three replays since, none of which settled anything, the newest of
      // them yesterday. Nothing here is newer evidence about the check.
      { runOn: daysBefore(8), outcome: 'inconclusive' },
      { runOn: daysBefore(4), outcome: 'inconclusive' },
      { runOn: daysBefore(1), outcome: 'inconclusive' },
    ],
  });

  const summary = await summaryOf(checkId);

  expect(summary.status).toBe(fixture.status);
  // The status is as old as the catch, and the page has the day to say so.
  expect(summary.lastSettledOn).toBe(daysBefore(fixture.caughtDaysAgo));
  expect(summary.lastRunOn).toBe(daysBefore(1));
  expect(summary.caughtCount).toBe(1);
  expect(summary.missedCount).toBe(0);
  expect(summary.inconclusiveCount).toBe(3);
});

/**
 * Which outcomes the derivation reads, checked against the database's own enum
 * rather than against a list written here twice.
 *
 * The status rules name the outcomes they read, so an outcome added to the
 * enum and not classified would be one the rules silently never read. This is
 * what makes that a decision somebody takes rather than a default they get.
 */
it('classifies every outcome the enum has as settling or not', async () => {
  const labels = await database
    .client()
    .query<{ label: string }>(
      'SELECT unnest(enum_range(NULL::test_run_outcome))::text AS label',
    );

  expect(labels.rows.map((row) => row.label)).toEqual([...testRunOutcomes]);
  expect([...settledOutcomes, ...unsettledOutcomes].sort()).toEqual(
    [...testRunOutcomes].sort(),
  );
});

/**
 * The three counts add up, so none of them can be quietly absorbing another.
 *
 * Asserted on a check that has some of each, because on a check with no
 * unsettled runs the sum holds whether or not the third count exists at all.
 */
it('counts every run as exactly one of the three', async () => {
  const checkId = await insertCheck({
    name: 'Licence check',
    runs: [
      { runOn: daysBefore(20), outcome: 'caught' },
      { runOn: daysBefore(14), outcome: 'missed' },
      { runOn: daysBefore(9), outcome: 'inconclusive' },
      { runOn: daysBefore(5), outcome: 'caught' },
      { runOn: daysBefore(2), outcome: 'inconclusive' },
    ],
  });

  const summary = await summaryOf(checkId);

  expect(summary.runCount).toBe(5);
  expect(
    summary.caughtCount + summary.missedCount + summary.inconclusiveCount,
  ).toBe(summary.runCount);
  expect(summary.inconclusiveCount).toBe(2);
});

it('names the same five statuses the filter language names', async () => {
  const labels = await database
    .client()
    .query<{ label: string }>(
      'SELECT unnest(enum_range(NULL::check_status))::text AS label',
    );

  expect(labels.rows.map((row) => row.label)).toEqual([...STATUSES]);
});

it('returns a row for a check with no runs and no observations', async () => {
  const checkId = await insertCheck({ name: 'Secret scanner' });

  expect(await summaryOf(checkId)).toEqual({
    checkId,
    status: 'Unarmed',
    lastCaughtOn: null,
    lastRunOn: null,
    lastSettledOn: null,
    runCount: 0,
    caughtCount: 0,
    missedCount: 0,
    inconclusiveCount: 0,
    lastSeenArmedOn: null,
    lastArmed: null,
  });
});

it('counts the runs and dates the evidence behind the status', async () => {
  const checkId = await insertCheck({
    name: 'Migration guard',
    runs: [
      { runOn: daysBefore(40), outcome: 'caught' },
      { runOn: daysBefore(20), outcome: 'missed' },
      { runOn: daysBefore(6), outcome: 'caught' },
    ],
    observations: [
      { observedOn: daysBefore(50), armed: true },
      { observedOn: daysBefore(7), armed: true },
    ],
  });

  expect(await summaryOf(checkId)).toEqual({
    checkId,
    status: 'Proven',
    lastCaughtOn: daysBefore(6),
    lastRunOn: daysBefore(6),
    lastSettledOn: daysBefore(6),
    runCount: 3,
    caughtCount: 2,
    missedCount: 1,
    inconclusiveCount: 0,
    lastSeenArmedOn: daysBefore(7),
    lastArmed: true,
  });
});

it('reports the last day it caught even when the latest run missed', async () => {
  const checkId = await insertCheck({
    name: 'Licence check',
    runs: [
      { runOn: daysBefore(9), outcome: 'caught' },
      { runOn: daysBefore(2), outcome: 'missed' },
    ],
  });
  const summary = await summaryOf(checkId);

  expect(summary.status).toBe('Broken');
  expect(summary.lastCaughtOn).toBe(daysBefore(9));
  expect(summary.lastRunOn).toBe(daysBefore(2));
});

it('reports the last day it was seen on, not the day it was seen off', async () => {
  const checkId = await insertCheck({
    name: 'Dependency audit',
    observations: [
      { observedOn: daysBefore(30), armed: true },
      { observedOn: daysBefore(4), armed: false },
    ],
  });
  const summary = await summaryOf(checkId);

  expect(summary.lastSeenArmedOn).toBe(daysBefore(30));
  expect(summary.lastArmed).toBe(false);
});

it('moves the boundary when a different threshold is passed', async () => {
  const checkId = await insertCheck({
    name: 'Type check',
    runs: [{ runOn: daysBefore(10), outcome: 'caught' }],
  });

  expect((await summaryOf(checkId, 10)).status).toBe('Proven');
  expect((await summaryOf(checkId, 9)).status).toBe('Stale');
});

it('reads the threshold from STALE_AFTER_DAYS when none is passed', async () => {
  const provenId = await insertCheck({
    name: 'Formatting check',
    runs: [{ runOn: daysBefore(STALE_AFTER_DAYS), outcome: 'caught' }],
  });
  const staleId = await insertCheck({
    name: 'Accessibility check',
    runs: [{ runOn: daysBefore(STALE_AFTER_DAYS + 1), outcome: 'caught' }],
  });

  expect((await summaryOf(provenId)).status).toBe('Proven');
  expect((await summaryOf(staleId)).status).toBe('Stale');
});

it('answers as of the day it is given rather than the day it is run', async () => {
  const checkId = await insertCheck({
    name: 'Link checker',
    runs: [{ runOn: daysBefore(STALE_AFTER_DAYS), outcome: 'caught' }],
  });

  // The same rows, the same threshold, and a later day: the catch has aged past
  // the threshold, so the status moves. A function that read the clock would
  // give one answer to both of these.
  expect((await summaryOf(checkId)).status).toBe('Proven');

  const later = await listCheckSummaries(database.client(), '2026-06-01');
  expect(later.find((row) => row.checkId === checkId)?.status).toBe('Stale');
});

it('returns one row per check, each read on its own record', async () => {
  const provenId = await insertCheck({
    name: 'Formatting check',
    runs: [{ runOn: daysBefore(1), outcome: 'caught' }],
  });
  const brokenId = await insertCheck({
    name: 'Secret scanner',
    runs: [{ runOn: daysBefore(1), outcome: 'missed' }],
  });
  const unarmedId = await insertCheck({ name: 'Licence check' });

  const rows = await listCheckSummaries(database.client(), asOf);

  expect(rows).toHaveLength(3);
  expect(new Map(rows.map((row) => [row.checkId, row.status]))).toEqual(
    new Map([
      [provenId, 'Proven'],
      [brokenId, 'Broken'],
      [unarmedId, 'Unarmed'],
    ]),
  );
});

/**
 * Where a run came from is recorded beside it and read by nothing here.
 *
 * Two checks with records that differ in exactly one column, and the whole
 * summary is compared rather than only the status, so provenance leaking into
 * a count or a date would fail this as well. It is the acceptance criterion on
 * #64 written as an assertion: a status is a reading of outcomes and days, and
 * recording who wrote a row did not make it a reading of that.
 */
it.each(testRunOutcomes)(
  'reads a run the same whether a person or a replay recorded it (%s)',
  async (outcome) => {
    const day = daysBefore(2);
    const typedIn = await insertCheck({
      name: `Typed in, ${outcome}`,
      runs: [{ runOn: day, outcome }],
    });
    const replayed = await insertCheck({
      name: `Replayed, ${outcome}`,
      runs: [
        {
          runOn: day,
          outcome,
          replay: {
            commit: '1234567890abcdef1234567890abcdef12345678',
            runUrl: 'https://ci.example.com/runs/91',
          },
        },
      ],
    });

    const { checkId: typedInId, ...typedInSummary } = await summaryOf(typedIn);
    const { checkId: replayedId, ...replayedSummary } =
      await summaryOf(replayed);

    expect(replayedSummary).toStrictEqual(typedInSummary);
    // Named rather than left as "the same as each other", so a derivation that
    // started answering the same wrong thing to both would still fail. A run
    // that settled nothing leaves a check with nothing said about it, which
    // reads Unarmed by the first rule, whoever recorded it.
    expect(typedInSummary.status).toBe(
      { caught: 'Proven', missed: 'Broken', inconclusive: 'Unarmed' }[outcome],
    );
    expect(replayedId).not.toBe(typedInId);
  },
);
