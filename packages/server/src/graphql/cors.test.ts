import { expect, it } from 'vitest';

import type { Queryable } from '../database/rows.ts';
import { createGraphQLServer, graphqlRoute } from './server.ts';

/**
 * What the server tells a browser about pages from other origins: nothing.
 *
 * server.ts passes `cors: false` since #159. Left to the GraphQL server's
 * default, every request carrying an Origin header was answered with that
 * origin echoed back and credentials allowed, so any page open in the same
 * browser as a running server could send it queries and mutations and read the
 * answers. The web app does not need cross-origin access, because it reaches
 * the endpoint through the Vite proxy on its own origin, so no origin is let
 * in, the Vite one included.
 *
 * What is checked is the absence of every access-control header, since that is
 * what a browser reads. Without them it refuses a preflight, so a cross-origin
 * request needing one is never sent, and it withholds the answer to any
 * request that went without one. The status of the preflight is left alone:
 * the browser refuses it whatever the status, and the number is the GraphQL
 * server's choice rather than this project's.
 *
 * The control: remove `cors: false` from server.ts and every test here fails,
 * listing the access-control headers the server sent, credentials among them.
 * It has been seen to do so.
 */

/** Any origin will do for the request itself: nothing is listening. */
const endpoint = `http://seen-to-fail.test${graphqlRoute}`;

/**
 * Origins a browser could send. A hostile page, the Vite development server's
 * own origin, and `null`, which is what a sandboxed frame or a page opened from
 * a file sends.
 */
const origins = ['https://evil.example', 'http://localhost:5173', 'null'];

/** A connection none of these requests should reach. */
const unreachable: Queryable = {
  query: () => Promise.reject(new Error('Nothing here reads the database.')),
};

/** The access-control headers on a response, by name, sorted. */
function accessControlHeaders(response: Response): string[] {
  return [...response.headers.keys()]
    .filter((name) => name.startsWith('access-control-'))
    .sort();
}

for (const origin of origins) {
  it(`answers a preflight from ${origin} with no access-control header`, async () => {
    const server = createGraphQLServer({ database: unreachable });

    const response = await server.fetch(endpoint, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(accessControlHeaders(response)).toStrictEqual([]);
  });

  it(`answers a query from ${origin} with no access-control header`, async () => {
    const server = createGraphQLServer({ database: unreachable });

    const response = await server.fetch(endpoint, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    // The server still answers, which is what a request through the proxy
    // needs. Keeping the answer from another origin's page is the browser's
    // part, and the missing headers are what tell it to.
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({
      data: { __typename: 'Query' },
    });
    expect(accessControlHeaders(response)).toStrictEqual([]);
  });
}
