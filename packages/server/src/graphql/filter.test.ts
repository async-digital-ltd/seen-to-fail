import { readFileSync } from 'node:fs';

import {
  MAX_DAYS,
  MAX_RUN_COUNT,
  parseFilter,
  parseFilterString,
} from '@seen-to-fail/filter';
import type { Condition, Filter } from '@seen-to-fail/filter';
import { expect, it, vi } from 'vitest';

import { listChecks } from '../database/checks.ts';
import { seedChecks, seedWorkspace } from '../database/seed.ts';
import { post, query } from '../testing/graphql.ts';
import type { Variables } from '../testing/graphql.ts';
import { sqlStates } from '../testing/rejections.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { createGraphQLServer } from './server.ts';

/**
 * The filter argument, put through the whole server against the seeded
 * workspace.
 *
 * The filter package already proves that its validator refuses what it should
 * and that its compiler selects the right rows. What only these tests can show
 * is the seam between the two and the API: that the argument really is run
 * through the validator, that a refusal comes back as an error a client can
 * read, that a refused filter never gets as far as the database, and that the
 * counts beside the list agree with the list and with the workspace.
 */
const database = useTestDatabase();

/** Loads the workspace and points a server at it, reading as of the same day. */
async function seededServer(): Promise<ReturnType<typeof createGraphQLServer>> {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);
  return createGraphQLServer({ database: client, asOf });
}

interface FilteredList {
  readonly statusCounts: { readonly total: number };
  readonly checks: {
    readonly checks: readonly { readonly name: string }[];
    readonly matching: number;
    readonly hidden: number;
  };
}

/**
 * The list, its two counts, and the workspace total from the status tiles, in
 * one document. The tiles are asked for alongside so that every test below can
 * see the list and the whole workspace side by side in a single response.
 */
const filteredList = `
  query FilteredList($filter: FilterInput) {
    statusCounts { total }
    checks(filter: $filter) { checks { name } matching hidden }
  }
`;

/** The list under a filter, refusing a response that carries errors. */
async function listUnder(
  server: ReturnType<typeof createGraphQLServer>,
  filter: unknown,
): Promise<FilteredList> {
  const variables: Variables = { filter };
  return query<FilteredList>(server, filteredList, variables);
}

function namesOf(list: FilteredList): string[] {
  return list.checks.checks.map((check) => check.name);
}

const everyCheck = seedChecks.map((check) => check.name).sort();

/**
 * Unproven or Stale, and in CI. Nothing seeded is both, so this selects
 * nothing, which is what a server that ignored every filter but returned
 * nothing would give too; the Git filter below is what tells those apart.
 */
const unprovenOrStaleInCI = {
  kind: 'groups',
  joiner: 'and',
  groups: [
    {
      joiner: 'or',
      conditions: [
        { field: 'status', op: 'is', value: 'Unproven' },
        { field: 'status', op: 'is', value: 'Stale' },
      ],
    },
    {
      joiner: 'and',
      conditions: [{ field: 'area', op: 'is', value: 'CI' }],
    },
  ],
};

/**
 * The same shape asking for Git rather than CI, which does select something. It
 * is also the root README's worked example, and the test that reads the README
 * checks that what its link parses to is this filter.
 */
const unprovenOrStaleInGit = {
  kind: 'groups',
  joiner: 'and',
  groups: [
    {
      joiner: 'or',
      conditions: [
        { field: 'status', op: 'is', value: 'Unproven' },
        { field: 'status', op: 'is', value: 'Stale' },
      ],
    },
    {
      joiner: 'and',
      conditions: [{ field: 'area', op: 'is', value: 'Git' }],
    },
  ],
};

it('lists every check, and hides none, when no filter is given', async () => {
  const server = await seededServer();

  const { checks } = await query<FilteredList>(
    server,
    '{ statusCounts { total } checks { checks { name } matching hidden } }',
  );

  expect(checks.checks.map((check) => check.name)).toStrictEqual(everyCheck);
  expect(checks.matching).toBe(seedChecks.length);
  expect(checks.hidden).toBe(0);
});

it('treats a null filter and the empty filter the same as no filter', async () => {
  const server = await seededServer();

  for (const filter of [null, { kind: 'empty' }]) {
    const list = await listUnder(server, filter);

    expect(namesOf(list)).toStrictEqual(everyCheck);
    expect(list.checks.matching).toBe(seedChecks.length);
    expect(list.checks.hidden).toBe(0);
  }
});

/**
 * Nothing in the seeded workspace is both Unproven or Stale and in CI, so the
 * right answer is an empty list with all eight hidden. The test after this one
 * is what stops an empty list being satisfied by a server that finds nothing.
 */
