import { STATUSES } from '@seen-to-fail/filter';
import { isEnumType } from 'graphql';
import { expect, it } from 'vitest';

import { buildSchema } from './schema.ts';
import { statusEvidence } from './status-evidence.ts';

/**
 * Which evidence a status was read from (#52). Each case below is one branch
 * of check_summaries, named by the status it returns and what the latest
 * observation said when it did.
 */

it('reads a status that names a run from the latest test run', () => {
  for (const status of ['Broken', 'Proven', 'Stale'] as const) {
    for (const lastArmed of [true, false, null]) {
      expect(statusEvidence(status, lastArmed)).toBe('TEST_RUN');
    }
  }
});

it('reads Unproven from the observation that found it switched on', () => {
  expect(statusEvidence('Unproven', true)).toBe('OBSERVATION');
});

it('reads Unarmed from the observation that found it switched off', () => {
  expect(statusEvidence('Unarmed', false)).toBe('OBSERVATION');
});

it('reads Unarmed with no observation as read from nothing', () => {
  expect(statusEvidence('Unarmed', null)).toBe('NOTHING');
});

it('refuses Unarmed beside an observation that found it on', () => {
  expect(() => statusEvidence('Unarmed', true)).toThrow(/Unarmed/u);
});

it('answers only with values the schema enum has, and uses every one', () => {
  const type = buildSchema().getType('StatusEvidence');
  if (!isEnumType(type)) {
    throw new Error('The schema has no enum called StatusEvidence.');
  }
  const schemaValues = type.getValues().map((value) => value.name);
  const answered = new Set<string>();
  for (const status of STATUSES) {
    for (const lastArmed of [true, false, null]) {
      if (status === 'Unarmed' && lastArmed === true) {
        continue;
      }
      answered.add(statusEvidence(status, lastArmed));
    }
  }
  expect([...answered].sort()).toStrictEqual([...schemaValues].sort());
});
