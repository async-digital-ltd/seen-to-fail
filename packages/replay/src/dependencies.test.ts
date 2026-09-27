import { describe, expect, it } from 'vitest';

import {
  checksTouchedBy,
  declarationOf,
  dependencyMatches,
  parseDeclaredChecks,
} from './dependencies.ts';
import type { DeclaredCheck } from './dependencies.ts';

/**
 * Which checks a change touches, tested on a declaration with two checks in it.
 *
 * Two is the smallest number that can tell matching from replaying everything,
 * and every assertion below is on the whole selected list rather than on
 * whether one check is in it. A test asserting that the touched check was
 * selected passes just as well when the matcher answers yes to everything,
 * which is the shape of guard this repository exists to object to. Measured by
 * planting exactly that: a `checksTouchedBy` that returned `options.checks`
 * unfiltered turns red every test below that expects a check to be left out.
 * The one that expects both checks passes under it, which is why it is never
 * the only one.
 */

/** A declaration the way `canfail.json` writes one, with canfail's keys on it. */
const declaration = {
  checks: [
    {
      name: 'Type check',
      checkId: 'ci-type-check',
      dependsOn: ['.github/workflows/ci.yml', 'packages', 'tsconfig.base.json'],
      expected: 'The type check fails.',
      run: 'pnpm typecheck',
      timeout: 120,
      evidence: { expect: 'typecheck\\$ tsc --noEmit' },
      breaks: [
        {
          name: 'A plant.',
          file: 'packages/filter/src/types.ts',
          replace: 'a',
          with: 'b',
        },
      ],
    },
    {
      name: 'Record a run',
      checkId: 'ledger-record-validation',
      dependsOn: ['.github/workflows/record-run.yml'],
      expected: 'The recorder refuses the run.',
      run: 'pnpm ledger:validate',
      breaks: [
        {
          name: 'Another plant.',
          file: 'ledger/x.json',
          replace: 'a',
          with: 'b',
        },
      ],
    },
  ],
};

function checksOf(input: unknown = declaration): readonly DeclaredCheck[] {
  const parsed = parseDeclaredChecks(input);
  if (!parsed.ok) {
    throw new Error(`The fixture was refused: ${parsed.problems.join(', ')}`);
  }
  return parsed.value;
}

/** The ids the selection would replay, which is what a run is recorded against. */
function selected(changedPaths: readonly string[]): string[] {
  return checksTouchedBy({ checks: checksOf(), changedPaths }).map(
    (check) => check.checkId,
  );
}

describe('reading the dependency list', () => {
  it('reads the list beside each check', () => {
    expect(checksOf().map((check) => check.dependsOn)).toEqual([
      ['.github/workflows/ci.yml', 'packages', 'tsconfig.base.json'],
      ['.github/workflows/record-run.yml'],
    ]);
  });

  it('reads a check that declares no list as declaring an empty one', () => {
    expect(
      checksOf({
        checks: [{ name: 'Lint', checkId: 'ci-lint', run: 'pnpm lint' }],
      })[0]?.dependsOn,
    ).toEqual([]);
  });

  it('reads a dependency with a trailing slash as the same one without it', () => {
    expect(
      checksOf({
        checks: [
          { name: 'Lint', checkId: 'ci-lint', dependsOn: ['packages/'] },
        ],
      })[0]?.dependsOn,
    ).toEqual(['packages']);
  });

  /**
   * Each of these is a path git will never print, so an entry spelled that way
   * could only ever match nothing. A dependency that silently matches nothing
   * is the failure the list exists to avoid, so it is refused where it is
   * written rather than left to go quiet.
   */
  it.each([
    ['the empty string', ''],
    ['an absolute path', '/packages'],
    ['a path with a backslash', 'packages\\filter'],
    ['a path that climbs out of the repository', '../elsewhere'],
    ['a path with a doubled slash', 'packages//filter'],
    ['a path with a dot segment', 'packages/./filter'],
  ])('refuses %s as a dependency', (_name, dependency) => {
    const parsed = parseDeclaredChecks({
      checks: [{ name: 'Lint', checkId: 'ci-lint', dependsOn: [dependency] }],
    });

    expect(parsed.ok).toBe(false);
  });

  it('refuses a declaration with no checks in it', () => {
    expect(parseDeclaredChecks({ checks: [] }).ok).toBe(false);
  });

  it('refuses a check with no checkId, which is the address a run needs', () => {
    expect(
      parseDeclaredChecks({ checks: [{ name: 'Lint', run: 'pnpm lint' }] }).ok,
    ).toBe(false);
  });
});