it('answers a filter nothing matches with no checks, and all eight hidden', async () => {
  const server = await seededServer();

  const list = await listUnder(server, unprovenOrStaleInCI);

  expect(namesOf(list)).toStrictEqual([]);
  expect(list.checks.matching).toBe(0);
  expect(list.checks.hidden).toBe(seedChecks.length);
});

it('selects the checks a filter matches, and counts the rest as hidden', async () => {
  const server = await seededServer();

  const list = await listUnder(server, unprovenOrStaleInGit);

  expect(namesOf(list)).toStrictEqual([
    'Commit message format',
    'Secrets never committed',
  ]);
  expect(list.checks.matching).toBe(2);
  expect(list.checks.hidden).toBe(seedChecks.length - 2);
});

/**
 * The root README's worked example, read off the README rather than restated
 * here, so an edit to the example fails this test instead of leaving a test
 * named for it pinning something else (#59). The README gives the example as
 * the link the list opens at. The link is read and checked against the seed as
 * it stands; the README also says how many checks it picks, and that count is
 * not read here: the two below is written into this test.
 */
const readme = readFileSync(
  new URL('../../../../README.md', import.meta.url),
  'utf8',
);

/** The text after `f=` in the `/?f=` link the README shows for its example. */
function readmeExampleLink(): string {
  const found = /^\/\?f=(\S+)$/m.exec(readme);
  if (found?.[1] === undefined) {
    throw new Error('README.md shows no /?f= link for its filter example.');
  }
  return found[1];
}

it("reads the README's example link as the Git filter, which matches two seeded checks", async () => {
  const parsed = parseFilterString(readmeExampleLink());
  if (!parsed.ok) {
    throw new Error(
      `The README's example link was refused: ${JSON.stringify(parsed.errors)}`,
    );
  }
  expect(parsed.filter).toStrictEqual(unprovenOrStaleInGit);

  const server = await seededServer();
  const list = await listUnder(server, parsed.filter);

  expect(seedChecks).toHaveLength(8);
  expect(list.checks.matching).toBe(2);
  expect(list.checks.hidden).toBe(6);
});

it('reads a filter written into the query text the same as one sent as a variable', async () => {
  const server = await seededServer();

  const written = await query<FilteredList>(
    server,
    `{
       statusCounts { total }
       checks(filter: {
         kind: "groups", joiner: "and", groups: [
           { joiner: "or", conditions: [
             { field: "status", op: "is", value: "Unproven" },
             { field: "status", op: "is", value: "Stale" }
           ] },
           { joiner: "and", conditions: [
             { field: "area", op: "is", value: "Git" }
           ] }
         ]
       }) { checks { name } matching hidden }
     }`,
  );

  expect(written).toStrictEqual(await listUnder(server, unprovenOrStaleInGit));
});

/**
 * The counts, for a spread of filters that select none, some and all of the
 * workspace. `statusCounts` is asked for in the same document and must not
 * move with the filter: the tiles show the whole workspace whatever the list is
 * narrowed to.
 */
it('hides exactly the workspace total less what matches, whatever the filter', async () => {
  const server = await seededServer();

  const filters: unknown[] = [
    null,
    unprovenOrStaleInCI,
    unprovenOrStaleInGit,
    {
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'status', op: 'is', value: 'Proven' }],
        },
      ],
    },
    {
      kind: 'groups',
      joiner: 'or',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'lastCaught', op: 'never' }],
        },
        {
          joiner: 'and',
          conditions: [{ field: 'runs', op: 'moreThan', count: 1 }],
        },
      ],
    },
  ];

  const matchingCounts = new Set<number>();
  for (const filter of filters) {
    const list = await listUnder(server, filter);

    expect(list.statusCounts.total).toBe(seedChecks.length);
    expect(list.checks.matching).toBe(list.checks.checks.length);
    expect(list.checks.hidden).toBe(
      list.statusCounts.total - list.checks.matching,
    );
    matchingCounts.add(list.checks.matching);
  }

  // None, all, and something in between, so the arithmetic above is checked
  // where hidden is zero, where it is everything, and where it is neither.
  expect(matchingCounts).toContain(0);
  expect(matchingCounts).toContain(seedChecks.length);
  expect(matchingCounts.size).toBeGreaterThanOrEqual(3);
});

