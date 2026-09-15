import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads the repository's .env into the process environment, if there is one.
 *
 * Imported for its effect, first, by anything that reads the configuration
 * outside a running server: the db scripts and the Vitest setup. Continuous
 * integration has no .env and sets the variables directly, which is why a
 * missing file is not an error here.
 */
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
