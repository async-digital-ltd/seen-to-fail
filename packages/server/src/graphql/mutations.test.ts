import { expect, it, vi } from 'vitest';

import { todayInUtc } from '../day.ts';
import {
  MAX_LABEL_LENGTH,
  MAX_TEXT_LENGTH,
  nameTaken,
  noSuchCheck,
  observationDatedAfterToday,
  runDatedAfterToday,
} from '../database/new-records.ts';
import type { IsoDate } from '../database/rows.ts';
import { seedChecks, seedWorkspace } from '../database/seed.ts';
import { post, query } from '../testing/graphql.ts';
import { useTestDatabase } from '../testing/test-database.ts';
import { buildSchema } from './schema.ts';
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
 * Where a test is about a write being refused, it also reads the record back
 * and finds it unchanged, because a refusal that had written its row first
 * would otherwise look exactly like one that had not. The tests about how a
 * refusal is worded and ordered read the refusal alone.
 *
 * The writes against existing checks use the seeded workspace, whose statuses
 * the seed's own test already proves. A check is picked by the status it starts
 * in, and the test reads that status first, so a change of status on the way
 * out is a change the write made.
 */
const database = useTestDatabase();

type Server = ReturnType<typeof createGraphQLServer>;

const millisecondsPerDay = 86_400_000;

/** A whole number of days after a day, both written as YYYY-MM-DD. */
function daysAfter(day: IsoDate, days: number): IsoDate {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * millisecondsPerDay)
    .toISOString()
    .slice(0, 10);
}

/** The day after a day. */
function dayAfter(day: IsoDate): IsoDate {
  return daysAfter(day, 1);
}

/**
 * Characters in an order PostgreSQL cannot compress, drawn from a run of
 * character codes.
 *
 * The index that keeps names unique compresses what it stores, so a name of one
 * character repeated fits in an index entry at almost any length and never meets
 * the index's size limit. Text like this does, as a long paste would. It is
 * generated rather than random so that every run sends the same text.
 */
function incompressible(
  length: number,
  [firstCode, codeCount]: readonly [number, number],
): string {
  let state = 2463534242;
  let text = '';
  for (let index = 0; index < length; index += 1) {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    text += String.fromCharCode(firstCode + (state % codeCount));
  }
  return text;
}

/** Printable ASCII other than the space, each stored in one byte. */
const oneByteCharacters = [0x21, 94] as const;

/**
 * CJK ideographs, each stored in three bytes of UTF-8, which is the most a
 * single UTF-16 code unit takes.
 */
const threeByteCharacters = [0x4e00, 20_000] as const;

/** A NUL, which PostgreSQL refuses in text. */
const withNul = 'Something with a \u0000 in it.';

/**
 * Half of a character: the first surrogate of a pair, alone. The driver swaps it
 * for a replacement character, so PostgreSQL would store something else.
 */
const withHalfACharacter = 'Something with half of \uD83D in it.';

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
  readonly caughtCount: number;
  readonly missedCount: number;
  readonly inconclusiveCount: number;
  readonly lastRunOn: string | null;
  readonly lastSettledOn: string | null;
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
  caughtCount
  missedCount
  inconclusiveCount
  lastRunOn
  lastSettledOn
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
    readonly inconclusiveReason: string | null;
    readonly note: string | null;
    readonly source: string;
    readonly sourceCommit: string | null;
    readonly sourceRunUrl: string | null;
  };
  readonly check: CheckFields;
}