it('refuses an invalid filter with the path to every bad node', async () => {
  const server = await seededServer();

  const invalid = {
    kind: 'groups',
    joiner: 'and',
    groups: [
      {
        joiner: 'or',
        conditions: [{ field: 'status', op: 'is', value: 'Passing' }],
      },
      {
        joiner: 'and',
        conditions: [{ field: 'lastCaught', op: 'before', days: -1 }],
      },
    ],
  };

  const { status, body } = await post<FilteredList>(server, filteredList, {
    filter: invalid,
  });

  expect(status).toBe(200);
  // The list is non-null in the schema, so a refusal on it takes the whole
  // response's data with it rather than answering with half a document.
  expect(body.data).toBeNull();
  expect(body.errors).toHaveLength(1);

  const [error] = body.errors ?? [];
  expect(error?.path).toStrictEqual(['checks']);

  const validated = parseFilter(invalid);
  if (validated.ok) {
    throw new Error('The filter this test sends was meant to be invalid.');
  }
  expect(validated.errors.map((issue) => issue.path)).toStrictEqual([
    'groups[0].conditions[0].value',
    'groups[1].conditions[0].days',
  ]);
  // Word for word what the validator says, paths and messages both, so a
  // client reads the language's own account of what is wrong rather than a
  // paraphrase the API made up on the way out.
  expect(error?.extensions?.errors).toStrictEqual(validated.errors);
});

/**
 * The list alone, for the tests that count statements. The status tiles are a
 * query of their own that runs whatever the filter says, so asking for them
 * would count a statement that has nothing to do with the filter.
 */
const listOnly = `
  query ListOnly($filter: FilterInput) {
    checks(filter: $filter) { matching }
  }
`;

/**
 * The acceptance test for the edge: a filter that is refused issues no query
 * at all. Counted on the connection the server was handed, as the batching
 * tests count, so what is measured is statements that reached PostgreSQL.
 *
 * The first request is the positive control. A valid filter through the same
 * spy counts one statement, so a count of zero below means nothing was sent
 * rather than that the spy was not listening.
 */
it('never reaches the database with a filter it refuses', async () => {
  const server = await seededServer();
  const client = database.client();

  const refused: unknown[] = [
    'all',
    7,
    [],
    { kind: 'groups', joiner: 'and' },
    { kind: 'groups', joiner: 'and', groups: [] },
    {
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [
            { field: 'runs', op: 'moreThan', count: '1; DROP TABLE checks' },
          ],
        },
      ],
    },
    {
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'name', op: 'is', value: 'anything' }],
        },
      ],
    },
    {
      kind: 'groups',
      joiner: 'and',
      groups: Array.from({ length: 11 }, () => ({
        joiner: 'and',
        conditions: [{ field: 'lastCaught', op: 'never' }],
      })),
    },
    { kind: 'empty', where: 'TRUE' },
  ];

  const watched = vi.spyOn(client, 'query');
  try {
    await query(server, listOnly, { filter: unprovenOrStaleInCI });
    expect(watched.mock.calls.length).toBe(1);

    for (const filter of refused) {
      watched.mockClear();

      const { body } = await post(server, listOnly, { filter });

      expect(body.errors?.[0]?.extensions?.errors).toBeDefined();
      expect(watched.mock.calls.length).toBe(0);
    }
  } finally {
    watched.mockRestore();
  }
});

/**
 * A value is compared as a value. Both areas below are valid text, so nothing
 * refuses them; they are safe because the compiler sends them as parameters.
 * Spliced into the statement instead, the first would match every check and
 * the second would close the quote early and run on as SQL. The counts say the
 * first was read as text, and the list afterwards says the table is intact.
 */
it('compares an area that looks like SQL as text and nothing more', async () => {
  const server = await seededServer();

  for (const area of ["CI' OR 'x' = 'x", "x'; DELETE FROM checks; SELECT '"]) {
    const list = await listUnder(server, {
      kind: 'groups',
      joiner: 'and',
      groups: [
        {
          joiner: 'and',
          conditions: [{ field: 'area', op: 'is', value: area }],
        },
      ],
    });

    expect(list.checks.matching).toBe(0);
    expect(list.checks.hidden).toBe(seedChecks.length);
  }

  expect(namesOf(await listUnder(server, null))).toStrictEqual(everyCheck);
});

/** A filter of one condition, in one group. */
function oneCondition(condition: Condition): Filter {
  return {
    kind: 'groups',
    joiner: 'and',
    groups: [{ joiner: 'and', conditions: [condition] }],
  };
}

/**
 * How many statements a request sent, counted on the connection the server
 * was handed, as the acceptance test above counts them.
 */
