/** What to print after a migration run, for a person reading a terminal. */
export function describeApplied(applied: readonly string[]): string {
  if (applied.length === 0) {
    return 'Nothing to apply.';
  }
  const heading =
    applied.length === 1
      ? 'Applied 1 migration:'
      : `Applied ${String(applied.length)} migrations:`;
  return [heading, ...applied.map((filename) => `  ${filename}`)].join('\n');
}
