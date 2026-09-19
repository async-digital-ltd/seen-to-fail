/**
 * The arguments a script was given, with the separator pnpm forwards taken off
 * the front.
 *
 * `pnpm ledger:record -- --check-id ci-lint` is how pnpm is told that the flags
 * belong to the script rather than to pnpm, and it passes the `--` along as an
 * argument. parseArgs reads that as "everything after this is positional", and
 * a script with no positionals then refuses every flag it was given. Taking it
 * off here is what makes each script's documented command work.
 *
 * One function rather than a line in each script, because the third script to
 * need the line did not have it: `pnpm ledger:build -- --out` refused the one
 * flag it takes while its own header documented that exact form (#97). Two
 * scripts carrying the same line by hand is a pattern the third forgets.
 *
 * Only a separator that comes first is taken off. One anywhere else is an
 * argument like any other, and it is parseArgs's job to say what it means.
 */
export function forwardedArguments(
  argv: readonly string[] = process.argv.slice(2),
): string[] {
  return argv[0] === '--' ? argv.slice(1) : [...argv];
}
