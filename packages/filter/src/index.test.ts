import { expect, it } from 'vitest';

import {
  emptyFilter,
  filterSchema,
  JOINERS,
  MAX_CONDITIONS_PER_GROUP,
  MAX_DAYS,
  MAX_GROUPS,
  MAX_RUN_COUNT,
  packageName,
  parseFilter,
  STATUSES,
} from './index.ts';

it('exports its own name', () => {
  expect(packageName).toBe('@seen-to-fail/filter');
});

/**
 * The five names are a ruling, not an implementation detail: the API enum and
 * the web client both take their vocabulary from this list, so a rename or an
 * addition has to be made here and seen here.
 */
it('defines the status vocabulary once, in a fixed order', () => {
  expect(STATUSES).toEqual([
    'Unarmed',
    'Broken',
    'Proven',
    'Stale',
    'Unproven',
  ]);
});

it('exports the rest of the language through the package entry point', () => {
  expect(JOINERS).toEqual(['and', 'or']);
  expect(MAX_GROUPS).toBe(10);
  expect(MAX_CONDITIONS_PER_GROUP).toBe(10);
  expect(MAX_DAYS).toBe(1_721_426);
  expect(MAX_RUN_COUNT).toBe(2_147_483_647);
  expect(filterSchema.safeParse(emptyFilter).success).toBe(true);
});

it('round-trips the empty filter constant through the parser', () => {
  expect(parseFilter(emptyFilter)).toEqual({ ok: true, filter: emptyFilter });
});
