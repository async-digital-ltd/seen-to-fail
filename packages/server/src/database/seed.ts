import type { Status } from '@seen-to-fail/filter';
import type { Client } from 'pg';

import { todayInUtc } from '../day.ts';
import type { IsoDate, TestRunOutcome } from './rows.ts';

/**
 * A small invented workspace, and the one function that loads it.
 *
 * Every check, run, observation and note below is made up for this project.
 * None of it describes a real team's tooling, and none of it is a template for
 * one: it exists so that the list, the status tiles and the detail page have
 * something to show, and so that every status can be seen working before any of
 * them has a real record behind it.
 *
 * The seed is a function rather than a script so that a test can load it too.
 * `pnpm db:seed` is a few lines over the top of it, and the tests that need a
 * populated database call the same function against the test database, so what
 * a developer sees and what the tests read are the same workspace rather than
 * two that could drift.
 *
 * Nothing here stores a status. The statuses are a property of the rows and the
 * day they are read as of; `intendedStatus` below says what each record is
 * there to demonstrate, and the seed's own test checks that claim against the
 * derivation rather than trusting it.
 */

const millisecondsPerDay = 86_400_000;

/** One planted defect, and what the check did about it. */
export interface SeedRun {
  /**
   * How many days before the day the seed runs the defect was planted. Dates
   * are relative so that the statuses stay true whenever the seed is loaded.
   */
  readonly daysAgo: number;
  readonly outcome: TestRunOutcome;
  readonly planted: string;
  readonly expected: string;
  /**
   * Why the run settled nothing, on the run below that settled nothing. Absent
   * on the rest, which the database requires of a run that caught or missed.
   */
  readonly inconclusiveReason?: string;
  readonly note?: string;
  /**
   * What a replay recorded about itself, on the one run below that came from
   * one. Absent on the rest, which a person typed in.
   *
   * The two halves are one optional object rather than two optional fields, so
   * a seeded replay cannot be written with half its evidence. The database
   * refuses that combination anyway; this is the fixture never having to find
   * out.
   */
  readonly replay?: {
    /** The commit the plant was applied to. Invented, like everything here. */
    readonly commit: string;
    /** The run that produced it. */
    readonly runUrl: string;
  };
}

/** Evidence, on one day, about whether a check is switched on at all. */
export interface SeedObservation {
  readonly daysAgo: number;
  readonly armed: boolean;
  readonly note?: string;
}

/** One check and everything recorded against it. */
export interface SeedCheck {
  readonly name: string;
  readonly area: string;
  readonly protects: string;
  readonly howToTellArmed: string;
  /**
   * The status this record is here to demonstrate. Not written to any table:
   * it is the claim the seed makes about its own coverage, and seed.test.ts
   * reads the derivation back and compares. A record that stops reaching the
   * status it was written for fails that test rather than quietly seeding a
   * workspace that no longer shows all five.
   */
  readonly intendedStatus: Status;
  readonly runs?: readonly SeedRun[];
  readonly observations?: readonly SeedObservation[];
}

/**
 * The eight checks the workspace is made of.
 *
 * Between them they reach all five statuses, and two of them reach Unarmed by
 * the two different routes the rule has: one with nothing recorded against it
 * at all, and one that caught a planted defect and was then seen switched off.
 *
 * No offset is thirty days. The staleness threshold is thirty and the filter
 * language's age comparisons are strict on both sides, so a catch dated exactly
 * on the boundary would sit in neither half of a partition and would make a
 * later test of those filters read as a bug in the filter rather than a choice
 * made here.
 */
