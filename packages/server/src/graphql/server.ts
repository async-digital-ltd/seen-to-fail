import { createYoga, useReadinessCheck } from 'graphql-yoga';

import type { IsoDate, Queryable } from '../database/rows.ts';
import { createRequestContext } from './context.ts';
import { useRequestGuard } from './request-guard.ts';
import { buildSchema } from './schema.ts';

/**
 * The HTTP surface: one GraphQL endpoint, and two routes that answer questions
 * about the server rather than about the record.
 *
 * The two are not the same question and they are deliberately separate. The
 * health route says the process is running and reaches nothing at all, which is
 * what a restart loop needs to know. The readiness route runs a statement
 * against the database and fails when it cannot, which is what a reader needs
 * to know before believing an empty list. A single route doing both would make
 * a green answer mean less than it looks: a product that exists to point out
 * checks which have never been seen to catch anything should not ship one.
 *
 * Nothing here is configured from the environment. It is the development
 * server, the port is the port, and the alternative is an option that is set
 * once on one machine and untested everywhere else.
 */

/** Where the GraphQL endpoint, and so GraphiQL, is served. */
export const graphqlRoute = '/graphql';

/** Liveness. Answers if the process is up, and reaches nothing. */
export const healthRoute = '/health';

/** Readiness. Answers if the database is answering too. */
export const readinessRoute = '/ready';

/** The port the development server listens on. */
export const serverPort = 4000;

/**
 * The address the development server listens on: the IPv4 loopback, and no
 * other interface. Left out, Node listens on every interface, and anything on
 * the same network can reach the API (#159). Binding somewhere else means
 * changing this line on purpose.
 *
 * An address rather than `localhost`, because Node binds a name to one
 * address, whichever the resolver returns first, and that differs from machine
 * to machine. On the macOS machine this was measured on for #159, `localhost`
 * resolved to `::1` first, and listening on `localhost` bound `::1` alone. A
 * literal binds the same address everywhere, and the web package's proxy
 * targets the same literal, so no request depends on a resolver falling back.
 */
export const serverHost = '127.0.0.1';

/**
 * The names a request may be addressed to: the address the server listens on,
 * and `localhost`, which a browser also reaches it by. The Vite proxy sends one
 * of the two. Given a target as a bare string, as the web package's config
 * gives it, Vite rewrites the Host header to the target's, `127.0.0.1:4000`;
 * without that rewrite it would pass on the browser's `localhost:5173`.
 *
 * A GraphQL request for any other name is refused, because a page whose own
 * name has been pointed at 127.0.0.1 would otherwise count as this server's
 * origin and could read what it sends back (#183). The health route, the
 * readiness route and the GraphiQL page are not held to these names: they
 * answer under any name, and request-guard.ts says why (#192).
 */
export const servedHostnames: readonly string[] = [serverHost, 'localhost'];

export interface GraphQLServerOptions {
  /** Where reads go. A pool in the server, one connection in a test. */
  readonly database: Queryable;
  /**
   * The day statuses are read as of. Defaults to today, which is what the
   * running server wants; a test pins it to the day its fixtures were dated
   * back from.
   */
  readonly asOf?: IsoDate;
  /** The staleness threshold, defaulting to the one the application runs on. */
  readonly staleAfterDays?: number;
}

/**
 * The server, as something that answers a request.
 *
 * It is a request handler rather than a listening server, so a test can put a
 * request through the whole stack, transport included, without binding a port
 * and without two test files racing for the same one. Binding is the entry
 * point's job and is the one thing tests do not exercise.
 *
 * The context is built per request, which is what keeps the loaders batching
 * within one response and remembering nothing between two.
 */
export function createGraphQLServer(options: GraphQLServerOptions) {
  return createYoga({
    schema: buildSchema(),
    graphqlEndpoint: graphqlRoute,
    healthCheckEndpoint: healthRoute,
    context: () => createRequestContext(options),
    // Masking is pinned rather than left to NODE_ENV. Left alone, the server
    // reads NODE_ENV on every masked error, and `development` adds the original
    // message and a stack trace naming files on this machine to what the client
    // receives. A shell that exports it would leak that detail, and would fail
    // the masking tests for a reason that is not in the code.
    maskedErrors: { isDev: false },
    // No cross-origin access at all. Left out, Yoga answers every origin by
    // echoing it back with credentials allowed, so any page open in the same
    // browser could send queries and mutations here and read the answers
    // (#159). Nothing legitimate needs another origin: the web app reaches
    // this endpoint through the Vite proxy, which keeps it on one origin, and
    // GraphiQL is served from this server. Without the CORS plugin no
    // access-control header is ever sent, so a browser refuses to hand a
    // response to a page from anywhere else.
    cors: false,
    plugins: [
      // A POST whose body is not JSON, and a request addressed to any name
      // but this server's own, are refused where they would be parsed as
      // GraphQL, so before any resolver runs. The headers above keep answers
      // from other origins; this keeps requests from them from acting (#183).
      useRequestGuard(servedHostnames),
      useReadinessCheck({
        endpoint: readinessRoute,
        // Cheapest statement there is. It proves a connection can be had and a
        // round trip completed, which is the whole claim; anything heavier
        // would start reporting on the record rather than on the server.
        //
        // A failure is caught and answered as false, which the plugin turns
        // into a 503 with an empty body. Left to throw, the plugin sends the
        // error's message as the body, and the driver's message names the
        // database. This route answers under any name (#192), so a page whose
        // own name had been pointed at 127.0.0.1 could read it. The status is
        // the whole answer a reader needs (#197).
        check: async () => {
          try {
            await options.database.query('SELECT 1 AS reachable', []);
            return true;
          } catch {
            return false;
          }
        },
      }),
    ],
  });
}
