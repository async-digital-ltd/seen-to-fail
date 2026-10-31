/**
 * The checks this ledger may put on a public page, each named by hand.
 *
 * A check's `area` is chosen by whoever declares it, so a secret scanner filed
 * under Code would read as a check about quality, and its arming history,
 * including any time it was off, would reach the public page under it (#234).
 * This list is the reading that cannot be declared into: a check is safe to
 * publish when someone has added its id here, in a change a reviewer reads,
 * after deciding that it guards no secret, access rule or leak. The build
 * refuses a ledger that disagrees with it (#280), and so does a test.
 *
 * Before adding an id, read what the check protects. A check about security,
 * such as a secret scanner, an access control test or a leak gate, never goes
 * on this list. Its record belongs on a ledger nobody outside can read: see
 * "What belongs on a public ledger" in the README.
 */
export const publishableCheckIds: readonly string[] = [
  'ci-build-web',
  'ci-bundle-check',
  'ci-codegen-check',
  'ci-format-check',
  'ci-lint',
  'ci-published-output',
  'ci-server-start',
  'ci-test',
  'ci-type-check',
  'ci-workflow-lint',
  'ledger-export-agreement',
  'ledger-record-validation',
];

/**
 * Everything wrong with publishing these declared checks against the list: a
 * declared check nobody has added by name, and a listed id no check declares,
 * which would be free to name a different check if one took the id later.
 * Empty when every declared check is listed and nothing else is.
 */
export function publishingRefusals(
  declaredIds: readonly string[],
  listedIds: readonly string[] = publishableCheckIds,
): string[] {
  const declared = new Set(declaredIds);
  const listed = new Set(listedIds);
  return [
    ...[...declared]
      .filter((id) => !listed.has(id))
      .map(
        (id) =>
          `${id} is declared in ledger/checks/ but is not on the list of checks safe to publish. Add it to publishableCheckIds by name only once it is clear it guards no secret, access rule or leak.`,
      ),
    ...[...listed]
      .filter((id) => !declared.has(id))
      .map(
        (id) =>
          `${id} is on the list of checks safe to publish, but no check in ledger/checks/ declares it. Take it off the list.`,
      ),
  ].sort();
}
