import {
  emptyFilter,
  MAX_CONDITIONS_PER_GROUP,
  MAX_GROUPS,
} from '@seen-to-fail/filter';
import type { Filter, FilterIssue } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { useHref, useLocation } from 'react-router';

import {
  addCondition,
  addGroup,
  removeCondition,
  setFilterJoiner,
  setGroupJoiner,
} from '../../filter/edits';
import { ConditionGroup } from './condition-group';
import { ConditionPicker } from './condition-picker';
import { CopyLink } from './copy-link';
import { JoinerPill } from './joiner-pill';
import './filter-bar.css';

/** Which picker is open: none, one inside a group, or one for a new group. */
type Picker =
  | { readonly kind: 'closed' }
  | { readonly kind: 'condition'; readonly group: number }
  | { readonly kind: 'group' };

const closed: Picker = { kind: 'closed' };

/**
 * Whether a picker has somewhere to add in a filter: its target is still there
 * and has room for one more.
 *
 * A reader opens a picker for the filter on screen, and a history step can put
 * a different filter on screen while the picker stays open. So the offer to
 * add is read off the filter the bar is showing, never off the click that
 * opened the picker: a picker whose target is full, or gone, is treated as
 * closed. The add reads that same filter, which is what keeps the address from
 * ever holding more groups or conditions than the language takes.
 */
function canShow(picker: Picker, filter: Filter): boolean {
  switch (picker.kind) {
    case 'closed':
      return true;
    case 'group':
      return filter.kind === 'empty' || filter.groups.length < MAX_GROUPS;
    case 'condition': {
      const group =
        filter.kind === 'groups' ? filter.groups[picker.group] : undefined;
      return (
        group !== undefined &&
        group.conditions.length < MAX_CONDITIONS_PER_GROUP
      );
    }
  }
}

/** The sentence under "No conditions": what the list shows instead. */
function listedSentence(total: number): string {
  return total === 1
    ? 'The only check is listed.'
    : `All ${String(total)} checks are listed.`;
}

interface FilterBarProps {
  readonly filter: Filter;
  /**
   * Called with the filter as it should read after a change. Where that goes
   * is the screen's decision; the bar holds no copy of the filter.
   */
  readonly onChange: (filter: Filter) => void;
  /** How many checks there are in all, for the sentence when none is hidden. */
  readonly total: number;
  /**
   * Why the address's filter was not read, for the notice. Undefined when it
   * was read, or when there was none.
   */
  readonly unreadable: readonly FilterIssue[] | undefined;
}

/**
 * The filter card: what narrows the list, as chips a reader can take away,
 * pills that switch how they join, and a picker that adds another.
 *
 * The bar is a view of the filter it is given and a source of the next one.
 * It keeps only what the filter cannot hold: which picker is open, and where
 * focus should go once the change it made has been drawn. Every change goes
 * out through `onChange` and comes back in through `filter`, so what the
 * chips show is always what the address holds.
 *
 * Focus is sent on after a change rather than left where it was, because the
 * control a reader just used has usually gone: the picker closes when it
 * adds, and a chip's remove button goes with the chip. It lands on the offer
 * to add another, in the same group where the group survives.
 */