const logTestRunDocument = `
  mutation LogTestRun($input: LogTestRunInput!) {
    logTestRun(input: $input) {
      ... on TestRunLogged {
        __typename
        testRun {
          id runOn planted expected outcome inconclusiveReason note
          source sourceCommit sourceRunUrl
        }
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

/** The fields of a new check that may not be blank. The other two may. */
const requiredCheckFields = ['name', 'area'] as const;

type WriteName = 'createCheck' | 'logTestRun' | 'recordArmingObservation';

/** Sends a write by name, so one table of fields can drive all three. */
async function send(
  server: Server,
  write: WriteName,
  input: Record<string, unknown>,
): Promise<{ readonly __typename: string }> {
  switch (write) {
    case 'createCheck':
      return createCheck(server, input);
    case 'logTestRun':
      return logTestRun(server, input);
    case 'recordArmingObservation':
      return recordArmingObservation(server, input);
  }
}

/** An input to each write that breaks no rule, against the given check. */
function validInput(
  write: WriteName,
  checkId: string,
  today: IsoDate,
): Record<string, unknown> {
  switch (write) {
    case 'createCheck':
      return { ...newCheck };
    case 'logTestRun':
      return {
        checkId,
        runOn: today,
        planted: 'A value of the wrong type.',
        expected: 'The type check fails.',
        outcome: 'CAUGHT',
        source: 'HAND',
      };
    case 'recordArmingObservation':
      return { checkId, observedOn: today, armed: true };
  }
}

/** One text field of one write, and the longest it may be. */
interface TextField {
  readonly write: WriteName;
  readonly field: string;
  readonly maxLength: number;
  /** Whether a blank value is refused. */
  readonly required: boolean;
}

/** Every text field of every write. */
const textFields: readonly TextField[] = [
  {
    write: 'createCheck',
    field: 'name',
    maxLength: MAX_LABEL_LENGTH,
    required: true,
  },
  {
    write: 'createCheck',
    field: 'area',
    maxLength: MAX_LABEL_LENGTH,
    required: true,
  },
  {
    write: 'createCheck',
    field: 'protects',
    maxLength: MAX_TEXT_LENGTH,
    required: false,
  },
  {
    write: 'createCheck',
    field: 'howToTellArmed',
    maxLength: MAX_TEXT_LENGTH,
    required: false,
  },
  {
    write: 'logTestRun',
    field: 'planted',
    maxLength: MAX_TEXT_LENGTH,
    required: true,
  },
  {
    write: 'logTestRun',
    field: 'expected',
    maxLength: MAX_TEXT_LENGTH,
    required: true,
  },
  {
    write: 'logTestRun',
    field: 'note',
    maxLength: MAX_TEXT_LENGTH,
    required: false,
  },
  {
    write: 'recordArmingObservation',
    field: 'note',
    maxLength: MAX_TEXT_LENGTH,
    required: false,
  },
];

/**
 * Puts a value that breaks a rule into every text field in turn, against the
 * seeded workspace, and expects each write to be refused on that field alone
 * and nothing to be written.
 *
 * Seeded, and aimed at a check that exists, so that a rule taken away shows up
 * as a row written or as the database's own refusal, rather than being hidden
 * behind a refusal on checkId.
 */
async function expectRefusedInEveryTextField(
  valueFor: (textField: TextField) => string,
): Promise<void> {
  const { server, asOf, idOf, before } = await seeded();
  const checkId = idOf('Type check on every pull request', 'PROVEN');

  for (const textField of textFields) {
    const result = await send(server, textField.write, {
      ...validInput(textField.write, checkId, asOf),
      [textField.field]: valueFor(textField),
    });

    const errors = refusalOf(result);
    expect(
      errors.map((error) => `${textField.write}.${error.path}`),
    ).toStrictEqual([`${textField.write}.${textField.field}`]);
    expect(errors[0]?.message.trim()).not.toBe('');
  }

  expect(await workspace(server)).toStrictEqual(before);
}

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

/**
 * What a check protects and how to tell it is switched on may both be left
 * blank, and are stored as empty text rather than refused or stored as null.
 * The seed's own check with no tell written is the first case: the API has to
 * be able to create what the workspace already shows. The second leaves both
 * blank, one of them as nothing but spaces, which is trimmed to empty.
 */
it('creates a check with nothing written for what it protects or how to tell it is on', async () => {
  const server = createGraphQLServer({
    database: database.client(),
    asOf: todayInUtc(),
  });
  const untold = seedChecks.find(
    (check) => check.name === 'Release notes present',
  );
  expect(untold?.howToTellArmed).toBe('');

  const fromSeed = writtenAs(
    await createCheck(server, {
      name: untold?.name,
      area: untold?.area,
      protects: untold?.protects,
      howToTellArmed: untold?.howToTellArmed,
    }),
    'Check',
  );
  expect(fromSeed).toMatchObject({ howToTellArmed: '', status: 'UNARMED' });

  const bothBlank = writtenAs(
    await createCheck(server, {
      ...newCheck,
      protects: '',
      howToTellArmed: blanks[1],
    }),
    'Check',
  );
  expect(bothBlank).toMatchObject({ protects: '', howToTellArmed: '' });

  // Read back again by id, in a request of its own, so what is checked is what
  // was stored.
  const { check } = await query<{
    check: { protects: string; howToTellArmed: string } | null;
  }>(server, `{ check(id: "${bothBlank.id}") { protects howToTellArmed } }`);
  expect(check).toStrictEqual({ protects: '', howToTellArmed: '' });
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
 * A field that breaks two rules is one field to fix, so it is listed once, with
 * the first rule it breaks. A form counting what is wrong counts fields.
 */
it('lists a field that breaks two rules once, with the first it breaks', async () => {
  const server = createGraphQLServer({
    database: database.client(),
    asOf: todayInUtc(),
  });

  const result = await createCheck(server, {
    ...newCheck,
    name: 'x'.repeat(MAX_LABEL_LENGTH) + withNul,
  });

  const errors = refusalOf(result);
  expect(errors.map((error) => error.path)).toStrictEqual(['name']);
  expect(errors[0]?.message).toContain(String(MAX_LABEL_LENGTH));
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
      source: 'HAND',
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
      source: 'HAND',
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
    source: 'HAND',
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
    source: 'HAND',
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
      source: 'HAND',
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
    source: 'HAND',
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

it('refuses text longer than its field allows on that field, and writes nothing', async () => {
  await expectRefusedInEveryTextField(({ maxLength }) =>
    'x'.repeat(maxLength + 1),
  );
});

/**
 * The longest text each field allows, written in characters that take the most
 * bytes and in an order that cannot be compressed, so a name at its limit is as
 * large an index entry as a name can be. A limit raised past what the index can
 * hold fails here, with the database's own refusal. The spaces around the name
 * are trimmed before it is measured.
 */
it('accepts text at the longest its field allows, measured after trimming', async () => {
  const { server, asOf, idOf } = await seeded();
  const checkId = idOf('Type check on every pull request', 'PROVEN');
  const label = incompressible(MAX_LABEL_LENGTH, threeByteCharacters);
  const text = incompressible(MAX_TEXT_LENGTH, threeByteCharacters);

  const created = writtenAs(
    await createCheck(server, {
      name: `  ${label} `,
      area: label,
      protects: text,
      howToTellArmed: text,
    }),
    'Check',
  );
  expect(created.name).toBe(label);

  writtenAs(
    await logTestRun(server, {
      ...validInput('logTestRun', checkId, asOf),
      planted: text,
      expected: text,
      note: text,
    }),
    'TestRunLogged',
  );
  writtenAs(
    await recordArmingObservation(server, {
      ...validInput('recordArmingObservation', checkId, asOf),
      note: text,
    }),
    'ArmingObservationRecorded',
  );
});

/**
 * A long paste into the name, of the kind PostgreSQL cannot fit in the index
 * that keeps names unique. The database refuses that with an error naming the
 * unique constraint, so a writer that matched on the name alone would tell the
 * person the name is taken while no check has it. It is refused for its
 * length, which this test reads off the message; that the database is never
 * asked is counted in the statement test further down.
 */
it('refuses a name too long to index as too long, not as a name in use', async () => {
  const server = createGraphQLServer({
    database: database.client(),
    asOf: todayInUtc(),
  });

  const result = await createCheck(server, {
    ...newCheck,
    name: incompressible(4000, oneByteCharacters),
  });

  const errors = refusalOf(result);
  expect(errors.map((error) => error.path)).toStrictEqual(['name']);
  expect(errors[0]?.message).not.toBe(nameTaken.message);
  expect(errors[0]?.message).toBe(
    `This can be at most ${String(MAX_LABEL_LENGTH)} characters.`,
  );
  expect(await workspace(server)).toStrictEqual([]);
});

it('refuses text holding a NUL on that field, and writes nothing', async () => {
  await expectRefusedInEveryTextField(() => withNul);
});

it('refuses text holding half of a character on that field, and writes nothing', async () => {
  await expectRefusedInEveryTextField(() => withHalfACharacter);
});

/**
 * The server's today running ahead of the database's, as it does when the two
 * clocks disagree across midnight. Pinned here a week ahead, so the rule checked
 * against the request passes and the database's own constraint is the one that
 * refuses. That refusal is the same rule, so it comes back as the same field
 * error rather than as a failure.
 */
it('refuses a day the database counts as after today on that field, even when the server does not', async () => {
  const { server, asOf, idOf, before } = await seeded();
  const weekAhead = daysAfter(asOf, 7);
  const ahead = createGraphQLServer({
    database: database.client(),
    asOf: weekAhead,
  });
  const checkId = idOf('Type check on every pull request', 'PROVEN');

  const run = await logTestRun(ahead, {
    ...validInput('logTestRun', checkId, asOf),
    runOn: weekAhead,
  });
  expect(refusalOf(run)).toStrictEqual([runDatedAfterToday]);

  const observation = await recordArmingObservation(ahead, {
    ...validInput('recordArmingObservation', checkId, asOf),
    observedOn: weekAhead,
  });
  expect(refusalOf(observation)).toStrictEqual([observationDatedAfterToday]);

  expect(await workspace(server)).toStrictEqual(before);
});

/**
 * A rule only the database can judge is judged as the row is written, so it is
 * never reached while another rule is broken. Asking the database first would
 * send a statement for an input already known to be invalid. The first input
 * below breaks one of each and hears only about the blank field; the same input
 * with the field filled in hears about the check.
 *
 * ValidationErrors is described in the schema, and the description is read
 * here too, because it once promised every field at fault and this is the
 * case where that was not true.
 */
it('reports a rule only the database can judge once every other rule has passed, as the schema says', async () => {
  const { server, asOf } = await seeded();
  const input = validInput('logTestRun', unusedId, asOf);

  expect(
    pathsOf(await logTestRun(server, { ...input, planted: '' })),
  ).toStrictEqual(['planted']);
  expect(refusalOf(await logTestRun(server, input))).toStrictEqual([
    noSuchCheck,
  ]);

  const description =
    buildSchema().getType('ValidationErrors')?.description ?? '';
  expect(description).toContain('only found once every other rule has passed');
});

/**
 * The acceptance test for the edge: an input a rule refuses issues no statement
 * at all. Counted on the connection the server was handed, as the filter and
 * batching tests count, so what is measured is statements that reached
 * PostgreSQL.
 *
 * The first write is the positive control. A valid input through the same spy
 * is counted as sending something, so a count of zero below means nothing was
 * sent rather than that the spy was not listening.
 *
 * Every text field is sent blank where it is required, one character too long,
 * with a NUL and with half of a character. Beside those are the values that
 * reached PostgreSQL before a rule was written for them: a name too long for
 * its index, and a day in year 0000, which the Date scalar refuses as GraphQL
 * reads the variables rather than as a rule. The three rules only the database
 * can apply are not in the list, because they cannot be applied without asking
 * it.
 */
it('never reaches the database with an input a rule refuses', async () => {
  const client = database.client();
  const today = todayInUtc();
  const server = createGraphQLServer({ database: client, asOf: today });
  const tomorrow = dayAfter(today);

  const inputFor = (write: WriteName, change: Record<string, unknown>) => ({
    write,
    input: { ...validInput(write, unusedId, today), ...change },
  });

  const refusedByRule = [
    inputFor('createCheck', {
      name: incompressible(4000, oneByteCharacters),
    }),
    inputFor('logTestRun', { checkId: 'not-an-id' }),
    inputFor('logTestRun', { runOn: tomorrow }),
    inputFor('recordArmingObservation', { checkId: 'not-an-id' }),
    inputFor('recordArmingObservation', { observedOn: tomorrow }),
  ];
  for (const { write, field, maxLength, required } of textFields) {
    const breaking = ['x'.repeat(maxLength + 1), withNul, withHalfACharacter];
    if (required) {
      breaking.push('  ');
    }
    for (const value of breaking) {
      refusedByRule.push(inputFor(write, { [field]: value }));
    }
  }

  const refusedByScalar = [
    {
      document: logTestRunDocument,
      input: inputFor('logTestRun', { runOn: '0000-01-01' }).input,
    },
    {
      document: recordArmingObservationDocument,
      input: inputFor('recordArmingObservation', { observedOn: '0000-01-01' })
        .input,
    },
  ];

  const watched = vi.spyOn(client, 'query');
  try {
    writtenAs(await createCheck(server, newCheck), 'Check');
    expect(watched.mock.calls.length).toBeGreaterThan(0);

    for (const { write, input } of refusedByRule) {
      watched.mockClear();

      const result = await send(server, write, input);

      expect(result.__typename).toBe('ValidationErrors');
      expect(watched.mock.calls.length).toBe(0);
    }

    for (const { document, input } of refusedByScalar) {
      watched.mockClear();

      const { body } = await post(server, document, { input });

      expect(body.errors?.[0]?.message).toContain('0000-01-01');
      expect(watched.mock.calls.length).toBe(0);
    }
  } finally {
    watched.mockRestore();
  }
});

/** The two fields a replay carries, as a caller sends them. */
const replayEvidence = {
  sourceCommit: '1234567890abcdef1234567890abcdef12345678',
  sourceRunUrl: 'https://ci.example.com/runs/91',
};

it('logs a run typed in by hand with nothing beside it', async () => {
  const { server, asOf, idOf } = await seeded();

  const logged = writtenAs(
    await logTestRun(server, {
      ...validInput(
        'logTestRun',
        idOf('Commit message format', 'UNPROVEN'),
        asOf,
      ),
    }),
    'TestRunLogged',
  );

  expect(logged.testRun.source).toBe('HAND');
  expect(logged.testRun.sourceCommit).toBeNull();
  expect(logged.testRun.sourceRunUrl).toBeNull();
});

it('logs a replay and reads back the commit and the run it named', async () => {
  const { server, asOf, idOf } = await seeded();

  const logged = writtenAs(
    await logTestRun(server, {
      ...validInput(
        'logTestRun',
        idOf('Commit message format', 'UNPROVEN'),
        asOf,
      ),
      source: 'REPLAY',
      ...replayEvidence,
    }),
    'TestRunLogged',
  );

  expect(logged.testRun.source).toBe('REPLAY');
  expect(logged.testRun.sourceCommit).toBe(replayEvidence.sourceCommit);
  expect(logged.testRun.sourceRunUrl).toBe(replayEvidence.sourceRunUrl);
  // The run counts toward the check exactly as a typed-in one would.
  expect(logged.check).toMatchObject({ status: 'PROVEN', runCount: 1 });
});

/**
 * Half a replay is refused on the half that is missing, and nothing is
 * written. A replay whose commit went astray is a caught nobody can check,
 * which is the shape of record this product exists to refuse.
 */
it.each(['sourceCommit', 'sourceRunUrl'])(
  'refuses a replay with no %s, and writes nothing',
  async (field) => {
    const { server, asOf, idOf, before } = await seeded();

    const result = await logTestRun(server, {
      ...validInput(
        'logTestRun',
        idOf('Commit message format', 'UNPROVEN'),
        asOf,
      ),
      source: 'REPLAY',
      ...replayEvidence,
      [field]: null,
    });

    expect(pathsOf(result)).toStrictEqual([field]);
    expect(await workspace(server)).toStrictEqual(before);
  },
);

/**
 * The rule in the other direction, which is the one worth writing down: a run
 * somebody typed in carrying a commit is refused rather than quietly stored
 * with a field nobody wrote.
 */
it.each(['sourceCommit', 'sourceRunUrl'])(
  'refuses a run typed in by hand carrying %s, and writes nothing',
  async (field) => {
    const { server, asOf, idOf, before } = await seeded();

    const result = await logTestRun(server, {
      ...validInput(
        'logTestRun',
        idOf('Commit message format', 'UNPROVEN'),
        asOf,
      ),
      [field]: replayEvidence[field as keyof typeof replayEvidence],
    });

    expect(pathsOf(result)).toStrictEqual([field]);
    expect(await workspace(server)).toStrictEqual(before);
  },
);

/**
 * A run link goes into an href on the published page, where escaping the text
 * does nothing about the scheme. The API refuses anything but https, so a
 * record that could decide what a click does never reaches a page.
 */
it('refuses a run link that is not an https address, and writes nothing', async () => {
  const { server, asOf, idOf, before } = await seeded();

  const result = await logTestRun(server, {
    ...validInput(
      'logTestRun',
      idOf('Commit message format', 'UNPROVEN'),
      asOf,
    ),
    source: 'REPLAY',
    ...replayEvidence,
    sourceRunUrl: 'javascript:alert(1)',
  });

  expect(pathsOf(result)).toStrictEqual(['sourceRunUrl']);
  expect(await workspace(server)).toStrictEqual(before);
});

/** What a run that settled nothing says about why, as a caller sends it. */
const settledNothingBecause =
  'The anchor matches 0 times in the file and has to match exactly once.';

/**
 * The third outcome, end to end: written, read back with its reason, and
 * counted as neither of the other two.
 *
 * The check it is logged against has an observation saying it is on and no
 * runs, so it reads Unproven before this. A run that settled nothing leaves it
 * Unproven, because nobody has yet learned anything about whether it works.
 */
it('logs a run that settled nothing and moves no status', async () => {
  const { server, asOf, idOf } = await seeded();

  const logged = writtenAs(
    await logTestRun(server, {
      ...validInput(
        'logTestRun',
        idOf('Commit message format', 'UNPROVEN'),
        asOf,
      ),
      outcome: 'INCONCLUSIVE',
      inconclusiveReason: settledNothingBecause,
    }),
    'TestRunLogged',
  );

  expect(logged.testRun.outcome).toBe('INCONCLUSIVE');
  expect(logged.testRun.inconclusiveReason).toBe(settledNothingBecause);
  // The run is recorded, and it is not evidence: the status is where it was,
  // and the run is in neither tally.
  expect(logged.check).toMatchObject({
    status: 'UNPROVEN',
    runCount: 1,
    caughtCount: 0,
    missedCount: 0,
    inconclusiveCount: 1,
    lastSettledOn: null,
  });
});

/**
 * A run that settled nothing and will not say why is refused, and nothing is
 * written. Without the reason the record is a dead end: "the plant no longer
 * applies" and "the check was already failing" ask for opposite things, and a
 * reader cannot tell which they have.
 */
it('refuses a run that settled nothing with no reason, and writes nothing', async () => {
  const { server, asOf, idOf, before } = await seeded();

  const result = await logTestRun(server, {
    ...validInput(
      'logTestRun',
      idOf('Commit message format', 'UNPROVEN'),
      asOf,
    ),
    outcome: 'INCONCLUSIVE',
  });

  expect(pathsOf(result)).toStrictEqual(['inconclusiveReason']);
  expect(await workspace(server)).toStrictEqual(before);
});

/**
 * The rule in the other direction: a run that settled the question and carries
 * a reason anyway is refused rather than stored with a field nobody meant.
 */
it.each(['CAUGHT', 'MISSED'])(
  'refuses a %s run carrying a reason, and writes nothing',
  async (outcome) => {
    const { server, asOf, idOf, before } = await seeded();

    const result = await logTestRun(server, {
      ...validInput(
        'logTestRun',
        idOf('Commit message format', 'UNPROVEN'),
        asOf,
      ),
      outcome,
      inconclusiveReason: settledNothingBecause,
    });

    expect(pathsOf(result)).toStrictEqual(['inconclusiveReason']);
    expect(await workspace(server)).toStrictEqual(before);
  },
);

/**
 * Not a rule this server applies but one GraphQL applies for it, and it is
 * here so that the property is checked rather than assumed: the input's source
 * is non-null and has no default, so a write that does not say where it came
 * from is refused before a resolver runs.
 */
it('refuses a run that does not say where it came from', async () => {
  const { server, asOf, idOf, before } = await seeded();
  const { source, ...withoutSource } = validInput(
    'logTestRun',
    idOf('Commit message format', 'UNPROVEN'),
    asOf,
  );
  // The field really is in the input a valid write sends, so the test below is
  // about leaving it out rather than about a name nothing uses.
  expect(source).toBe('HAND');

  const { body } = await post(server, logTestRunDocument, {
    input: withoutSource,
  });

  expect(body.errors?.[0]?.message ?? '').toContain('source');
  expect(await workspace(server)).toStrictEqual(before);
});