async function statementsSent(send: () => Promise<void>): Promise<number> {
  const watched = vi.spyOn(database.client(), 'query');
  try {
    await send();
    return watched.mock.calls.length;
  } finally {
    watched.mockRestore();
  }
}

/**
 * The four filters #36 found failing inside PostgreSQL, where the API could
 * only answer with a masked error and no path. Each is now refused at the edge
 * in the validator's own words, and no statement is sent. The first request in
 * each test is the positive control for the count, as in the acceptance test.
 *
 * The first day count is the one measured as of 2026-09-15, when it was the
 * first that failed. That limit moves with the as-of day, which is why the
 * bound is set for the earliest as-of day instead; the test after these holds
 * it there.
 */
const failedInsidePostgres: readonly (readonly [string, Condition, string])[] =
  [
    [
      'a day count of 2461300',
      { field: 'lastCaught', op: 'before', days: 2_461_300 },
      'groups[0].conditions[0].days',
    ],
    [
      'a day count past the largest integer',
      { field: 'lastCaught', op: 'before', days: 2_147_483_648 },
      'groups[0].conditions[0].days',
    ],
    [
      'a run count of the largest safe integer',
      { field: 'runs', op: 'moreThan', count: Number.MAX_SAFE_INTEGER },
      'groups[0].conditions[0].count',
    ],
    [
      'an area holding a NUL character',
      { field: 'area', op: 'is', value: 'C\u0000I' },
      'groups[0].conditions[0].value',
    ],
  ];

for (const [name, condition, path] of failedInsidePostgres) {
  it(`refuses ${name} at ${path}, and sends no statement`, async () => {
    const server = await seededServer();
    const filter = oneCondition(condition);

    const control = await statementsSent(async () => {
      await query(server, listOnly, { filter: unprovenOrStaleInCI });
    });
    expect(control).toBe(1);

    let refusal: unknown;
    const sent = await statementsSent(async () => {
      const { body } = await post(server, listOnly, { filter });
      refusal = body.errors?.[0]?.extensions?.errors;
    });

    expect(sent).toBe(0);
    const validated = parseFilter(filter);
    if (validated.ok) {
      throw new Error(`The validator accepted ${name}.`);
    }
    expect(validated.errors.map((issue) => issue.path)).toStrictEqual([path]);
    expect(refusal).toStrictEqual(validated.errors);
  });
}

/**
 * The two bounds held against PostgreSQL itself rather than restated, for
 * each operator that takes one.
 *
 * The as-of day is 0001-01-01, the earliest day the bound is set for. The
 * largest day count is the most days that reach back from it to the first
 * date PostgreSQL holds, and the arithmetic is beside the rule in the filter
 * package's `schema.ts`. The largest run count is the largest `integer`, the
 * type of the column it is compared with.
 *
 * As of that day, the largest value is answered through the API. One more,
 * handed straight to the query the API runs so that the validator cannot
 * refuse it first, is refused by PostgreSQL. So each bound is exactly what the
 * statement holds: one higher and a filter fails inside the query again, one
 * lower and the validator refuses a value the query can run.
 */
const earliestDay = '0001-01-01';

const boundedOperators: readonly (readonly [
  string,
  (value: number) => Condition,
  number,
  string,
])[] = [
  [
    'lastCaught before',
    (days) => ({ field: 'lastCaught', op: 'before', days }),
    MAX_DAYS,
    sqlStates.datetimeFieldOverflow,
  ],
  [
    'lastCaught after',
    (days) => ({ field: 'lastCaught', op: 'after', days }),
    MAX_DAYS,
    sqlStates.datetimeFieldOverflow,
  ],
  [
    'runs moreThan',
    (count) => ({ field: 'runs', op: 'moreThan', count }),
    MAX_RUN_COUNT,
    sqlStates.numericValueOutOfRange,
  ],
  [
    'runs fewerThan',
    (count) => ({ field: 'runs', op: 'fewerThan', count }),
    MAX_RUN_COUNT,
    sqlStates.numericValueOutOfRange,
  ],
];

for (const [name, condition, largest, refusal] of boundedOperators) {
  it(`answers ${name} at its largest value as of ${earliestDay}, and PostgreSQL refuses one more with ${refusal}`, async () => {
    const client = database.client();
    await seedWorkspace(client);
    const server = createGraphQLServer({ database: client, asOf: earliestDay });

    await expect(
      query(server, listOnly, { filter: oneCondition(condition(largest)) }),
    ).resolves.toHaveProperty('checks.matching');

    await expect(
      listChecks(client, oneCondition(condition(largest + 1)), earliestDay),
    ).rejects.toMatchObject({ code: refusal });
  });
}