export function FilterBar({
  filter,
  onChange,
  total,
  unreadable,
}: FilterBarProps): ReactElement {
  const id = useId();
  const headingId = `${id}-heading`;
  const addGroupId = `${id}-add-group`;
  const addConditionId = (group: number): string =>
    `${id}-add-${String(group)}`;

  const [picker, setPicker] = useState<Picker>(closed);
  const href = useHref(useLocation());

  const focusNext = useRef<string | null>(null);
  useEffect(() => {
    const target = focusNext.current;
    if (target !== null) {
      focusNext.current = null;
      document.getElementById(target)?.focus();
    }
  });

  /** Closes the picker and sends focus to the button that opened it. */
  const closePicker = (thenFocus: string): void => {
    focusNext.current = thenFocus;
    setPicker(closed);
  };

  /** Hands a changed filter on, with the picker closed and focus placed. */
  const change = (next: Filter, thenFocus: string): void => {
    focusNext.current = thenFocus;
    setPicker(closed);
    onChange(next);
  };

  const open = canShow(picker, filter) ? picker : closed;
  const groupPickerOpen = open.kind === 'group';
  const groupCount = filter.kind === 'empty' ? 0 : filter.groups.length;

  let body: ReactElement;
  if (filter.kind === 'empty' && !groupPickerOpen) {
    body = (
      <div className="filter-bar__none">
        <p>No conditions. {listedSentence(total)}</p>
        <button
          type="button"
          id={addGroupId}
          className="filter-bar__add"
          onClick={() => {
            setPicker({ kind: 'group' });
          }}
        >
          Add a condition
        </button>
      </div>
    );
  } else {
    let afterGroups: ReactElement | null;
    if (groupPickerOpen) {
      afterGroups = (
        <div className="filter-group filter-group--new">
          <ConditionPicker
            onAdd={(condition) => {
              change(addGroup(filter, condition), addGroupId);
            }}
            onCancel={() => {
              closePicker(addGroupId);
            }}
          />
        </div>
      );
    } else if (groupCount < MAX_GROUPS) {
      afterGroups = (
        <button
          type="button"
          id={addGroupId}
          className="filter-bar__add"
          onClick={() => {
            setPicker({ kind: 'group' });
          }}
        >
          + group
        </button>
      );
    } else {
      afterGroups = null;
    }

    body = (
      <div className="filter-bar__groups">
        {filter.kind === 'groups'
          ? filter.groups.map((group, index) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <JoinerPill
                    joiner={filter.joiner}
                    level="filter"
                    onToggle={(joiner) => {
                      onChange(setFilterJoiner(filter, joiner));
                    }}
                  />
                ) : null}
                <ConditionGroup
                  number={index + 1}
                  group={group}
                  addId={addConditionId(index)}
                  picker={
                    open.kind === 'condition' && open.group === index
                      ? {
                          onAdd: (condition) => {
                            change(
                              addCondition(filter, index, condition),
                              addConditionId(index),
                            );
                          },
                          onCancel: () => {
                            closePicker(addConditionId(index));
                          },
                        }
                      : undefined
                  }
                  onOpenPicker={() => {
                    setPicker({ kind: 'condition', group: index });
                  }}
                  onToggleJoiner={(joiner) => {
                    onChange(setGroupJoiner(filter, index, joiner));
                  }}
                  onRemove={(conditionIndex) => {
                    const next = removeCondition(filter, index, conditionIndex);
                    const groupSurvives =
                      next.kind === 'groups' &&
                      next.groups.length === groupCount;
                    change(
                      next,
                      groupSurvives ? addConditionId(index) : addGroupId,
                    );
                  }}
                />
              </Fragment>
            ))
          : null}
        {afterGroups}
      </div>
    );
  }

  return (
    <section className="filter-bar" aria-labelledby={headingId}>
      <div className="filter-bar__head">
        <h2 id={headingId} className="filter-bar__title">
          Filter
        </h2>
        <div className="filter-bar__actions">
          <CopyLink key={href} href={href} />
          <button
            type="button"
            className="button"
            disabled={filter.kind === 'empty'}
            onClick={() => {
              change(emptyFilter, addGroupId);
            }}
          >
            Clear
          </button>
        </div>
      </div>
      {unreadable === undefined ? null : (
        // An alert, as the error notice is: a reader who followed the link
        // is looking at a list it did not ask for, and should hear why first.
        <p role="alert" className="filter-bar__notice">
          The filter in this link couldn't be read, so every check is listed.{' '}
          <span className="muted">{unreadable[0]?.message}</span>
        </p>
      )}
      {body}
    </section>
  );
}
