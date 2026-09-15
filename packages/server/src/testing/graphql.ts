import type { createGraphQLServer } from '../graphql/server.ts';
import { graphqlRoute } from '../graphql/server.ts';

/**
 * Putting a query through the whole server, transport included.
 *
 * The tests go in through the same door a browser does: an HTTP request that
 * Yoga parses, validates and executes. Calling the executor directly would skip
 * the endpoint, the content type and the error shape, which are three of the
 * things most likely to be wrong and none of which anything else covers. It
 * costs nothing to keep them in, because the handler answers a Request without
 * a port being bound and so without two test files racing for one.
 */

type Server = ReturnType<typeof createGraphQLServer>;

/** Any origin will do: nothing is listening, and only the path is read. */
const origin = 'http://seen-to-fail.test';

/** What a GraphQL response looks like, whichever half of it arrives. */
export interface GraphQLResponse<Data> {
  readonly data?: Data | null;
  readonly errors?: readonly { readonly message: string }[];
}

/** Sends the query and hands back the whole response, errors and all. */
export async function post<Data>(
  server: Server,
  document: string,
): Promise<{ status: number; body: GraphQLResponse<Data> }> {
  const response = await server.fetch(`${origin}${graphqlRoute}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: document }),
  });
  return {
    status: response.status,
    body: (await response.json()) as GraphQLResponse<Data>,
  };
}

/**
 * Sends the query and hands back the data, refusing anything else.
 *
 * A response carrying errors fails here with the first message in it, rather
 * than at whatever assertion happens to read an absent field three lines later.
 * The message is the useful part and a test that hides it costs more time than
 * it saves.
 */
export async function query<Data>(
  server: Server,
  document: string,
): Promise<Data> {
  const { status, body } = await post<Data>(server, document);

  const firstError = body.errors?.[0];
  if (firstError !== undefined) {
    throw new Error(`The query came back with an error: ${firstError.message}`);
  }
  if (status !== 200) {
    throw new Error(`The query came back with status ${String(status)}.`);
  }
  if (body.data === undefined || body.data === null) {
    throw new Error('The query came back with no data and no error.');
  }
  return body.data;
}

/** Asks one of the server's own routes, which are not GraphQL endpoints. */
export async function get(server: Server, route: string): Promise<Response> {
  return server.fetch(`${origin}${route}`);
}
