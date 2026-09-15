import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createSchema } from 'graphql-yoga';

import type { RequestContext } from './context.ts';
import { resolvers } from './resolvers.ts';

/**
 * The schema file and the resolvers, joined into something executable.
 *
 * The SDL is read from schema.graphql at run time rather than repeated in
 * TypeScript, so there is one contract and not two. That is the same file the
 * generator reads, which is what makes the generated resolver types a statement
 * about the schema being served rather than about a copy of it.
 */

/** The schema file, as an absolute path, so it is found from any directory. */
export const schemaFile = fileURLToPath(
  new URL('../../schema.graphql', import.meta.url),
);

/** The executable schema. Built fresh, because nothing here is per request. */
export function buildSchema() {
  return createSchema<RequestContext>({
    typeDefs: readFileSync(schemaFile, 'utf8'),
    resolvers,
  });
}
