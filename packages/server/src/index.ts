import { packageName as filterPackageName } from '@seen-to-fail/filter';

/**
 * The GraphQL API: schema, resolvers and the PostgreSQL layer behind them.
 *
 * None of that exists yet, so nothing here starts a server. The function below
 * reads the filter package's name through the workspace dependency declared in
 * this package's package.json, which is the one thing worth proving at this
 * stage: the packages are linked, and the link type-checks.
 */
export function describeServer(): string {
  return `server, using the filter language from ${filterPackageName}`;
}
