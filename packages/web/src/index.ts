import { packageName as filterPackageName } from '@seen-to-fail/filter';

/**
 * The web client: the list of checks, the page for each check, and the form
 * for logging a test run.
 *
 * None of that exists yet, so nothing here renders. React and Vite are wired
 * up and pinned, and the function below reads the filter package's name
 * through the workspace dependency declared in this package's package.json,
 * proving the two are linked and that the link type-checks.
 */
export function describeClient(): string {
  return `web client, using the filter language from ${filterPackageName}`;
}
