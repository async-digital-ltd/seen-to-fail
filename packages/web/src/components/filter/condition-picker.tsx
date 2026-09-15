import type { Condition } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from 'urql';

import type { Draft } from '../../filter/draft';
import { conditionFrom } from '../../filter/draft';
import type { Field } from '../../filter/wording';
import {
  fieldWords,
  FIELDS,
  operatorsOf,
  operatorWord,
} from '../../filter/wording';
import { AreasDocument } from '../../graphql/generated/graphql';
import { statusOrder } from '../../status';

/** The first letter up, for a field's word at the head of a list. */
function capitalised(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** The day counts and run counts a reader most often wants, one press each. */
const dayPresets = [7, 30, 60, 90] as const;
const runPresets = [0, 1, 5, 10] as const;

/** A fresh draft: a status condition with nothing chosen yet. */
function blank(field: Field): Draft {
  return { field, operator: operatorsOf(field)[0], text: '', number: '' };
}

interface ConditionPickerProps {
  /** Called with the condition once the language has accepted it. */
  readonly onAdd: (condition: Condition) => void;
  readonly onCancel: () => void;
}

/**
 * The inline picker: a field, an operator and a value, in three columns, and
 * a button that adds the condition they describe.
 *
 * The operator column offers the field's own operators and nothing else, and
 * the value column takes the shape the field needs: a list of the five
 * statuses, a text box that suggests the areas the workspace already has, or a
 * number with the counts a reader most often wants a press away. What "Add"
 * sends is what `conditionFrom` hands back, which is the language's own
 * reading of the draft, so the picker cannot produce a condition the language
 * would refuse; a draft it refuses stays in the picker with the reason beside
 * it.
 *
 * It is a form, so Enter in a box adds and Escape cancels, and focus lands on
 * the field when it opens.
 */
export function ConditionPicker({
  onAdd,
  onCancel,
}: ConditionPickerProps): ReactElement {
  const id = useId();
  const fieldId = `${id}-field`;
  const operatorId = `${id}-operator`;
  const valueId = `${id}-value`;
  const areasId = `${id}-areas`;
  const messageId = `${id}-message`;

  const [draft, setDraft] = useState<Draft>(() => blank('status'));
  const [message, setMessage] = useState<string | null>(null);
  const field = useRef<HTMLSelectElement>(null);

  // Read afresh each time the picker opens, so an area added since the page
  // was first shown is offered. The answer is a convenience: the box takes
  // any text whether or not the list has arrived.
  const [{ data }] = useQuery({
    query: AreasDocument,
    requestPolicy: 'cache-and-network',
  });
  const areas = data?.areas ?? [];

  useEffect(() => {
    field.current?.focus();
  }, []);

  const changeField = (name: string): void => {
    const chosen = FIELDS.find((candidate) => candidate === name);
    if (chosen !== undefined) {
      setDraft(blank(chosen));
      setMessage(null);
    }
  };

  const changeOperator = (operator: string): void => {
    setDraft({ ...draft, operator });
    setMessage(null);
  };

  const changeText = (text: string): void => {
    setDraft({ ...draft, text });
    setMessage(null);
  };

  const changeNumber = (number: string): void => {
    setDraft({ ...draft, number });
    setMessage(null);
  };

  const add = (): void => {
    const result = conditionFrom(draft);
    if (result.ok) {
      onAdd(result.condition);
      return;
    }
    setMessage(result.message);
    document.getElementById(valueId)?.focus();
  };

  const invalid =
    message === null
      ? {}
      : { 'aria-invalid': true, 'aria-describedby': messageId };

  let value: ReactElement | null;
  switch (draft.field) {
    case 'status':
      value = (
        <select
          id={valueId}
          className="picker__control"
          value={draft.text}
          {...invalid}
          onChange={(event) => {
            changeText(event.target.value);
          }}
        >
          <option value="">Choose a status</option>
          {statusOrder.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      );
      break;
    case 'area':
      value = (
        <>
          <input
            id={valueId}
            className="picker__control"
            type="text"
            list={areasId}
            placeholder="Type or choose an area"
            value={draft.text}
            {...invalid}
            onChange={(event) => {
              changeText(event.target.value);
            }}
          />
          <datalist id={areasId}>
            {areas.map((area) => (
              <option key={area} value={area} />
            ))}
          </datalist>
        </>
      );
      break;
    case 'lastCaught':
    case 'runs': {
      if (draft.operator === 'never') {
        value = null;
        break;
      }
      const days = draft.field === 'lastCaught';
      const presets: readonly number[] = days ? dayPresets : runPresets;
      value = (
        <>
          <div
            className="picker__presets"
            role="group"
            aria-label="Common values"
          >
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                className="preset"
                aria-pressed={draft.number === String(preset)}
                onClick={() => {
                  changeNumber(String(preset));
                }}
              >
                {preset}
              </button>
            ))}
          </div>
          <span className="picker__number">
            <input
              id={valueId}
              className="picker__control picker__control--number"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={draft.number}
              {...invalid}
              onChange={(event) => {
                changeNumber(event.target.value);
              }}
            />{' '}
            <span className="muted">{days ? 'days' : 'runs'}</span>
          </span>
        </>
      );
      break;
    }
  }

  return (
    <form
      className="picker"
      aria-label="New condition"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        add();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="picker__column">
        <label htmlFor={fieldId} className="picker__label">
          Field
        </label>
        <select
          id={fieldId}
          ref={field}
          className="picker__control"
          value={draft.field}
          onChange={(event) => {
            changeField(event.target.value);
          }}
        >
          {FIELDS.map((name) => (
            <option key={name} value={name}>
              {capitalised(fieldWords[name])}
            </option>
          ))}
        </select>
      </div>
      <div className="picker__column">
        <label htmlFor={operatorId} className="picker__label">
          Operator
        </label>
        <select
          id={operatorId}
          className="picker__control"
          value={draft.operator}
          onChange={(event) => {
            changeOperator(event.target.value);
          }}
        >
          {operatorsOf(draft.field).map((operator) => (
            <option key={operator} value={operator}>
              {operatorWord(draft.field, operator)}
            </option>
          ))}
        </select>
      </div>
      {value === null ? null : (
        <div className="picker__column">
          <label htmlFor={valueId} className="picker__label">
            Value
          </label>
          {value}
        </div>
      )}
      {message === null ? null : (
        <p id={messageId} role="alert" className="picker__message">
          {message}
        </p>
      )}
      <div className="picker__actions">
        <button type="submit" className="button">
          Add
        </button>
        <button type="button" className="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
