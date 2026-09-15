import { expect, it, vi } from 'vitest';

import { todayInUtc } from '../day.ts';
import { nameTaken, noSuchCheck } from '../database/new-records.ts';
import type { IsoDate } from '../database/rows.ts';
import { seedWorkspace } from '../database/seed.ts';
import { query } from '../testing/graphql.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { createGraphQLServer } from './server.ts';

/**
 * The three writes, put through the whole server against a real PostgreSQL.
 *
 * Every rule a write applies has a test below that sends an input breaking it
 * and reads back the path it was refused on. Each of those tests would fail if
 * its rule were taken away, and not only in principle: each rule has been
 * removed in turn and its test watched failing. Where the database would refuse
 * the same input anyway, as it does a blank name or area, the refusal would
 * arrive as an error rather than as ValidationErrors, which fails the test just
 * as surely as a row being written.
 *
 * Where a write is refused, the tests also read the record back and find it
 * unchanged, because a refusal that had written its row first would otherwise
 * look exactly like one that had not.
 *
 * The writes against existing checks use the seeded workspace, whose statuses
 * the seed's own test already proves. A check is picked by the status it starts
 * in, and the test reads that status first, so a change of status on the way
 * out is a change the write made.
 */
const database = useTestDatabase();

type Server = ReturnType<typeof createGraphQLServer>;

const millisecondsPerDay = 86_400_000;

/** The day after a day, both written as YYYY-MM-DD. */
function dayAfter(day: IsoDate): IsoDate {
  return new Date(Date.parse(`${day}T00:00:00Z`) + millisecondsPerDay)
    .toISOString()
    .slice(0, 10);
}

/** A well formed id that the database never issued. */
const unusedId = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

/** Every string these tests count as blank: empty, and nothing but spaces. */
const blanks = ['', '  \t '];

interface Refusal {
  readonly __typename: 'ValidationErrors';
  readonly errors: readonly {
    readonly path: string;
    readonly message: string;
  }[];
}

interface CheckFields {
  readonly __typename: 'Check';
  readonly id: string;
  readonly name: string;
  readonly area: string;
  readonly protects: string;
  readonly howToTellArmed: string;
  readonly status: string;
  readonly runCount: number;
  readonly missedCount: number;
  readonly lastRunOn: string | null;
  readonly lastArmed: boolean | null;
  readonly lastSeenArmedOn: string | null;
  readonly runs: readonly { readonly id: string }[];
  readonly armingObservations: readonly { readonly id: string }[];
}

const checkFields = `
  __typename
  id
  name
  area
  protects
  howToTellArmed
  status
  runCount
  missedCount
  lastRunOn
  lastArmed
  lastSeenArmedOn
  runs { id }
  armingObservations { id }
`;

const refusalFields =
  '... on ValidationErrors { __typename errors { path message } }';

const createCheckDocument = `
  mutation CreateCheck($input: CreateCheckInput!) {
    createCheck(input: $input) {
      ... on Check { ${checkFields} }
      ${refusalFields}
    }
  }
`;

interface LoggedRun {
  readonly __typename: 'TestRunLogged';
  readonly testRun: {
    readonly id: string;
    readonly runOn: string;
    readonly planted: string;
    readonly expected: string;
    readonly outcome: string;
    readonly note: string | null;
  };
  readonly check: CheckFields;
}

const logTestRunDocument = `
  mutation LogTestRun($input: LogTestRunInput!) {
    logTestRun(input: $input) {
      ... on TestRunLogged {
        __typename
        testRun { id runOn planted expected outcome note }
        check { ${checkFields} }
      }
      ${refusalFields}
    }
  }
`;

interface RecordedObservation {
  readonly __typename: 'ArmingObservationRecorded';
  readonly armingObservation: {
    readonly id: string;
    readonly observedOn: string;
    readonly armed: boolean;
    readonly note: string | null;
  };
  readonly check: CheckFields;
}

