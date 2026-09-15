const plainLowerCaseName = /^[a-z_][a-z0-9_]*$/;

/**
 * Quotes a table or database name for a statement that cannot take it as a
 * parameter.
 *
 * PostgreSQL binds values, never identifiers, so a table name has to be spliced
 * into the SQL text. Every name this project splices is its own, and the check
 * below is what keeps that true: a name that is not a plain lower-case
 * identifier is refused rather than quoted and hoped for.
 */
export function quoteIdentifier(name: string): string {
  if (!plainLowerCaseName.test(name)) {
    throw new Error(
      `${JSON.stringify(name)} is not a plain lower-case identifier, so it ` +
        `cannot be used as a table or database name.`,
    );
  }
  return `"${name}"`;
}
