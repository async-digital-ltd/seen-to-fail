import { MAX_CONDITIONS_PER_GROUP } from '@seen-to-fail/filter';
import type { Condition, Group, Joiner } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';

import { ConditionChip } from './condition-chip';
import { ConditionPicker } from './condition-picker';
import { JoinerPill } from './joiner-pill';

/** What the picker inside a group does when it finishes. */
export interface OpenPicker {
  readonly onAdd: (condition: Condition) => void;
  readonly onCancel: () => void;
}

interface ConditionGroupProps {
  /** Which group this is, counting from one, for its name. */
  readonly number: number;
  readonly group: Group;
  /** The id of the "+ condition" button, so focus can be sent back to it. */
  readonly addId: string;
  /** The picker, while one is open inside this group; undefined otherwise. */
  readonly picker: OpenPicker | undefined;
  readonly onOpenPicker: () => void;
  readonly onToggleJoiner: (joiner: Joiner) => void;
  readonly onRemove: (conditionIndex: number) => void;
}

/**
 * One group of the filter: its conditions as chips, the pill between each
 * pair that says how they join, and the way to add another.
 *
 * The pill sits between chips because that is where the word is read, so a
 * group of one condition shows none: its joiner is still in the filter, and
 * the pill appears with the second condition. Every pill in a group switches
 * the same joiner, since a group has one.
 *
 * The offer to add stops at the language's cap, so the bar never builds a
 * group the address would refuse to read back.
 */
export function ConditionGroup({
  number,
  group,
  addId,
  picker,
  onOpenPicker,
  onToggleJoiner,
  onRemove,
}: ConditionGroupProps): ReactElement {
  let footer: ReactElement | null;
  if (picker !== undefined) {
    footer = (
      <ConditionPicker onAdd={picker.onAdd} onCancel={picker.onCancel} />
    );
  } else if (group.conditions.length < MAX_CONDITIONS_PER_GROUP) {
    footer = (
      <button
        type="button"
        id={addId}
        className="filter-bar__add"
        onClick={onOpenPicker}
      >
        + condition
      </button>
    );
  } else {
    footer = null;
  }

  return (
    <div
      role="group"
      aria-label={`Condition group ${String(number)}`}
      className="filter-group"
    >
      <ul className="filter-group__conditions">
        {group.conditions.map((condition, index) => (
          <li key={index} className="filter-group__condition">
            {index > 0 ? (
              <>
                <JoinerPill
                  joiner={group.joiner}
                  level="group"
                  onToggle={onToggleJoiner}
                />{' '}
              </>
            ) : null}
            <ConditionChip
              condition={condition}
              onRemove={() => {
                onRemove(index);
              }}
            />
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}
