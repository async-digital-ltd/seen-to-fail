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