describe('which checks a change touches', () => {
  /**
   * #68's first criterion. The assertion is the whole list, so it fails both
   * ways: if the touched check is missed, and if the untouched one comes with
   * it.
   */
  it('replays the check whose workflow changed and no other', () => {
    expect(selected(['.github/workflows/ci.yml'])).toEqual(['ci-type-check']);
  });

  it('replays the other check when the other workflow changed', () => {
    expect(selected(['.github/workflows/record-run.yml'])).toEqual([
      'ledger-record-validation',
    ]);
  });

  /** #68's second criterion: nothing on any list, so nothing is replayed. */
  it('replays nothing when the change touches nothing on any list', () => {
    expect(selected(['README.md', 'docs/roadmap-light.svg'])).toEqual([]);
  });

  it('replays nothing at all when nothing changed', () => {
    expect(selected([])).toEqual([]);
  });

  it('replays both when a change touches something on each list', () => {
    expect(
      selected([
        '.github/workflows/ci.yml',
        '.github/workflows/record-run.yml',
      ]),
    ).toEqual(['ci-type-check', 'ledger-record-validation']);
  });

  it('replays a check once however many of its dependencies changed', () => {
    expect(
      selected([
        '.github/workflows/ci.yml',
        'tsconfig.base.json',
        'packages/filter/src/types.ts',
      ]),
    ).toEqual(['ci-type-check']);
  });

  /**
   * #68's third task. A check whose list is missing is not replayed, so no
   * replay ever arrives for it and the thirty-day backstop takes it Stale
   * rather than leaving it Proven. The change below touches a file the check
   * plainly depends on, which is the realistic case: somebody added the check
   * and forgot the list.
   */
  it('never replays a check that declares no dependencies', () => {
    const checks = checksOf({
      checks: [
        { name: 'Lint', checkId: 'ci-lint', run: 'pnpm lint' },
        {
          name: 'Type check',
          checkId: 'ci-type-check',
          dependsOn: ['packages'],
        },
      ],
    });

    expect(
      checksTouchedBy({
        checks,
        changedPaths: ['eslint.config.js', 'packages/filter/src/types.ts'],
      }).map((check) => check.checkId),
    ).toEqual(['ci-type-check']);
  });

  it('never replays a check whose list is empty', () => {
    const checks = checksOf({
      checks: [{ name: 'Lint', checkId: 'ci-lint', dependsOn: [] }],
    });

    expect(
      checksTouchedBy({ checks, changedPaths: ['eslint.config.js'] }),
    ).toEqual([]);
  });
});

describe('what a dependency matches', () => {
  it('matches the file it names', () => {
    expect(dependencyMatches('canfail.json', 'canfail.json')).toBe(true);
  });

  it('matches a file inside the directory it names', () => {
    expect(dependencyMatches('packages', 'packages/filter/src/types.ts')).toBe(
      true,
    );
  });

  /**
   * The reason the separator is part of the comparison. A prefix test on the
   * text alone answers yes here, and `packages/filter-extra` is a different
   * package: a check depending on one would be replayed by a change to the
   * other, for ever, with nothing about the list looking wrong.
   */
  it('does not match a sibling whose name starts the same way', () => {
    expect(
      dependencyMatches('packages/filter', 'packages/filter-extra/src/a.ts'),
    ).toBe(false);
  });

  it('does not match a path that merely contains it', () => {
    expect(dependencyMatches('filter', 'packages/filter/src/a.ts')).toBe(false);
  });
});

describe('the declaration handed back to canfail', () => {
  /**
   * The selected checks are written out for canfail to run, so every key
   * canfail reads has to survive the trip. It reads `name`, `run`, `breaks`,
   * `timeout` and `evidence`, and this reader looks at none of the last four:
   * a version that rebuilt the object from what it understood would hand
   * canfail a check with nothing to break.
   */
  it('writes each check out exactly as the declaration held it', () => {
    expect(
      declarationOf(
        checksTouchedBy({
          checks: checksOf(),
          changedPaths: ['.github/workflows/ci.yml'],
        }),
      ),
    ).toEqual({ checks: [declaration.checks[0]] });
  });

  it('writes no checks when nothing was selected', () => {
    expect(declarationOf([])).toEqual({ checks: [] });
  });
});