export const seedChecks: readonly SeedCheck[] = [
  {
    name: 'Test suite required to merge',
    area: 'CI',
    protects: 'A change that breaks the suite reaching the main branch.',
    howToTellArmed:
      'The repository settings list the suite as required to merge.',
    intendedStatus: 'Proven',
    runs: [
      {
        daysAgo: 25,
        outcome: 'caught',
        planted: 'A failing assertion in one test.',
        expected: 'The merge is refused.',
        note: 'Refused within a minute of the branch being pushed.',
      },
      {
        daysAgo: 3,
        outcome: 'caught',
        planted: 'A failing assertion in a different test file.',
        expected: 'The merge is refused.',
      },
    ],
    observations: [
      { daysAgo: 4, armed: true, note: 'The setting is still switched on.' },
    ],
  },
  {
    name: 'Type check on every pull request',
    area: 'CI',
    protects: 'A type error reaching the main branch.',
    howToTellArmed: 'The type check appears in the list of runs on a branch.',
    intendedStatus: 'Proven',
    runs: [
      {
        daysAgo: 9,
        outcome: 'caught',
        planted: 'A value of the wrong type passed to a function.',
        expected: 'The type check fails.',
        // Nobody typed this one in, so that both sources can be seen on a page
        // before either has a real record behind it.
        replay: {
          commit: '4f1d0c2a9b7e5f3a1c8d6b4e2f0a9c7d5b3e1f0a',
          runUrl: 'https://example.com/ci/runs/8412',
        },
      },
      // The newest run against this check settled nothing, and the check still
      // reads Proven from the catch above it. That is the whole of the third
      // outcome in one record: a replay whose plant no longer fits the code is
      // not a miss, so the status does not move, and the page says how old the
      // evidence behind it really is.
      {
        daysAgo: 2,
        outcome: 'inconclusive',
        planted: 'The same value of the wrong type, at the declared anchor.',
        expected: 'The type check fails.',
        inconclusiveReason:
          'The anchor matches 0 times in the file and has to match exactly ' +
          'once, so nothing was broken and the check was never put to the test.',
        replay: {
          commit: '7c2b8e1d4a6f3b9e0d5c2a8f4b1e7d3c9a6f2b8e',
          runUrl: 'https://example.com/ci/runs/9037',
        },
      },
    ],
    observations: [{ daysAgo: 9, armed: true }],
  },
  {
    name: 'Secrets never committed',
    area: 'Git',
    protects: 'A credential being committed and then published.',
    howToTellArmed: 'The hook prints a line of its own on every commit.',
    intendedStatus: 'Stale',
    runs: [
      {
        daysAgo: 71,
        outcome: 'caught',
        planted: 'An invented key in a configuration file.',
        expected: 'The commit is refused.',
      },
    ],
    observations: [
      {
        daysAgo: 15,
        armed: true,
        note: 'Still prints its line, so it is running.',
      },
    ],
  },
  {
    name: 'Commit message format',
    area: 'Git',
    protects: 'A history nobody can read back.',
    howToTellArmed:
      'The hook prints the format it wants when one does not fit.',
    intendedStatus: 'Unproven',
    observations: [
      {
        daysAgo: 2,
        armed: true,
        note:
          'Seen refusing a mistyped message, so it is switched on. ' +
          'Nothing has been planted for it.',
      },
    ],
  },
  {
    name: 'No focused tests left behind',
    area: 'Lint',
    protects: 'One focused test hiding the rest of the suite.',
    howToTellArmed: 'The rule is listed in the lint configuration.',
    intendedStatus: 'Broken',
    runs: [
      {
        daysAgo: 20,
        outcome: 'caught',
        planted: 'A focused test in one file.',
        expected: 'The lint run fails.',
      },
      {
        daysAgo: 5,
        outcome: 'missed',
        planted: 'A focused test written the other way round.',
        expected: 'The lint run fails.',
        note: 'The run passed. The rule matches one spelling and not the other.',
      },
    ],
    observations: [{ daysAgo: 6, armed: true }],
  },
  {
    name: 'Release notes present',
    area: 'Release',
    protects: 'A release going out with nothing written about it.',
    // Empty on purpose. The column allows it, and a check nobody has written a
    // tell for is exactly the thing this product is meant to make visible, so
    // the workspace carries one rather than pretending every check has been
    // thought about.
    howToTellArmed: '',
    intendedStatus: 'Unarmed',
  },
  {
    name: 'Dependency licence allow-list',
    area: 'Review',
    protects: 'A dependency arriving under a licence the project cannot use.',
    howToTellArmed:
      'The review step lists each new dependency and its licence.',
    intendedStatus: 'Unarmed',
    runs: [
      {
        daysAgo: 40,
        outcome: 'caught',
        planted: 'A dependency under a licence that is not on the list.',
        expected: 'The review step refuses it.',
      },
    ],
    observations: [
      { daysAgo: 41, armed: true },
      {
        daysAgo: 10,
        armed: false,
        note:
          'Switched off while the list was rewritten, and not switched ' +
          'back on.',
      },
    ],
  },
  {
    name: 'Translations complete before release',
    area: 'Release',
    protects: 'A release shipping a screen with a missing translation.',
    howToTellArmed: 'The step prints how many strings it compared.',
    intendedStatus: 'Stale',
    runs: [
      {
        daysAgo: 60,
        outcome: 'missed',
        planted: 'A new string with no translation beside it.',
        expected: 'The release step fails.',
        note: 'It went out untranslated.',
      },
      {
        daysAgo: 45,
        outcome: 'caught',
        planted: 'A second string with no translation beside it.',
        expected: 'The release step fails.',
      },
    ],
    observations: [{ daysAgo: 45, armed: true }],
  },
];

