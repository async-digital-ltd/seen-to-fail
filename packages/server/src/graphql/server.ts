import { createYoga, useReadinessCheck } from 'graphql-yoga';

import type { IsoDate, Queryable } from '../database/rows.ts';
import { createRequestContext } from './context.ts';
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
    plugins: [
      useReadinessCheck({
        endpoint: readinessRoute,
        // Cheapest statement there is. It proves a connection can be had and a
        // round trip completed, which is the whole claim; anything heavier
        // would start reporting on the record rather than on the server.
        check: async () => {
          await options.database.query('SELECT 1 AS reachable', []);
        },
      }),
    ],
  });
}