const recordArmingObservationDocument = `
  mutation RecordArmingObservation($input: RecordArmingObservationInput!) {
    recordArmingObservation(input: $input) {
      ... on ArmingObservationRecorded {
        __typename
        armingObservation { id observedOn armed note }
        check { ${checkFields} }
      }
      ${refusalFields}
    }
  }
`;

async function createCheck(
  server: Server,
  input: Record<string, unknown>,
): Promise<CheckFields | Refusal> {
  const data = await query<{ createCheck: CheckFields | Refusal }>(
    server,
    createCheckDocument,
    { input },
  );
  return data.createCheck;
}

async function logTestRun(
  server: Server,
  input: Record<string, unknown>,
): Promise<LoggedRun | Refusal> {
  const data = await query<{ logTestRun: LoggedRun | Refusal }>(
    server,
    logTestRunDocument,
    { input },
  );
  return data.logTestRun;
}

async function recordArmingObservation(
  server: Server,
  input: Record<string, unknown>,
): Promise<RecordedObservation | Refusal> {
  const data = await query<{
    recordArmingObservation: RecordedObservation | Refusal;
  }>(server, recordArmingObservationDocument, { input });
  return data.recordArmingObservation;
}

/** The result, which the test expects to be a refusal, as its errors. */
function refusalOf(result: { readonly __typename: string }): Refusal['errors'] {
  if (result.__typename !== 'ValidationErrors') {
    throw new Error(
      `Expected the input to be refused, and got a ${result.__typename}.`,
    );
  }
  return (result as Refusal).errors;
}

/** The result, which the test expects to have been written, as that type. */
function writtenAs<Written extends { readonly __typename: string }>(
  result: Written | Refusal,
  typename: Written['__typename'],
): Written {
  if (result.__typename !== typename) {
    const paths = refusalOf(result).map((error) => error.path);
    throw new Error(
      `Expected a ${typename}, and was refused on ${paths.join(', ')}.`,
    );
  }
  return result as Written;
}

/** The paths of a refusal, in the order it gave them. */
function pathsOf(result: { readonly __typename: string }): string[] {
  return refusalOf(result).map((error) => error.path);
}

/** One check as the workspace lists it, with what a refused write must not move. */
interface Listed {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly runCount: number;
  readonly armingObservations: readonly { readonly id: string }[];
}

/** Every check in the workspace, read back through the API. */
async function workspace(server: Server): Promise<readonly Listed[]> {
  const data = await query<{ checks: { checks: Listed[] } }>(
    server,
    '{ checks { checks { id name status runCount armingObservations { id } } } }',
  );
  return data.checks.checks;
}

interface Seeded {
  readonly server: Server;
  /** The day the workspace was dated back from, and the server reads as of. */
  readonly asOf: IsoDate;
  /** A check's id, refused unless the check reads the status given. */
  readonly idOf: (name: string, status: string) => string;
  /** The workspace as it was before the test wrote anything. */
  readonly before: readonly Listed[];
}

/** Loads the workspace and points a server at it, reading as of the same day. */
async function seeded(): Promise<Seeded> {
  const client = database.client();
  const { asOf } = await seedWorkspace(client);
  const server = createGraphQLServer({ database: client, asOf });
  const before = await workspace(server);

  // Found by name, and refused unless it reads the status the test starts from,
  // so that a change of status after a write is the write's doing.
  const idOf = (name: string, status: string): string => {
    const check = before.find((candidate) => candidate.name === name);
    if (check?.status !== status) {
      throw new Error(`Expected ${name} to read ${status} before the write.`);
    }
    return check.id;
  };

  return { server, asOf, idOf, before };
}

const newCheck = {
  name: 'Lockfile matches the manifest',
  area: 'CI',
  protects: 'An install that differs from the one that was reviewed.',
  howToTellArmed: 'The install step prints the lockfile it checked.',
};

