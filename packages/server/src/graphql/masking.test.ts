import { DatabaseError } from 'pg';
import { expect, it, vi } from 'vitest';

import type { Queryable } from '../database/rows.ts';
import { post } from '../testing/graphql.ts';
import { createGraphQLServer } from './server.ts';

/**
 * What a client is told when something fails inside the server.
 *
 * Unexpected errors are masked: the client gets a fixed message and the detail
 * stays in the server's log. Nothing in this repository asks for that. It is
 * the GraphQL server's default, which is exactly why it needs a test, because a
 * default can be switched off with one option, for debugging or by accident,
 * and every other test still passes when it is.
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
 */

/** A message of the kind PostgreSQL sends, which must not reach a client. */
const databaseMessage = 'invalid byte sequence for encoding "UTF8": 0x00';

/** The SQLSTATE that goes with it. */
const databaseCode = '22021';

/** What the server tells a client in place of an error it did not expect. */
const maskedMessage = 'Unexpected error.';

/**
 * A connection whose every statement fails the way PostgreSQL would, and the
 * mock behind it, so a test can see that a statement was attempted.
 */
function failingDatabase() {
  const query = vi.fn(() => {
    const error = new DatabaseError(databaseMessage, 0, 'error');
    error.severity = 'ERROR';
    error.code = databaseCode;
    error.routine = 'report_invalid_encoding';
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

for (const { field, document } of readsThatFail) {
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
