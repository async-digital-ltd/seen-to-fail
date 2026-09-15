import type { Client, Exchange } from 'urql';
import { cacheExchange, createClient, fetchExchange } from 'urql';

/**
 * Where the API answers, relative to wherever the app is served. In
 * development Vite proxies this path to the server (see vite.config.ts); in
 * production whatever serves the built app serves the API at the same path,
 * so the client never needs to know a host.
 *
 * The server declares the same route as graphqlRoute in its server module.
 * It is spelled twice because neither package imports the other; the filter
 * package is the only thing they share.
 */
export const graphqlPath = '/graphql';

/**
 * The client every screen reads through, made once at start-up and provided
 * to the tree.
 *
 * The document cache is urql's default. It keys on the query and variables and
 * is cleared for a type whenever a mutation returns that type, which is what a
 * screen wants after logging a run: the list it came from re-reads.
 *
 * The transport is a parameter so that a test can hand in one that answers
 * from stubs and get the same client otherwise, cache included. Nothing in the
 * app passes one.
 */
export function createGraphQLClient(
  transport: Exchange = fetchExchange,
): Client {
  return createClient({
    url: graphqlPath,
    exchanges: [cacheExchange, transport],
  });
}