const requiredCheckFields = [
  'name',
  'area',
  'protects',
  'howToTellArmed',
] as const;

it('creates a check, stored trimmed, that reads Unarmed', async () => {
  const server = createGraphQLServer({
    database: database.client(),
    asOf: todayInUtc(),
  });

  const created = writtenAs(
    await createCheck(server, {
      ...newCheck,
      name: `  ${newCheck.name} `,
      area: ' CI\t',
    }),
    'Check',
  );

  expect(created).toMatchObject({
    ...newCheck,
    status: 'UNARMED',
    runCount: 0,
    runs: [],
    armingObservations: [],
  });
  expect(await workspace(server)).toStrictEqual([
    {
      id: created.id,
      name: newCheck.name,
      status: 'UNARMED',
      runCount: 0,
      armingObservations: [],
    },
  ]);
});

it('refuses each blank field of a new check on that field, and writes nothing', async () => {
  const server = createGraphQLServer({
    database: database.client(),
    asOf: todayInUtc(),
  });

  for (const field of requiredCheckFields) {
    for (const blank of blanks) {
      const result = await createCheck(server, { ...newCheck, [field]: blank });

      const errors = refusalOf(result);
      expect(errors.map((error) => error.path)).toStrictEqual([field]);
      expect(errors[0]?.message.trim()).not.toBe('');
    }
  }

  expect(await workspace(server)).toStrictEqual([]);
});

it('reports every blank field of a new check at once, in the order of the form', async () => {
  const server = createGraphQLServer({
    database: database.client(),
    asOf: todayInUtc(),
  });

  const result = await createCheck(server, {
    name: '',
    area: ' ',
    protects: '',
    howToTellArmed: '\t',
  });

  expect(pathsOf(result)).toStrictEqual([...requiredCheckFields]);
});

/**
 * The second name differs from the first only in the spaces around it. It is
 * refused because text is trimmed before it is stored, so the two reach the
 * unique constraint as the same name, which is what a reader would call them.
 */
it('refuses a name already in use on name, and writes nothing', async () => {
  const server = createGraphQLServer({
    database: database.client(),
    asOf: todayInUtc(),
  });

  writtenAs(await createCheck(server, newCheck), 'Check');

  for (const name of [newCheck.name, ` ${newCheck.name}  `]) {
    const result = await createCheck(server, { ...newCheck, name });

    expect(refusalOf(result)).toStrictEqual([nameTaken]);
  }
  expect(await workspace(server)).toHaveLength(1);
});

it('logs a run, and returns it with the check it now counts toward', async () => {
  const { server, asOf, idOf } = await seeded();
  const checkId = idOf('Commit message format', 'UNPROVEN');

  const logged = writtenAs(
    await logTestRun(server, {
      checkId,
      runOn: asOf,
      planted: '  A message with no type in front of it. ',
      expected: 'The commit is refused.',
      outcome: 'CAUGHT',
      note: ' Refused with the format it wanted. ',
    }),
    'TestRunLogged',
  );

  expect(logged.testRun).toMatchObject({
    runOn: asOf,
    planted: 'A message with no type in front of it.',
    expected: 'The commit is refused.',
    outcome: 'CAUGHT',
    note: 'Refused with the format it wanted.',
  });
  // Unproven until something was planted for it, and Proven by the first catch.
  expect(logged.check).toMatchObject({
    id: checkId,
    status: 'PROVEN',
    runCount: 1,
    lastRunOn: asOf,
  });
  expect(logged.check.runs.map((run) => run.id)).toStrictEqual([
    logged.testRun.id,
  ]);
});

