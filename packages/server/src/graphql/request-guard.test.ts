import { describe, expect, it, vi } from 'vitest';

import type { Queryable } from '../database/rows.ts';
import { notJsonMessage, unknownHostMessage } from './request-guard.ts';
import {
  createGraphQLServer,
  graphqlRoute,
  serverHost,
  serverPort,
} from './server.ts';

/**
 * What the server does with a request a page elsewhere can make it act on:
 * refuses it before any resolver runs (#183).
 *
 * Two kinds are refused. A POST whose body is not JSON, which is the only kind
 * a browser sends to another origin without asking first, and a request
 * addressed to a name the server does not answer to, which is how a page whose
 * own name has been pointed at 127.0.0.1 reaches it. Every refusal here sends
 * a mutation, so that a resolver which ran would have written a check, and
 * hands the server a database that records every statement it is asked, so
 * that "before any resolver runs" is read off the database rather than
 * assumed from the status.
 *
 * The other half is that nothing legitimate is refused. The web app sends its
 * queries as GET with no body and its mutations as JSON, through the Vite
 * proxy, which addresses the server by its own address. GraphiQL posts JSON
 * from the server's own origin, opened at either name. Those requests are sent
 * here in the same shapes and must still be answered.
 *
 * The controls, each seen. Remove `useRequestGuard` from server.ts and every
 * test under "refuses" fails: the form and multipart mutations and both
 * requests for the rebound name are answered 200, having reached the database,
 * and the text and empty bodies get the GraphQL server's own bare 415, which
 * carries no message, rather than this guard's. Drop `localhost` from the
 * allowed names and the test for GraphiQL opened there fails. Turn the `&&` in
 * the content type refusal into `||`, which refuses every POST and every GET,
 * and all four tests under "answers" fail.
 */

/** A page on another site, as its Origin header names it. */
const hostileOrigin = 'https://evil.example';

/**
 * A name somebody else controls, pointed at the loopback after the page was
 * loaded. To the browser, the page and the server share this origin.
 */
const reboundHost = `rebind.example:${String(serverPort)}`;

/** The server's own address, which the Vite proxy also addresses it by. */
const ownAddress = `${serverHost}:${String(serverPort)}`;

/** A mutation that writes, so a resolver that ran would reach the database. */
const mutation =
  'mutation { createCheck(input: { name: "planted", area: "probe", protects: "", howToTellArmed: "" }) { __typename } }';

/** A database that records every statement and answers none of them. */
function recordingDatabase() {
  const query = vi.fn(() =>
    Promise.reject(new Error('A refused request reached the database.')),
  );
  const database: Queryable = { query };
  return { database, query };
}

/**
 * The GraphQL error messages in a response, in order. An empty body has none,
 * which is what the GraphQL server's own 415 carries: the message is what tells
 * this guard's refusal apart from that one.
 */
async function messages(response: Response): Promise<string[]> {
  const text = await response.text();
  if (text === '') {
    return [];
  }
  const body = JSON.parse(text) as { errors?: readonly { message: string }[] };
  return (body.errors ?? []).map((error) => error.message);
}

/**
 * The bodies a page on another origin can post without a preflight, each with
 * the content type a browser sends it under. The empty type is a body sent
 * with no Content-Type header at all, which needs no preflight either.
 */
const preflightFreeBodies: readonly {
  readonly name: string;
  /** The Content-Type header, or none where the request sets its own. */
  readonly contentType?: string;
  readonly body: () => BodyInit;
}[] = [
  {
    name: 'application/x-www-form-urlencoded',
    contentType: 'application/x-www-form-urlencoded',
    body: () => new URLSearchParams({ query: mutation }).toString(),
  },
  {
    // The boundary is the request's to choose, so the type is left to it.
    name: 'multipart/form-data',
    body: () => {
      const form = new FormData();
      form.append('operations', JSON.stringify({ query: mutation }));
      return form;
    },
  },
  {
    name: 'text/plain',
    contentType: 'text/plain',
    body: () => JSON.stringify({ query: mutation }),
  },
  {
    // Bytes carry no type of their own, so no Content-Type header is sent.
    name: 'no content type',
    body: () => new TextEncoder().encode(JSON.stringify({ query: mutation })),
  },
];

describe('refuses', () => {
  for (const { name, contentType, body } of preflightFreeBodies) {
    it(`a ${name} POST from another origin, before any resolver runs`, async () => {
      const { database, query } = recordingDatabase();
      const server = createGraphQLServer({ database });
      const headers = new Headers({ origin: hostileOrigin });
      if (contentType !== undefined) {
        headers.set('content-type', contentType);
      }

      const response = await server.fetch(
        `http://${ownAddress}${graphqlRoute}`,
        { method: 'POST', headers, body: body() },
      );

      expect(response.status).toBe(415);
      expect(await messages(response)).toStrictEqual([notJsonMessage]);
      expect(query).not.toHaveBeenCalled();
    });
  }

  it('a JSON POST addressed to a rebound name, before any resolver runs', async () => {
    const { database, query } = recordingDatabase();
    const server = createGraphQLServer({ database });

    const response = await server.fetch(
      `http://${reboundHost}${graphqlRoute}`,
      {
        method: 'POST',
        headers: {
          origin: `http://${reboundHost}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: mutation }),
      },
    );

    expect(response.status).toBe(403);
    expect(await messages(response)).toStrictEqual([unknownHostMessage]);
    expect(query).not.toHaveBeenCalled();
  });

  it('a GET addressed to a rebound name, before any resolver runs', async () => {
    const { database, query } = recordingDatabase();
    const server = createGraphQLServer({ database });
    const search = new URLSearchParams({ query: '{ checks { matching } }' });

    const response = await server.fetch(
      `http://${reboundHost}${graphqlRoute}?${search.toString()}`,
      { headers: { accept: 'application/json' } },
    );

    expect(response.status).toBe(403);
    expect(await messages(response)).toStrictEqual([unknownHostMessage]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('answers', () => {
  /** A query that reaches no resolver of this project's, so needs no rows. */
  const typename = '{ __typename }';

  it('a JSON POST through the Vite proxy, as the web app sends a mutation', async () => {
    const server = createGraphQLServer({
      database: recordingDatabase().database,
    });

    const response = await server.fetch(`http://${ownAddress}${graphqlRoute}`, {
      method: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: typename }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      data: { __typename: 'Query' },
    });
  });

  it('a GET with no body through the Vite proxy, as the web app sends a query', async () => {
    const server = createGraphQLServer({
      database: recordingDatabase().database,
    });
    const search = new URLSearchParams({ query: typename });

    const response = await server.fetch(
      `http://${ownAddress}${graphqlRoute}?${search.toString()}`,
      { headers: { accept: 'application/json' } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      data: { __typename: 'Query' },
    });
  });

  for (const host of [ownAddress, `localhost:${String(serverPort)}`]) {
    it(`a JSON POST from GraphiQL opened at ${host}`, async () => {
      const server = createGraphQLServer({
        database: recordingDatabase().database,
      });

      const response = await server.fetch(`http://${host}${graphqlRoute}`, {
        method: 'POST',
        headers: {
          origin: `http://${host}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query: typename }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toStrictEqual({
        data: { __typename: 'Query' },
      });
    });
  }
});
