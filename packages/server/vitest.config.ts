import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Reads DATABASE_URL and TEST_DATABASE_URL from .env when there is one.
    setupFiles: ['src/environment.ts'],
    // The database-backed tests share one database and empty it between tests,
    // so two test files running at once would clear each other's rows.
    fileParallelism: false,
  },
});
