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
      expect: 'error',
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
      { name: 'The first plant.', file: 'a.ts', replace: 'a', with: 'b' },
      { name: 'The second plant.', file: 'b.ts', replace: 'b', with: 'c' },
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
      { name: 'A plant.', file: 'a.ts', replace: 'a', with: 'b' },
      { name: 'A plant.', file: 'b.ts', replace: 'b', with: 'c' },
    ]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toContain('A plant.');
  });
});