it('returns a Proven check that misses reading Broken', async () => {
  const { server, asOf, idOf } = await seeded();
  const checkId = idOf('Test suite required to merge', 'PROVEN');

  const logged = writtenAs(
    await logTestRun(server, {
      checkId,
      runOn: asOf,
      planted: 'A failing assertion in a test the suite skips.',
      expected: 'The merge is refused.',
      outcome: 'MISSED',
      note: '   ',
    }),
    'TestRunLogged',
  );

  expect(logged.testRun.outcome).toBe('MISSED');
  // A note of nothing but spaces is no note, rather than a blank one.
  expect(logged.testRun.note).toBeNull();
  expect(logged.check).toMatchObject({
    status: 'BROKEN',
    runCount: 3,
    missedCount: 1,
    lastRunOn: asOf,
  });
  expect(logged.check.runs[0]?.id).toBe(logged.testRun.id);
});

it('refuses a blank planted or expected on that field, and writes nothing', async () => {
  const { server, asOf, idOf, before } = await seeded();
  const input = {
    checkId: idOf('Type check on every pull request', 'PROVEN'),
    runOn: asOf,
    planted: 'A value of the wrong type.',
    expected: 'The type check fails.',
    outcome: 'CAUGHT',
  };

  for (const field of ['planted', 'expected']) {
    for (const blank of blanks) {
      const result = await logTestRun(server, { ...input, [field]: blank });

      const errors = refusalOf(result);
      expect(errors.map((error) => error.path)).toStrictEqual([field]);
      expect(errors[0]?.message.trim()).not.toBe('');
    }
  }

  expect(await workspace(server)).toStrictEqual(before);
});

/**
 * Today is accepted by the tests above, which log their runs on the day the
 * server reads as of, so the boundary is covered from both sides: today is not
 * after today, and tomorrow is.
 */
it('refuses a run dated after today on runOn, and writes nothing', async () => {
  const { server, asOf, idOf, before } = await seeded();

  const result = await logTestRun(server, {
    checkId: idOf('Type check on every pull request', 'PROVEN'),
    runOn: dayAfter(asOf),
    planted: 'A value of the wrong type.',
    expected: 'The type check fails.',
    outcome: 'CAUGHT',
  });

  expect(pathsOf(result)).toStrictEqual(['runOn']);
  expect(await workspace(server)).toStrictEqual(before);
});

/**
 * Two ways to name a check that is not there, and one answer for both. The
 * first is shaped like an id and is refused by the database's foreign key; the
 * second is not, and is refused before the database is asked, because the
 * column would raise on it rather than find nothing.
 */
it('refuses a run against a check that does not exist on checkId', async () => {
  const { server, asOf, before } = await seeded();

  for (const checkId of [unusedId, 'not-an-id']) {
    const result = await logTestRun(server, {
      checkId,
      runOn: asOf,
      planted: 'A value of the wrong type.',
      expected: 'The type check fails.',
      outcome: 'CAUGHT',
    });

    expect(refusalOf(result)).toStrictEqual([noSuchCheck]);
  }
  expect(await workspace(server)).toStrictEqual(before);
});

it('reports every rule a run breaks at once, in the order of the form', async () => {
  const { server, asOf } = await seeded();

  const result = await logTestRun(server, {
    checkId: 'not-an-id',
    runOn: dayAfter(asOf),
    planted: ' ',
    expected: '',
    outcome: 'MISSED',
  });

  expect(pathsOf(result)).toStrictEqual([
    'checkId',
    'runOn',
    'planted',
    'expected',
  ]);
});

it('records a check seen switched on, and one never looked at reads Unproven', async () => {
  const { server, asOf, idOf } = await seeded();
  const checkId = idOf('Release notes present', 'UNARMED');

  const recorded = writtenAs(
    await recordArmingObservation(server, {
      checkId,
      observedOn: asOf,
      armed: true,
      note: '',
    }),
    'ArmingObservationRecorded',
  );

  expect(recorded.armingObservation).toMatchObject({
    observedOn: asOf,
    armed: true,
    note: null,
  });
  expect(recorded.check).toMatchObject({
    id: checkId,
    status: 'UNPROVEN',
    runCount: 0,
    lastArmed: true,
    lastSeenArmedOn: asOf,
  });
  expect(
    recorded.check.armingObservations.map((seen) => seen.id),
  ).toStrictEqual([recorded.armingObservation.id]);
});

