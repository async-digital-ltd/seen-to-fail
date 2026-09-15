import { expect, it } from 'vitest';

import type { Condition, Filter, Group } from './types.ts';

/**
 * These tests are proved by the compiler as much as by the runner.
 *
 * Each `@ts-expect-error` asserts that the line below it does not type-check.
 * If the language ever widens enough to admit one of these, the directive
 * becomes unused and `tsc` fails the build, which is the point: the acceptance
 * criterion is that an invalid condition cannot be held, not merely that it is
 * rejected once someone tries to parse it.
 *
 * Each value is still read at runtime so that a directive cannot quietly mask
 * an unused binding instead of the mistake it was aimed at.
 */

it('will not type a field with an operator it does not have', () => {
  // @ts-expect-error an area is compared with is or isNot, never with moreThan.
  const impossible: Condition = { field: 'area', op: 'moreThan', value: 'ci' };

  expect(impossible.field).toBe('area');
});

it('will not type a status outside the five', () => {
  // @ts-expect-error the status vocabulary is closed to the five known names.
  const impossible: Condition = { field: 'status', op: 'is', value: 'Passing' };

  expect(impossible.field).toBe('status');
});

it('will not type a condition without the value its operator needs', () => {
  // @ts-expect-error moreThan has nothing to compare against without a count.
  const impossible: Condition = { field: 'runs', op: 'moreThan' };

  expect(impossible.field).toBe('runs');
});

it('will not type a group holding no conditions', () => {
  // @ts-expect-error a group holds at least one condition.
  const impossible: Group = { joiner: 'and', conditions: [] };

  expect(impossible.conditions).toHaveLength(0);
});

it('will not type a grouped filter holding no groups', () => {
  // @ts-expect-error a grouped filter holds at least one group.
  const impossible: Filter = { kind: 'groups', joiner: 'and', groups: [] };

  expect(impossible.kind).toBe('groups');
});