/** What a seeding run put in the database. */
export interface SeedResult {
  /** The day every date in the workspace was counted back from. */
  readonly asOf: IsoDate;
  readonly checkCount: number;
  readonly runCount: number;
  readonly observationCount: number;
}

/**
 * The day a whole number of days before another, written as YYYY-MM-DD.
 *
 * Built in UTC at both ends so that the same offset gives the same day wherever
 * the seed is run from. That is a different day from the local one for part of
 * each day in some zones, and it does not matter here: every offset above is
 * several days clear of the staleness threshold, so a day either way cannot
 * change a status.
 */
function daysBefore(asOf: IsoDate, days: number): IsoDate {
  const start = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(start)) {
    throw new Error(`${asOf} is not a day written as YYYY-MM-DD.`);
  }
  return new Date(start - days * millisecondsPerDay).toISOString().slice(0, 10);
}

/**
 * Empties the four tables and loads the invented workspace, returning the day
 * its dates were counted back from.
 *
 * The day is returned rather than assumed, so a caller reads the workspace as
 * of the day it was written for instead of asking the clock a second time and
 * risking a different answer across midnight.
 *
 * It empties before it inserts, so running it again replaces the workspace
 * rather than failing on the unique name of the first check. Everything the
 * database holds is lost, which is what makes it safe to run repeatedly and
 * also why the script over it only ever points at the development database.
 *
 * The whole thing is one transaction. A seed that failed halfway through would
 * otherwise leave a database emptied of the workspace it had and short of the
 * one it was getting.
 */
export async function seedWorkspace(client: Client): Promise<SeedResult> {
  const asOf = todayInUtc();

  await client.query('BEGIN');
  try {
    // The four tables by name and without CASCADE. Naming them is what makes a
    // fifth table referencing checks fail here, loudly, instead of being
    // emptied by a seed that was never told about it. saved_filters is emptied
    // and not filled: nothing reads a saved filter yet, and inventing one now
    // would be inventing the shape that the filter language owns.
    await client.query(
      `TRUNCATE TABLE checks, test_runs, arming_observations, saved_filters`,
    );

    let runCount = 0;
    let observationCount = 0;

    for (const check of seedChecks) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO checks (name, area, protects, how_to_tell_armed)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [check.name, check.area, check.protects, check.howToTellArmed],
      );

      const id = inserted.rows[0]?.id;
      if (id === undefined) {
        throw new Error(`Inserting ${check.name} returned no id.`);
      }

      for (const run of check.runs ?? []) {
        await client.query(
          `INSERT INTO test_runs
             (check_id, run_on, planted, expected, outcome,
              inconclusive_reason, note,
              source, source_commit, source_run_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id,
            daysBefore(asOf, run.daysAgo),
            run.planted,
            run.expected,
            run.outcome,
            run.inconclusiveReason ?? null,
            run.note ?? null,
            run.replay === undefined ? 'hand' : 'replay',
            run.replay?.commit ?? null,
            run.replay?.runUrl ?? null,
          ],
        );
        runCount += 1;
      }

      for (const observation of check.observations ?? []) {
        await client.query(
          `INSERT INTO arming_observations (check_id, observed_on, armed, note)
           VALUES ($1, $2, $3, $4)`,
          [
            id,
            daysBefore(asOf, observation.daysAgo),
            observation.armed,
            observation.note ?? null,
          ],
        );
        observationCount += 1;
      }
    }

    await client.query('COMMIT');
    return { asOf, checkCount: seedChecks.length, runCount, observationCount };
  } catch (cause) {
    await client.query('ROLLBACK');
    throw new Error('Seeding the workspace failed. Nothing was written.', {
      cause,
    });
  }
}
