import { compileFilter } from '@seen-to-fail/filter';
import type {
  CompileOptions,
  Condition,
  Filter,
  Group,
  Joiner,
} from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import { STALE_AFTER_DAYS } from '../staleness.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { selectRows } from './rows.ts';
import type { IsoDate } from './rows.ts';
import { seedWorkspace } from './seed.ts';
import { listCheckSummaries } from './summaries.ts';

/**
 * What the compiled filters actually select, run against a real PostgreSQL
 * holding the seeded workspace.
 *
 * The unit tests in the filter package prove the compiler emits the text it
 * means to. They cannot prove that text asks the database the right question,
 * because they never reach a database. These do: every filter below is
 * compiled by the real compiler, spliced into the real summaries query, and
 * read back as check names.
 *
 * They live here rather than in the filter package because this is where the
 * driver is. The compiler must not depend on the server or on pg, so the
 * dependency runs this way round: the filter package knows nothing about these
 * tests, and this file imports the compiler the same way the API will.
 *
 * The query the API runs with a filter is `listChecks` in checks.ts, and its
 * own tests go through GraphQL. This file splices the predicate by hand into
 * the bare summaries query instead, so what it proves about the compiler does
 * not rest on that query being right as well.
 */
const database = useTestDatabase();

/**
 * The placeholder numbering the query below uses: `$1` carries the day the
 * workspace is read as of and `$2` the staleness threshold, so a compiled
 * filter starts at `$3` and reads the as-of date from `$1`.
 */
const afterAsOfAndThreshold: CompileOptions = { firstParam: 3, asOfParam: 1 };

/**
 * The day count the partition test splits the caught checks at.
 *
 * It is the filter's own number and not the staleness threshold, which happens
 * to be thirty as well. The two are unrelated: one decides when a catch stops
 * being worth believing, the other is what a reader typed into a filter. They
 * are kept apart here so that moving the threshold does not silently move what
 * this test asks.
 */
const partitionAtDays = 30;

const millisecondsPerDay = 86_400_000;

function groupOf(
  joiner: Joiner,
  first: Condition,
  ...rest: Condition[]
): Group {
  return { joiner, conditions: [first, ...rest] };
}

function filterOf(joiner: Joiner, first: Group, ...rest: Group[]): Filter {
  return { kind: 'groups', joiner, groups: [first, ...rest] };
}

/** The smallest filter that carries one condition: one group holding it. */
function filterOfOne(condition: Condition): Filter {
  return filterOf('and', groupOf('and', condition));
}

