import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * The build of graphql the server actually runs on.
 *
 * graphql ships two builds of itself and chooses between them with an export
 * condition. Node picks the ordinary one, which is what every dependency of the
 * server gets. The test runner picks the development one for anything it
 * compiles itself, which is this package's own source, and the result is two
 * copies of every class in one process.
 *
 * That is not a slower test run, it is a different program. graphql checks
 * instanceof across its own boundaries, so a schema built through one copy is
 * refused by the other, and an error raised by one is not recognised as a
 * GraphQL error by the other and gets masked rather than reported. Neither
 * happens when the server runs. Pointing the compiled source at the same file
 * Node hands the dependencies is what makes the tests a statement about the
 * server rather than about a near miss of it.
 *
 * Found by a test that read the enum back out of the built schema and was told
 * the enum came from another realm. That test is left in place: it fails again
 * the moment these two drift apart.
 */
const require = createRequire(import.meta.url);
const graphqlEntry = join(dirname(require.resolve('graphql')), 'index.mjs');

export default defineConfig({
  resolve: {
    alias: {
      graphql: graphqlEntry,
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    // Reads DATABASE_URL and TEST_DATABASE_URL from .env when there is one.
    setupFiles: ['src/environment.ts'],
    // The database-backed tests share one database and empty it between tests,
    // so two test files running at once would clear each other's rows.
    fileParallelism: false,
  },
});
