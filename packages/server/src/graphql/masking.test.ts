import { DatabaseError } from 'pg';
import { expect, it, vi } from 'vitest';

import type { Queryable } from '../database/rows.ts';
import { post } from '../testing/graphql.ts';
import { createGraphQLServer } from './server.ts';

/**
 * What a client is told when something fails inside the server.
 *
 * Unexpected errors are masked: the client gets a fixed message and the detail
 * stays in the server's log. server.ts asks for that in so many words, with
 * `maskedErrors: { isDev: false }`, since #39: left to the GraphQL server's
 * default the setting reads NODE_ENV, and `development` adds the original
 * message and a stack trace to what the client receives. An explicit setting is
 * still one option away from off, for debugging or by accident, and every other
 * test passes when it is, which is why it needs a test.
 *
 * The failure is made at the database, through the connection the server is
 * handed, rather than by sending a request that happens to break PostgreSQL
 * today. Such a request is a bug somebody will fix, and the day they do this
 * test would go on passing without failing anything at all. A stubbed
 * connection fails the same way for as long as the test exists. It is also the
 * seam a real failure comes through: the resolvers, the loaders and the error
 * handling all run as they do in production, and only PostgreSQL is replaced.
 *
 * The error thrown is the driver's own class, carrying the kind of message and
 * code PostgreSQL really sends, so what is checked for in the response is what
 * a real failure would have put there.
 *
 * The control: pass `maskedErrors: false` to the server and this test fails,
 * with the database's message in the response. It has been seen to do so.
 *
 * The verdict does not depend on the shell. The server pins masking off
 * development mode, so these tests pass the same with NODE_ENV unset,
 * `production` or `development`. Remove the pin and every test here fails under
 * `development`, which has been seen too.
 */

/** A message of the kind PostgreSQL sends, which must not reach a client. */
const databaseMessage = 'invalid byte sequence for encoding "UTF8": 0x00';

/** The SQLSTATE that goes with it. */
const databaseCode = '22021';

/** What the server tells a client in place of an error it did not expect. */
const maskedMessage = 'Unexpected error.';

/** What a failing statement carries, beyond the driver's error class. */
interface Failure {
  readonly message: string;
  readonly code: string;
  /** The function inside PostgreSQL that raised it, when that is known. */
  readonly routine?: string;
  /** The constraint PostgreSQL names, when the failure names one. */
  readonly constraint?: string;
}

/** The failure most tests below use, which names no constraint. */
const invalidEncoding: Failure = {
  message: databaseMessage,
  code: databaseCode,
  routine: 'report_invalid_encoding',
};

/**
 * A connection whose every statement fails the way PostgreSQL would, and the
 * mock behind it, so a test can see that a statement was attempted.
 */
function failingDatabase(failure: Failure = invalidEncoding) {
  const query = vi.fn(() => {
    const error = new DatabaseError(failure.message, 0, 'error');
    error.severity = 'ERROR';
    error.code = failure.code;
    if (failure.routine !== undefined) {
      error.routine = failure.routine;
    }
    if (failure.constraint !== undefined) {
      error.constraint = failure.constraint;
    }
    return Promise.reject(error);
  });
  const database: Queryable = { query };
  return { database, query };
}

/** One document per read query, each of which goes to the database. */
const readsThatFail = [
  { field: 'checks', document: '{ checks { checks { name } } }' },
  { field: 'statusCounts', document: '{ statusCounts { total } }' },
  {
    field: 'check',
    document: '{ check(id: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d") { name } }',
  },
];

/**
 * One document per write, each valid, so that it passes every rule and reaches
 * its insert. The writes turn a database refusal into ValidationErrors when the
 * constraint behind it is one they expect, and must throw anything else on
 * rather than answer it: a write that turned every database error into a field
 * error would hand the database's message to the form.
 */