/** Whole days between two days written as YYYY-MM-DD, counted in UTC. */
function daysBetween(earlier: IsoDate, later: IsoDate): number {
  const from = Date.parse(`${earlier}T00:00:00Z`);
  const to = Date.parse(`${later}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    throw new Error(`${earlier} and ${later} are not both days.`);
  }
  return (to - from) / millisecondsPerDay;
}

interface SeededWorkspace {
  /** The day the workspace was dated back from, and is read as of. */
  readonly asOf: IsoDate;
  /** The names a filter selects, sorted so a comparison reads as a set. */
  readonly namesMatching: (filter: Filter) => Promise<string[]>;
  /**
   * The names of the checks that have ever caught, worked out from the
   * summaries rather than from a filter. The partition test needs a set that
   * the thing under test did not produce.
   */
  readonly caughtNames: () => Promise<string[]>;
}

/**
 * Loads the workspace and hands back the two ways of reading it.
 *
 * The as-of day comes from the seed rather than from the clock, so the filters
 * are read as of the day the rows were dated back from even if the two calls
 * fall either side of midnight.
 */
async function seedAndQuery(): Promise<SeededWorkspace> {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);

  async function namesMatching(filter: Filter): Promise<string[]> {
    const compiled = compileFilter(filter, afterAsOfAndThreshold);
    const rows = await selectRows<{ name: string }>(
      client,
      `SELECT c.name
         FROM check_summaries($1, $2) s
         JOIN checks c ON c.id = s.check_id
        WHERE ${compiled.where}`,
      [asOf, STALE_AFTER_DAYS, ...compiled.values],
    );
    // Sorted here rather than by the query. The summaries come back in no
    // particular order by design, and sorting in SQL would compare under the
    // database's collation rather than a fixed one.
    return rows.map((row) => row.name).sort();
  }

  async function caughtNames(): Promise<string[]> {
    const named = await selectRows<{ id: string; name: string }>(
      client,
      'SELECT id, name FROM checks',
    );
    const nameOf = new Map(
      named.map((row): [string, string] => [row.id, row.name]),
    );

    const caught: string[] = [];
    for (const summary of await listCheckSummaries(client, asOf)) {
      if (summary.lastCaughtOn === null) {
        continue;
      }
      const name = nameOf.get(summary.checkId);
      if (name === undefined) {
        throw new Error('A summary came back for a check that is not there.');
      }
      caught.push(name);
    }
    return caught.sort();
  }

  return { asOf, namesMatching, caughtNames };
}

const everyCheck = [
  'Commit message format',
  'Dependency licence allow-list',
  'No focused tests left behind',
  'Release notes present',
  'Secrets never committed',
  'Test suite required to merge',
  'Translations complete before release',
  'Type check on every pull request',
];

interface FilterCase {
  readonly name: string;
  readonly condition: Condition;
  readonly matches: readonly string[];
}

/**
 * One case per field and operator, each naming the checks it should select.
 *
 * The expected names are written out rather than worked out, because a test
 * that derived them would be running the rule it is meant to be checking. What
 * makes them trustworthy is the seed's own test: it reads every check back
 * through the status derivation and fails if a record stops reaching the status
 * it was written for, so the statuses these expectations rest on are checked
 * somewhere rather than assumed everywhere.
 */
const singleConditions: readonly FilterCase[] = [
  {
    name: 'status is Proven',
    condition: { field: 'status', op: 'is', value: 'Proven' },
    matches: [
      'Test suite required to merge',
      'Type check on every pull request',
    ],
  },
  {
    name: 'status is not Proven',
    condition: { field: 'status', op: 'isNot', value: 'Proven' },
    matches: [
      'Commit message format',
      'Dependency licence allow-list',
      'No focused tests left behind',
      'Release notes present',
      'Secrets never committed',
      'Translations complete before release',
    ],
  },
  {
    name: 'status is Stale',
    condition: { field: 'status', op: 'is', value: 'Stale' },
    matches: [
      'Secrets never committed',
      'Translations complete before release',
    ],
  },
  {
    name: 'status is Unproven',
    condition: { field: 'status', op: 'is', value: 'Unproven' },
    matches: ['Commit message format'],
  },
  {
    name: 'status is Broken',
    condition: { field: 'status', op: 'is', value: 'Broken' },
    matches: ['No focused tests left behind'],
  },
  {
    name: 'status is Unarmed',
    condition: { field: 'status', op: 'is', value: 'Unarmed' },
    matches: ['Dependency licence allow-list', 'Release notes present'],
  },
  {
    name: 'area is CI',
    condition: { field: 'area', op: 'is', value: 'CI' },
    matches: [
      'Test suite required to merge',
      'Type check on every pull request',
    ],
  },
  {
    /**
     * The area that no status picks out. Proven and CI select the same two
     * checks in this workspace, so a compiler that read a status condition off
     * the area column would pass that pair; this case and the one below are
     * where the two fields come apart.
     */
    name: 'area is Git',
    condition: { field: 'area', op: 'is', value: 'Git' },
    matches: ['Commit message format', 'Secrets never committed'],
  },
  {
    name: 'area is not CI',
    condition: { field: 'area', op: 'isNot', value: 'CI' },
    matches: [
      'Commit message format',
      'Dependency licence allow-list',
      'No focused tests left behind',
      'Release notes present',
      'Secrets never committed',
      'Translations complete before release',
    ],
  },
  {
    name: 'lastCaught never',
    condition: { field: 'lastCaught', op: 'never' },
    matches: ['Commit message format', 'Release notes present'],
  },
  {
    name: 'lastCaught before 30 days ago',
    condition: { field: 'lastCaught', op: 'before', days: partitionAtDays },
    matches: [
      'Dependency licence allow-list',
      'Secrets never committed',
      'Translations complete before release',
    ],
  },
  {
    name: 'lastCaught after 30 days ago',
    condition: { field: 'lastCaught', op: 'after', days: partitionAtDays },
    matches: [
      'No focused tests left behind',
      'Test suite required to merge',
      'Type check on every pull request',
    ],
  },
  {
    name: 'runs more than 1',
    condition: { field: 'runs', op: 'moreThan', count: 1 },
    // The type check is here on two runs, one of which settled nothing. The
    // count is of runs recorded rather than of runs that proved something, and
    // two are recorded against it.
    matches: [
      'No focused tests left behind',
      'Test suite required to merge',
      'Translations complete before release',
      'Type check on every pull request',
    ],
  },
  {
    name: 'runs fewer than 1',
    condition: { field: 'runs', op: 'fewerThan', count: 1 },
    matches: ['Commit message format', 'Release notes present'],
  },
];

for (const testCase of singleConditions) {
  it(`selects the checks where ${testCase.name}`, async () => {
    const { namesMatching } = await seedAndQuery();

    expect(await namesMatching(filterOfOne(testCase.condition))).toEqual([
      ...testCase.matches,
    ]);
  });
}

it('selects every check for the empty filter', async () => {
  const { namesMatching } = await seedAndQuery();

  expect(await namesMatching({ kind: 'empty' })).toEqual(everyCheck);
});

/**
 * The README's example filter, against the workspace as seeded.
 *
 * It selects nothing, and that is the right answer rather than a broken query:
 * the Unproven and Stale checks are in Git and Release, and none of them is in
 * CI. An empty result is the weakest kind of expectation on its own, because a
 * compiler that selected nothing at all would satisfy it, so the two tests
 * below take the same filter apart and show each half selecting real rows.
 */
it('selects nothing for the README example, because no Unproven or Stale check is in CI', async () => {
  const { namesMatching } = await seedAndQuery();

  const readmeExample = filterOf(
    'and',
    groupOf(
      'or',
      { field: 'status', op: 'is', value: 'Unproven' },
      { field: 'status', op: 'is', value: 'Stale' },
    ),
    groupOf('and', { field: 'area', op: 'is', value: 'CI' }),
  );

  expect(await namesMatching(readmeExample)).toEqual([]);
});

it('selects the three Unproven or Stale checks once the area group is dropped', async () => {
  const { namesMatching } = await seedAndQuery();

  const withoutArea = filterOf(
    'and',
    groupOf(
      'or',
      { field: 'status', op: 'is', value: 'Unproven' },
      { field: 'status', op: 'is', value: 'Stale' },
    ),
  );

  expect(await namesMatching(withoutArea)).toEqual([
    'Commit message format',
    'Secrets never committed',
    'Translations complete before release',
  ]);
});

it('selects two of them once the area group asks for Git instead', async () => {
  const { namesMatching } = await seedAndQuery();

  const inGit = filterOf(
    'and',
    groupOf(
      'or',
      { field: 'status', op: 'is', value: 'Unproven' },
      { field: 'status', op: 'is', value: 'Stale' },
    ),
    groupOf('and', { field: 'area', op: 'is', value: 'Git' }),
  );

  expect(await namesMatching(inGit)).toEqual([
    'Commit message format',
    'Secrets never committed',
  ]);
});

/**
 * Precedence, read off real rows rather than off the emitted text.
 *
 * The same three conditions with the joiners swapped between the two levels
 * select different checks, and both sides select something, so neither
 * expectation can be met by a query that quietly returns nothing.
 *
 * The parentheses are what makes the first one right. Without them it would
 * compile to `Stale OR area is Release AND runs more than 1`, which SQL reads
 * as `Stale OR (Release AND runs more than 1)`, and that selects the Stale
 * check in Git as well. The expectation below excludes it.
 */
it('keeps the two levels apart when the joiners are swapped between them', async () => {
  const { namesMatching } = await seedAndQuery();

  const staleOrRelease = groupOf(
    'or',
    { field: 'status', op: 'is', value: 'Stale' },
    { field: 'area', op: 'is', value: 'Release' },
  );
  const staleAndRelease = groupOf(
    'and',
    { field: 'status', op: 'is', value: 'Stale' },
    { field: 'area', op: 'is', value: 'Release' },
  );
  const runMoreThanOnce = groupOf('and', {
    field: 'runs',
    op: 'moreThan',
    count: 1,
  });

  expect(
    await namesMatching(filterOf('and', staleOrRelease, runMoreThanOnce)),
  ).toEqual(['Translations complete before release']);

  expect(
    await namesMatching(filterOf('or', staleAndRelease, runMoreThanOnce)),
  ).toEqual([
    'No focused tests left behind',
    'Test suite required to merge',
    'Translations complete before release',
    'Type check on every pull request',
  ]);
});

it('partitions the checks that have ever caught between before and after', async () => {
  const { namesMatching, caughtNames } = await seedAndQuery();

  const before = await namesMatching(
    filterOfOne({ field: 'lastCaught', op: 'before', days: partitionAtDays }),
  );
  const after = await namesMatching(
    filterOfOne({ field: 'lastCaught', op: 'after', days: partitionAtDays }),
  );
  const caught = await caughtNames();

  expect([...before, ...after].sort()).toEqual(caught);
  expect(before.filter((name) => after.includes(name))).toEqual([]);
  // Both halves hold something, so a partition cannot be satisfied by one side
  // taking everything and the other going missing.
  expect(before.length).toBeGreaterThan(0);
  expect(after.length).toBeGreaterThan(0);
});

/**
 * Why the partition above is total.
 *
 * Both comparisons are strict, so a check caught exactly on the boundary day
 * would fall into neither half and the partition would be short by one. The
 * seed says no offset is thirty days; this reads the dates back and checks that
 * claim, so a later edit that adds a run on the boundary fails here, naming the
 * reason, rather than failing the partition test as if the compiler were wrong.
 */
it('has no check caught exactly on the boundary day', async () => {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);

  const ages: number[] = [];
  for (const summary of await listCheckSummaries(client, asOf)) {
    if (summary.lastCaughtOn !== null) {
      ages.push(daysBetween(summary.lastCaughtOn, asOf));
    }
  }

  expect(ages).not.toContain(partitionAtDays);
  expect(ages.length).toBeGreaterThan(0);
});
