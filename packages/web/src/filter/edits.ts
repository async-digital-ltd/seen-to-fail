import { emptyFilter } from '@seen-to-fail/filter';
import type {
  Condition,
  Filter,
  Group,
  GroupedFilter,
  Joiner,
} from '@seen-to-fail/filter';

/**
 * The changes the filter bar makes to a filter, each a pure function from the
 * filter as it reads to the filter as it should read next.
 *
 * They are written in the language's own types, so none of them can build a
 * group with no conditions or a filter with no groups: removing the last
 * condition of a group removes the group, and removing the last group gives
 * the empty filter. What the bar writes into the address is therefore always
 * something the address will read back.
 *
 * The caps on how many groups and conditions a filter takes are not applied
 * here. The bar stops offering to add past them, which is where a reader
 * would otherwise meet the refusal.
 */

/** A group the filter holds, or a fault in the bar's own bookkeeping. */
function groupAt(filter: GroupedFilter, index: number): Group {
  const group = filter.groups[index];
  if (group === undefined) {
    throw new Error(`The filter has no group ${String(index)}.`);
  }
  return group;
}

/** The filter with one group swapped for another. */
function withGroup(
  filter: GroupedFilter,
  index: number,
  replacement: Group,
): GroupedFilter {
  const [first, ...rest] = filter.groups.map((group, at) =>
    at === index ? replacement : group,
  );
  if (first === undefined) {
    throw new Error('A filter with groups cannot have none.');
  }
  return { ...filter, groups: [first, ...rest] };
}

/** The same filter with a condition added to the end of one of its groups. */
export function addCondition(
  filter: GroupedFilter,
  groupIndex: number,
  condition: Condition,
): GroupedFilter {
  const group = groupAt(filter, groupIndex);
  return withGroup(filter, groupIndex, {
    joiner: group.joiner,
    conditions: [...group.conditions, condition],
  });
}

/**
 * The filter with a new group holding one condition after its last group, or
 * a filter of that one group when it was empty.
 *
 * A new group joins its conditions with `and`, and the first group of a filter
 * joins the groups with `and`, because that is what a reader adding one
 * condition at a time means by adding another. Either joiner is a pill away.
 */
export function addGroup(filter: Filter, condition: Condition): GroupedFilter {
  const group: Group = { joiner: 'and', conditions: [condition] };
  if (filter.kind === 'empty') {
    return { kind: 'groups', joiner: 'and', groups: [group] };
  }
  return { ...filter, groups: [...filter.groups, group] };
}

/**
 * The filter without one condition. The group goes with its last condition,
 * and the filter becomes the empty one with its last group.
 */
export function removeCondition(
  filter: GroupedFilter,
  groupIndex: number,
  conditionIndex: number,
): Filter {
  const group = groupAt(filter, groupIndex);
  const [firstCondition, ...restConditions] = group.conditions.filter(
    (_, at) => at !== conditionIndex,
  );

  if (firstCondition !== undefined) {
    return withGroup(filter, groupIndex, {
      joiner: group.joiner,
      conditions: [firstCondition, ...restConditions],
    });
  }

  const [firstGroup, ...restGroups] = filter.groups.filter(
    (_, at) => at !== groupIndex,
  );
  if (firstGroup === undefined) {
    return emptyFilter;
  }
  return { ...filter, groups: [firstGroup, ...restGroups] };
}

/** The same filter with one group joining its conditions the other way. */
export function setGroupJoiner(
  filter: GroupedFilter,
  groupIndex: number,
  joiner: Joiner,
): GroupedFilter {
  const group = groupAt(filter, groupIndex);
  return withGroup(filter, groupIndex, { ...group, joiner });
}

/** The same filter joining its groups the other way. */
export function setFilterJoiner(
  filter: GroupedFilter,
  joiner: Joiner,
): GroupedFilter {
  return { ...filter, joiner };
}