const writesThatFail = [
  {
    field: 'createCheck',
    document: `mutation {
      createCheck(input: {
        name: "Any name", area: "CI", protects: "Anything", howToTellArmed: "Anyhow"
      }) { __typename }
    }`,
  },
  {
    field: 'logTestRun',
    document: `mutation {
      logTestRun(input: {
        checkId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", runOn: "2026-01-01",
        planted: "Anything", expected: "Anything", outcome: CAUGHT,
        source: HAND
      }) { __typename }
    }`,
  },
  {
    field: 'recordArmingObservation',
    document: `mutation {
      recordArmingObservation(input: {
        checkId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", observedOn: "2026-01-01",
        armed: true
      }) { __typename }
    }`,
  },
];

for (const { field, document } of [...readsThatFail, ...writesThatFail]) {
  it(`masks a database failure behind ${field}`, async () => {
    const { database, query } = failingDatabase();
    const server = createGraphQLServer({ database });

    const { status, body } = await post(server, document);

    // The failure was the stub's and nothing else's. Without this, a document
    // refused for some other reason would pass the assertions below as well.
    expect(query).toHaveBeenCalled();

    expect(status).toBe(200);
    expect(body.errors).toHaveLength(1);
    const [error] = body.errors ?? [];
    expect(error?.message).toBe(maskedMessage);
    expect(error?.path).toStrictEqual([field]);
    // Exactly the code and nothing beside it. An originalError here would carry
    // the database's message and a stack trace naming files on the server.
    expect(error?.extensions).toStrictEqual({ code: 'INTERNAL_SERVER_ERROR' });

    // And nowhere else in the response either, however it might be nested.
    const sent = JSON.stringify(body);
    expect(sent).not.toContain(databaseMessage);
    expect(sent).not.toContain(databaseCode);
    expect(sent).not.toContain('originalError');
    expect(sent).not.toContain('stack');
  });
}

/**
 * Failures that name a constraint, though not as a refusal the write expects.
 *
 * A write recognises a refusal it can explain by the SQLSTATE and the constraint
 * together, and must mask everything else, including a failure that names one
 * of its own constraints. The first is what PostgreSQL sends for a name too long
 * to fit in the unique index: it names the unique constraint, with a code that
 * means a limit was reached rather than that the name is in use. The rest name
 * a constraint each write has and never expects to be refused by, its primary
 * key, with the code a real collision would carry.
 */
const constraintsNotExpected = [
  {
    field: 'createCheck',
    code: '54000',
    constraint: 'checks_name_unique',
    message:
      'index row size 2712 exceeds btree version 4 maximum 2704 for index "checks_name_unique"',
  },
  {
    field: 'createCheck',
    code: '23505',
    constraint: 'checks_pkey',
    message: 'duplicate key value violates unique constraint "checks_pkey"',
  },
  {
    field: 'logTestRun',
    code: '23505',
    constraint: 'test_runs_pkey',
    message: 'duplicate key value violates unique constraint "test_runs_pkey"',
  },
  {
    field: 'recordArmingObservation',
    code: '23505',
    constraint: 'arming_observations_pkey',
    message:
      'duplicate key value violates unique constraint "arming_observations_pkey"',
  },
];

for (const failure of constraintsNotExpected) {
  it(`masks ${failure.constraint} failing with ${failure.code} behind ${failure.field}`, async () => {
    const write = writesThatFail.find(({ field }) => field === failure.field);
    const { database, query } = failingDatabase(failure);
    const server = createGraphQLServer({ database });

    const { body } = await post(server, write?.document ?? '');

    expect(query).toHaveBeenCalled();

    // An error, masked, rather than an answer. A write that explained this
    // failure as a refusal would put ValidationErrors in the data instead.
    expect(body.data).toBeNull();
    expect(body.errors).toHaveLength(1);
    const [error] = body.errors ?? [];
    expect(error?.message).toBe(maskedMessage);
    expect(error?.path).toStrictEqual([failure.field]);

    const sent = JSON.stringify(body);
    expect(sent).not.toContain(failure.message);
    expect(sent).not.toContain(failure.constraint);
  });
}