it('records a Proven check seen switched off, which then reads Unarmed', async () => {
  const { server, asOf, idOf } = await seeded();
  const checkId = idOf('Type check on every pull request', 'PROVEN');

  const recorded = writtenAs(
    await recordArmingObservation(server, {
      checkId,
      observedOn: asOf,
      armed: false,
      note: ' Switched off while the pipeline is rebuilt. ',
    }),
    'ArmingObservationRecorded',
  );

  expect(recorded.armingObservation).toMatchObject({
    armed: false,
    note: 'Switched off while the pipeline is rebuilt.',
  });
  expect(recorded.check).toMatchObject({
    status: 'UNARMED',
    lastArmed: false,
  });
});

it('refuses an observation dated after today on observedOn, and writes nothing', async () => {
  const { server, asOf, idOf, before } = await seeded();

  const result = await recordArmingObservation(server, {
    checkId: idOf('Release notes present', 'UNARMED'),
    observedOn: dayAfter(asOf),
    armed: true,
  });

  expect(pathsOf(result)).toStrictEqual(['observedOn']);
  expect(await workspace(server)).toStrictEqual(before);
});

it('refuses an observation about a check that does not exist on checkId', async () => {
  const { server, asOf, before } = await seeded();

  for (const checkId of [unusedId, 'not-an-id']) {
    const result = await recordArmingObservation(server, {
      checkId,
      observedOn: asOf,
      armed: true,
    });

    expect(refusalOf(result)).toStrictEqual([noSuchCheck]);
  }
  expect(await workspace(server)).toStrictEqual(before);
});

/**
 * The acceptance test for the edge: an input a rule refuses issues no statement
 * at all. Counted on the connection the server was handed, as the filter and
 * batching tests count, so what is measured is statements that reached
 * PostgreSQL.
 *
 * The first write is the positive control. A valid input through the same spy
 * counts its insert and the read of the check after it, so a count of zero
 * below means nothing was sent rather than that the spy was not listening.
 *
 * The two rules only the database can apply are not in this list, because they
 * cannot be applied without asking it.
 */
it('never reaches the database with an input a rule refuses', async () => {
  const client = database.client();
  const today = todayInUtc();
  const server = createGraphQLServer({ database: client, asOf: today });
  const tomorrow = dayAfter(today);

  const run = {
    checkId: unusedId,
    runOn: today,
    planted: 'Something planted.',
    expected: 'Something expected.',
    outcome: 'CAUGHT',
  };
  const observation = { checkId: unusedId, observedOn: today, armed: true };

  const refused: readonly (() => Promise<{ __typename: string }>)[] = [
    () => createCheck(server, { ...newCheck, name: ' ' }),
    () => createCheck(server, { ...newCheck, howToTellArmed: '' }),
    () => logTestRun(server, { ...run, checkId: 'not-an-id' }),
    () => logTestRun(server, { ...run, runOn: tomorrow }),
    () => logTestRun(server, { ...run, planted: '' }),
    () => logTestRun(server, { ...run, expected: '  ' }),
    () =>
      recordArmingObservation(server, { ...observation, checkId: 'not-an-id' }),
    () =>
      recordArmingObservation(server, { ...observation, observedOn: tomorrow }),
  ];

  const watched = vi.spyOn(client, 'query');
  try {
    writtenAs(await createCheck(server, newCheck), 'Check');
    expect(watched.mock.calls.length).toBeGreaterThan(0);

    for (const write of refused) {
      watched.mockClear();

      const result = await write();

      expect(result.__typename).toBe('ValidationErrors');
      expect(watched.mock.calls.length).toBe(0);
    }
  } finally {
    watched.mockRestore();
  }
});
