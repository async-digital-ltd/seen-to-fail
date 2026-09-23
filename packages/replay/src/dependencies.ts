import { z } from 'zod';

import { problemsFrom } from './report.ts';
import type { ReplayResult } from './report.ts';

/**
 * Which checks a change touches.
 *
 * A replay that runs on every commit says nothing and costs money, so each
 * check declares what it depends on and a changed file matching that list is
 * one of the two reasons a replay is owed for it (#68). The other is the age
 * floor, which is not this file's business: it needs no paths and no matching,
 * so it is answered where the ledger is read, in
 * `packages/server/src/scripts/select-replays.ts`. The list lives beside the
 * plant in `canfail.json`,
 * under a key canfail ignores, which is where #66 put it: a check's plant and
 * the things that void its proof are read and edited together. Measured against
 * canfail 0.2.1, `run_check` reads `name`, `run`, `breaks`, `timeout` and
 * `evidence` from a check and nothing else, so `dependsOn` beside them changes
 * nothing about what it does.
 *
 * Nothing here reads a file, runs git, or knows what a commit is. It is handed
 * a declaration and the paths that changed, and it answers with the checks that
 * are due. The paths come from
 * `packages/server/src/scripts/select-replays.ts`, which is the only thing in
 * this repository that asks git about them.
 */

/**
 * What one entry on a dependency list is: a path, as git spells it, relative to
 * the repository root.
 *
 * A path and not a glob, and that is a decision rather than an omission. A glob
 * dialect is a second language inside the configuration: `*` against `**`,
 * whether a leading dot is matched, whether a pattern carrying no slash matches
 * at every depth. None of those is checkable by reading the file, and getting
 * one of them wrong quietly widens or narrows what gets replayed. Node's own
 * `path.matchesGlob` would have supplied a dialect rather than inventing one,
 * and it is still marked experimental, which is a dependency on undocumented
 * behaviour in the one repository whose subject is guards nobody has watched
 * fail. A path can be checked with `ls`.
 *
 * Both directions a list can be wrong are safe, which is what makes the plainer
 * matcher affordable. Too broad replays a check that did not need it, which
 * costs a minute of a runner and files a record that is true. Too narrow means
 * no replay arrives on this route, and the check waits for the age floor and
 * then for the thirty-day backstop, so what a missed dependency costs is
 * timeliness rather than truth: the proof is refreshed later than it should
 * have been, or it goes Stale. Neither direction can produce a false Proven,
 * because nothing on this path writes a run.
 *
 * A trailing slash is taken off rather than refused, so `packages/` and
 * `packages` are the same dependency. Everything else about the shape is
 * refused: an absolute path, a backslash, a `.` or `..` segment and a doubled
 * slash are each a path git will never print, so an entry spelled that way can
 * only ever match nothing, and a dependency that silently matches nothing is
 * the failure this list exists to avoid.
 */
const dependencyPath = z
  .string()
  .trim()
  .transform((path) => path.replace(/\/+$/, ''))
  .refine((path) => path !== '', {
    error: 'A dependency is a path, and the empty string is not one.',
  })
  .refine((path) => !path.startsWith('/'), {
    error:
      'A dependency is relative to the repository root, so it does not start with a slash.',
  })
  .refine((path) => !path.includes('\\'), {
    error:
      'A dependency is spelled the way git spells a path, with forward slashes.',
  })
  .refine(
    (path) =>
      path
        .split('/')
        .every(
          (segment) => segment !== '' && segment !== '.' && segment !== '..',
        ),
    {
      error:
        'A dependency names a path git can print, so it has no empty, "." or ".." segment.',
    },
  );

/**
 * The two keys this reader wants from a check, and nothing else.
 *
 * Deliberately not strict, for the reason plants.ts gives about the same
 * object: every key canfail owns would be an unknown key here, and refusing
 * them would mean this file could only read a config canfail cannot run.
 *
 * `dependsOn` is optional because a check that declares none is a case #68
 * names rather than a mistake. It is never selected by this matching, which is
 * what a missing list has always meant here. It is still selected by the age
 * floor, because a list nobody has written says nobody has worked out what
 * voids the check's proof, which is a reason to keep proving it rather than a
 * reason to stop.
 */
const declaredCheckSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Every check in the plant declaration needs a name.'),
  checkId: z
    .string()
    .trim()
    .min(
      1,
      'Every check in the plant declaration needs a checkId, which is its id in the ledger.',
    ),
  dependsOn: z.array(dependencyPath).optional(),
});

/**
 * The declaration, read only far enough to get at the checks in it.
 *
 * Each element is held as it arrived rather than as this schema understands it,
 * because the selected checks are written back out for canfail to run, and
 * canfail needs the keys this reader does not look at.
 */
const declarationSchema = z.object({ checks: z.array(z.unknown()) });

/** One declared check, as the selection reads it. */
export interface DeclaredCheck {
  /** The name a report will call it, which is canfail's whole vocabulary for a check. */
  readonly name: string;
  /** The check's id in the ledger, which is its address (#71). */
  readonly checkId: string;
  /** The paths that bear on this check's proof. Empty when none were declared. */
  readonly dependsOn: readonly string[];
  /**
   * The check exactly as the declaration wrote it, passed through untouched so
   * that a selected check can be handed back to canfail with every key it
   * reads still on it.
   */
  readonly declaration: unknown;
}

/**
 * Every check in a plant declaration, or every rule the declaration broke.
 *
 * Two checks sharing a name is not refused here, and that is deliberate.
 * plants.ts refuses the pair when the report comes back, so a declaration with
 * a duplicate stops at recording time with nothing written, which is where the
 * ambiguity actually bites: a report naming that check could mean either of
 * them. Stating the rule here as well would be two copies of it, free to
 * disagree after one of them is edited.
 */
export function parseDeclaredChecks(
  input: unknown,
): ReplayResult<readonly DeclaredCheck[]> {
  const declaration = declarationSchema.safeParse(input);
  if (!declaration.success) {
    return { ok: false, problems: problemsFrom(declaration.error) };
  }

  const checks: DeclaredCheck[] = [];
  const problems: string[] = [];

  for (const [index, raw] of declaration.data.checks.entries()) {
    const check = declaredCheckSchema.safeParse(raw);
    if (!check.success) {
      for (const problem of problemsFrom(check.error)) {
        problems.push(`checks.${String(index)}.${problem}`);
      }
      continue;
    }
    checks.push({
      name: check.data.name,
      checkId: check.data.checkId,
      dependsOn: check.data.dependsOn ?? [],
      declaration: raw,
    });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }
  if (checks.length === 0) {
    return {
      ok: false,
      problems: ['The plant declaration declares no checks.'],
    };
  }
  return { ok: true, value: checks };
}

/**
 * Whether a changed path is a dependency or sits inside one.
 *
 * The separator is part of the comparison rather than a prefix test on the
 * text, so `packages/filter` matches `packages/filter/src/types.ts` and does
 * not match `packages/filter-extra/src/types.ts`. A plain `startsWith` would
 * match both, and the second is a different package.
 */
export function dependencyMatches(
  dependency: string,
  changedPath: string,
): boolean {
  return changedPath === dependency || changedPath.startsWith(`${dependency}/`);
}

export interface TouchedOptions {
  readonly checks: readonly DeclaredCheck[];
  /** What changed, as git prints it: relative to the root, with forward slashes. */
  readonly changedPaths: readonly string[];
}

/**
 * The checks a change touches, in the order the declaration lists them.
 *
 * A check with no dependency list is never returned, and neither is one whose
 * list matches nothing. Both are the same answer as far as this function is
 * concerned, and #68 asks for the same behaviour from both: this matching does
 * not select the check and nothing is recorded on its account. What happens to
 * such a check afterwards is not decided here. The age floor may still select
 * it in the caller, and either way it degrades to a proof that ages out rather
 * than to a proof nobody watched.
 */
export function checksTouchedBy(
  options: TouchedOptions,
): readonly DeclaredCheck[] {
  return options.checks.filter((check) =>
    check.dependsOn.some((dependency) =>
      options.changedPaths.some((path) => dependencyMatches(dependency, path)),
    ),
  );
}

/**
 * A plant declaration holding only these checks, for canfail to run.
 *
 * Each check is the object the file already held, so the declaration written
 * here is a subset of the one that was read rather than a rewriting of it.
 * Nothing this reader does not understand is lost on the way through.
 */
export function declarationOf(checks: readonly DeclaredCheck[]): {
  readonly checks: readonly unknown[];
} {
  return { checks: checks.map((check) => check.declaration) };
}
