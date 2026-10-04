// pnpm dev:server
//
// The development server. Reads the configuration, opens a pool against the
// development database and listens.

import { createServer } from 'node:http';

import { Pool } from 'pg';

import './environment';

import { loadDatabaseConfig } from './config.ts';
import { databaseName } from './database/databases.ts';
import {
  createGraphQLServer,
  graphqlRoute,
  healthRoute,
  readinessRoute,
  serverHost,
  serverPort,
} from './graphql/server.ts';

/**
 * A pool rather than one connection, so that two requests arriving together do
 * not queue behind each other. Nothing here needs a transaction, and the reads
 * that make up a response are each one statement, so no request cares which
 * connection it gets.
 */
const { databaseUrl } = loadDatabaseConfig();
const pool = new Pool({ connectionString: databaseUrl });

const handle = createGraphQLServer({ database: pool });

/**
 * The handler answers asynchronously and a Node server wants a listener that
 * returns nothing, so the promise is dropped on purpose. By the time it settles
 * the response has been written and any failure has already been turned into
 * one, so there is nothing left here to do with it.
 */
const server = createServer((request, response) => {
  void handle(request, response);
});

server.listen(serverPort, serverHost, () => {
  const address = `http://${serverHost}:${String(serverPort)}`;
  console.log(`Serving ${databaseName(databaseUrl)} on ${address}.`);
  console.log(`  GraphiQL:  ${address}${graphqlRoute}`);
  console.log(`  Health:    ${address}${healthRoute}`);
  console.log(`  Readiness: ${address}${readinessRoute}`);
});
