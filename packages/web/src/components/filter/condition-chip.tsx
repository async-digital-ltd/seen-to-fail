import type { Condition } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';

import { conditionPhrase, describeCondition } from '../../filter/wording';

interface ConditionChipProps {
  /** The id of the remove button, so focus can be sent to this condition. */
  readonly id: string;
  readonly condition: Condition;
  readonly onRemove: () => void;
}

/**
 * One condition, read as its field, its operator and its value, with the
 * button that takes it out of the filter. The button is named with the whole
 * phrase, so a screen reader hears which condition it removes rather than a
 * bare cross.
 */
export function ConditionChip({
  id,
  condition,
  onRemove,
}: ConditionChipProps): ReactElement {
  const { field, operator, value } = describeCondition(condition);
  return (
    <span className="chip">
      <span className="chip__words">
        <span className="chip__field">{field}</span>{' '}
        <span className="chip__operator">{operator}</span>
        {value === undefined ? null : (
          <>
            {' '}
            <span className="chip__value">{value}</span>
          </>
        )}
      </span>{' '}
      <button
        type="button"
        id={id}
        className="chip__remove"
        aria-label={`Remove ${conditionPhrase(condition)}`}
        onClick={onRemove}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </span>
  );
}
