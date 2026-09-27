import { emptyFilter } from '@seen-to-fail/filter';
import type { Condition, GroupedFilter } from '@seen-to-fail/filter';
import { describe, expect, it } from 'vitest';

import {
  addCondition,
  addGroup,
  removeCondition,
  setFilterJoiner,
  setGroupJoiner,
} from './edits';

const unproven: Condition = { field: 'status', op: 'is', value: 'Unproven' };
const stale: Condition = { field: 'status', op: 'is', value: 'Stale' };
const inCi: Condition = { field: 'area', op: 'is', value: 'CI' };
const neverCaught: Condition = { field: 'lastCaught', op: 'never' };

/** Two groups, one per joiner: (status is Unproven OR status is Stale) AND area is CI. */
const unprovenOrStaleInCI: GroupedFilter = {
  kind: 'groups',
  joiner: 'and',
  groups: [
    { joiner: 'or', conditions: [unproven, stale] },
    { joiner: 'and', conditions: [inCi] },
  ],
};

describe('adding', () => {
  it('puts a condition at the end of the named group and touches no other', () => {
    expect(addCondition(unprovenOrStaleInCI, 1, neverCaught)).toEqual({
      ...unprovenOrStaleInCI,
      groups: [
        unprovenOrStaleInCI.groups[0],
        { joiner: 'and', conditions: [inCi, neverCaught] },
      ],
    });
  });

  it('puts a new group of one condition, joined by and, after the last', () => {
    expect(addGroup(unprovenOrStaleInCI, neverCaught)).toEqual({
      ...unprovenOrStaleInCI,
      groups: [
        ...unprovenOrStaleInCI.groups,
        { joiner: 'and', conditions: [neverCaught] },
      ],
    });
  });

  it('turns the empty filter into a filter of one group, joined by and', () => {
    expect(addGroup(emptyFilter, unproven)).toEqual({
      kind: 'groups',
      joiner: 'and',
      groups: [{ joiner: 'and', conditions: [unproven] }],
    });
  });

  it('refuses a group the filter does not have', () => {
    expect(() => addCondition(unprovenOrStaleInCI, 2, neverCaught)).toThrow(
      'The filter has no group 2.',
    );
  });
});

describe('removing', () => {
  it('takes one condition out of a group that keeps others', () => {
    expect(removeCondition(unprovenOrStaleInCI, 0, 0)).toEqual({
      ...unprovenOrStaleInCI,
      groups: [
        { joiner: 'or', conditions: [stale] },
        unprovenOrStaleInCI.groups[1],
      ],
    });
  });

  it('takes the group away with its last condition', () => {
    expect(removeCondition(unprovenOrStaleInCI, 1, 0)).toEqual({
      ...unprovenOrStaleInCI,
      groups: [unprovenOrStaleInCI.groups[0]],
    });
  });

  it('gives the empty filter when the last condition of the last group goes', () => {
    const oneCondition: GroupedFilter = {
      kind: 'groups',
      joiner: 'or',
      groups: [{ joiner: 'and', conditions: [inCi] }],
    };

    expect(removeCondition(oneCondition, 0, 0)).toEqual(emptyFilter);
  });

  it('leaves the filter as it was, and does not change it in place', () => {
    const before = structuredClone(unprovenOrStaleInCI);

    removeCondition(unprovenOrStaleInCI, 0, 1);
    addCondition(unprovenOrStaleInCI, 0, neverCaught);
    setGroupJoiner(unprovenOrStaleInCI, 0, 'and');

    expect(unprovenOrStaleInCI).toEqual(before);
  });
});

describe('joining', () => {
  it('switches how one group joins its conditions', () => {
    expect(setGroupJoiner(unprovenOrStaleInCI, 0, 'and')).toEqual({
      ...unprovenOrStaleInCI,
      groups: [
        { joiner: 'and', conditions: [unproven, stale] },
        unprovenOrStaleInCI.groups[1],
      ],
    });
  });

  it('switches how the filter joins its groups', () => {
    expect(setFilterJoiner(unprovenOrStaleInCI, 'or')).toEqual({
      ...unprovenOrStaleInCI,
      joiner: 'or',
    });
  });
});
