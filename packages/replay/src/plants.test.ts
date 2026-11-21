import { describe, expect, it } from 'vitest';

import { parsePlantedChecks } from './plants.ts';

/**
 * The plant declaration, read for the two things canfail does not read.
 *
 * Every declaration below carries canfail's own keys as well, because that is
 * what the real file looks like and because refusing them would mean this
 * reader could only read a config canfail cannot run.
 */

const canfailsOwnKeys = {
  run: 'pnpm typecheck',
  evidence: { expect: 'typecheck\\$ tsc --noEmit' },
  breaks: [
    {
      name: 'A plant.',
      file: 'a.ts',
      replace: 'a',
      with: 'b',
      expect: 'error TS[0-9]+',
    },
  ],
};

describe('reading the plant declaration', () => {
  it('reads a check address and its expectation from beside the plant', () => {
    const result = parsePlantedChecks({
      checks: [
        {
          name: 'Type check',
          checkId: 'ci-type-check',
          expected: 'The type check fails.',
          ...canfailsOwnKeys,
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.get('Type check')).toEqual({
      checkId: 'ci-type-check',
      expected: 'The type check fails.',
      breaks: ['A plant.'],
    });
  });

  it.each(['checkId', 'expected', 'name'])(
    'refuses a check that declares no %s',
    (key) => {
      const whole: Record<string, unknown> = {
        name: 'Type check',
        checkId: 'ci-type-check',
        expected: 'The type check fails.',
        ...canfailsOwnKeys,
      };
      const check = Object.fromEntries(
        Object.entries(whole).filter(([named]) => named !== key),
      );
      expect(Object.keys(check)).not.toContain(key);
      expect(parsePlantedChecks({ checks: [check] }).ok).toBe(false);
    },
  );

  /**
   * #71's objection to addressing a check by its name, arriving one level
   * down. A report naming a check declared twice could mean either of them,
   * and picking one would record a run against a check nobody chose.
   */
  it('refuses two checks sharing a name rather than picking one', () => {
    const result = parsePlantedChecks({
      checks: [
        {
          name: 'Type check',
          checkId: 'ci-type-check',
          expected: 'It fails.',
          ...canfailsOwnKeys,
        },
        {
          name: 'Type check',
          checkId: 'ci-lint',
          expected: 'It fails.',
          ...canfailsOwnKeys,
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toContain('Type check');
  });

  it('refuses a declaration with no checks in it', () => {
    expect(parsePlantedChecks({ checks: [] }).ok).toBe(false);
  });

  it('refuses a document that is not a declaration at all', () => {
    expect(parsePlantedChecks(null).ok).toBe(false);
    expect(parsePlantedChecks({ checks: 'ci-type-check' }).ok).toBe(false);
  });
});

describe('reading the declared breaks', () => {
  function withBreaks(breaks: unknown) {
    return parsePlantedChecks({
      checks: [
        {
          name: 'Type check',
          checkId: 'ci-type-check',
          expected: 'The type check fails.',
          run: 'pnpm typecheck',
          breaks,
        },
      ],
    });
  }

  it('reads the name of every declared break, in the order declared', () => {
    const result = withBreaks([
      {
        name: 'The first plant.',
        file: 'a.ts',
        replace: 'a',
        with: 'b',
        expect: 'TS1',
      },
      {
        name: 'The second plant.',
        file: 'b.ts',
        replace: 'b',
        with: 'c',
        expect: 'TS2',
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.get('Type check')?.breaks).toEqual([
      'The first plant.',
      'The second plant.',
    ]);
  });

  /**
   * A report files each outcome under a break's name, and a report is held to
   * the declared names one for one, so a break with no name is a plant no
   * outcome could be matched against.
   */
  it('refuses a break that declares no name', () => {
    expect(withBreaks([{ file: 'a.ts', replace: 'a', with: 'b' }]).ok).toBe(
      false,
    );
  });

  it('refuses a check that declares no breaks at all', () => {
    expect(withBreaks(undefined).ok).toBe(false);
  });

  it('refuses two breaks of one check sharing a name rather than picking one', () => {
    const result = withBreaks([
      {
        name: 'A plant.',
        file: 'a.ts',
        replace: 'a',
        with: 'b',
        expect: 'TS1',
      },
      {
        name: 'A plant.',
        file: 'b.ts',
        replace: 'b',
        with: 'c',
        expect: 'TS2',
      },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toContain('A plant.');
  });
});

/**
 * A plant that cannot show whether its check works (#294). Each refusal is
 * asserted on both halves: the unsound plant is refused, naming it, and the
 * same plant made sound is accepted, so a reader that refused everything
 * would fail here as surely as one that refused nothing.
 */
describe('refusing a plant that cannot show whether a check works', () => {
  function withBreak(planted: Record<string, unknown>) {
    return parsePlantedChecks({
      checks: [
        {
          name: 'Type check',
          checkId: 'ci-type-check',
          expected: 'The type check fails.',
          run: 'pnpm typecheck',
          breaks: [
            {
              name: 'The plant under test.',
              file: 'a.ts',
              expect: 'error TS[0-9]+',
              ...planted,
            },
          ],
        },
      ],
    });
  }

  function refusal(planted: Record<string, unknown>): string {
    const result = withBreak(planted);
    expect(result.ok).toBe(false);
    if (result.ok) return '';
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('The plant under test.');
    expect(result.problems[0]).toContain('Type check');
    return result.problems[0] ?? '';
  }

  it('accepts a plant that changes code', () => {
    expect(
      withBreak({
        replace: 'export const STALE_AFTER_DAYS = 30;',
        with: "export const STALE_AFTER_DAYS = '30';",
      }).ok,
    ).toBe(true);
  });

  it('refuses a plant whose text is replaced with the same text', () => {
    expect(
      refusal({ replace: 'const a = 1;', with: 'const a = 1;' }),
    ).toContain('the same text');
  });

  it('refuses a plant that changes only whitespace', () => {
    expect(
      refusal({ replace: 'const a = 1;', with: '  const a=1;\n\t' }),
    ).toContain('only whitespace or comments');
  });

  it.each([
    ['a.ts', 'const a = 1;', 'const a = 1; // a note'],
    ['a.ts', 'const a = 1;', '/* a note */ const a = 1;'],
    ['a.sh', 'exit 1', 'exit 1 # a note'],
    ['a.yml', 'run: pnpm lint', '# a note\nrun: pnpm lint'],
    ['a.sql', 'SELECT 1;', 'SELECT 1; -- a note'],
    ['a.html', '<p>a</p>', '<p>a</p><!-- a note -->'],
  ])('refuses a plant in %s that changes only comments', (file, from, to) => {
    expect(refusal({ file, replace: from, with: to })).toContain(
      'only whitespace or comments',
    );
  });

  /**
   * The comment rule is modest, and these are where it must not reach: a
   * `//` inside a URL and a `#` with no space before it are code, and a file
   * of no listed type is compared for whitespace alone.
   */
  it.each([
    ['a.ts', "fetch('http://a')", "fetch('http://b')"],
    ['a.sh', 'echo $#', 'echo $1'],
    ['a.txt', 'a', 'a // b'],
  ])(
    'accepts a plant in %s that changes what looks like a comment but is not',
    (file, from, to) => {
      expect(withBreak({ file, replace: from, with: to }).ok).toBe(true);
    },
  );

  it('refuses a break that declares no expect', () => {
    expect(refusal({ replace: 'a', with: 'b', expect: undefined })).toContain(
      'no expect',
    );
  });

  it.each(['', '  ', '.*', 'error', 'Error', 'fail', ' FAIL '])(
    'refuses the catch-all expect %j',
    (pattern) => {
      expect(refusal({ replace: 'a', with: 'b', expect: pattern })).toContain(
        'any failure at all would match',
      );
    },
  );

  it.each(['error TS[0-9]+', 'The published page carries a script'])(
    'accepts the specific expect %j',
    (pattern) => {
      expect(withBreak({ replace: 'a', with: 'b', expect: pattern }).ok).toBe(
        true,
      );
    },
  );
});
