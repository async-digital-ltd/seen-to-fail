import type { ReactElement, ReactNode } from 'react';

import './form.css';

/**
 * The controls a form is built from. Each one lays out the same way: the
 * label, then the message when the field is at fault, then the control. The
 * control names the message as its description and says it is invalid, and
 * the field's border turns red.
 *
 * Every field takes the id of its control. The form hands the same ids to
 * useFormErrors, which is how focus finds the first field at fault.
 */

interface FieldBase {
  /** The id of the control, which the label points at and focus lands on. */
  readonly id: string;
  readonly label: string;
  /** Adds "(optional)" to the label. */
  readonly optional?: boolean;
  /** The message to show beside the field, or undefined when it is fine. */
  readonly error?: string | undefined;
}

function errorIdOf(id: string): string {
  return `${id}-error`;
}

/** The attributes that tie a control to its message. */
function describedBy(id: string, error: string | undefined) {
  return error === undefined
    ? {}
    : { 'aria-invalid': true, 'aria-describedby': errorIdOf(id) };
}

function Optional({ optional }: { readonly optional: boolean }): ReactNode {
  return optional ? <span className="muted"> (optional)</span> : null;
}

function Message({
  id,
  error,
}: {
  readonly id: string;
  readonly error: string | undefined;
}): ReactNode {
  return error === undefined ? null : (
    <p id={errorIdOf(id)} className="field__error">
      {error}
    </p>
  );
}

function Frame({
  id,
  label,
  optional = false,
  error,
  children,
}: FieldBase & { readonly children: ReactNode }): ReactElement {
  return (
    <div className={error === undefined ? 'field' : 'field field--invalid'}>
      <label htmlFor={id} className="field__label">
        {label}
        <Optional optional={optional} />
      </label>
      <Message id={id} error={error} />
      {children}
    </div>
  );
}

interface TextFieldProps extends FieldBase {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** A box for a sentence or more, rather than a single line. */
  readonly multiline?: boolean;
  /** The id of a datalist whose options the single-line control suggests. */
  readonly list?: string;
}

/** A line of text, or a box of it. */
export function TextField({
  value,
  onChange,
  multiline = false,
  list,
  ...frame
}: TextFieldProps): ReactElement {
  const optional = frame.optional ?? false;
  const shared = {
    id: frame.id,
    className: 'field__control',
    value,
    required: !optional,
    ...describedBy(frame.id, frame.error),
  };
  return (
    <Frame {...frame}>
      {multiline ? (
        <textarea
          {...shared}
          rows={3}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      ) : (
        <input
          {...shared}
          type="text"
          list={list}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
    </Frame>
  );
}

interface DateFieldProps extends FieldBase {
  /** YYYY-MM-DD, or empty when the reader has cleared it. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** The last day the picker offers, as YYYY-MM-DD. */
  readonly max?: string;
}

/** A calendar day. */
export function DateField({
  value,
  onChange,
  max,
  ...frame
}: DateFieldProps): ReactElement {
  return (
    <Frame {...frame}>
      <input
        id={frame.id}
        className="field__control field__control--date"
        type="date"
        value={value}
        max={max}
        required={!(frame.optional ?? false)}
        {...describedBy(frame.id, frame.error)}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Frame>
  );
}

/** One choice in a select or a set of toggle buttons. */
export interface Choice<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

interface SelectFieldProps extends FieldBase {
  /** The chosen value, or empty when nothing is chosen yet. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly choices: readonly Choice<string>[];
  /** What the select shows before anything is chosen. */
  readonly placeholder: string;
}

/** One of a list, chosen from a select. */
export function SelectField({
  value,
  onChange,
  choices,
  placeholder,
  ...frame
}: SelectFieldProps): ReactElement {
  return (
    <Frame {...frame}>
      <select
        id={frame.id}
        className="field__control"
        value={value}
        required={!(frame.optional ?? false)}
        {...describedBy(frame.id, frame.error)}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{placeholder}</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </Frame>
  );
}

interface ToggleFieldProps<Value extends string> extends FieldBase {
  /** The pressed choice, or null before one is pressed. */
  readonly value: Value | null;
  readonly onChange: (value: Value) => void;
  readonly choices: readonly Choice<Value>[];
}

/**
 * One of a few, chosen by pressing a button.
 *
 * A fieldset, so the buttons are announced as one group under the label. `id`
 * goes on the first button, which is where focus lands when the field is at
 * fault. Every button names the message, because a fieldset is not a control
 * and a reader tabbing in meets a button first. Pressing the pressed button again leaves it pressed: a choice can be
 * changed but not taken back, since the field is there to be answered.
 */
export function ToggleField<Value extends string>({
  id,
  label,
  optional = false,
  error,
  value,
  onChange,
  choices,
}: ToggleFieldProps<Value>): ReactElement {
  return (
    <fieldset
      className={error === undefined ? 'field' : 'field field--invalid'}
    >
      <legend className="field__label">
        {label}
        <Optional optional={optional} />
      </legend>
      <Message id={id} error={error} />
      <div className="toggles">
        {choices.map((choice, index) => (
          <button
            key={choice.value}
            id={index === 0 ? id : undefined}
            type="button"
            className="toggle"
            aria-pressed={choice.value === value}
            {...(error === undefined
              ? {}
              : { 'aria-describedby': errorIdOf(id) })}
            onClick={() => {
              onChange(choice.value);
            }}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

interface SubmitButtonProps {
  /** What the button says, and what pressing it asks for. */
  readonly label: string;
  /** What it says instead while the form is waiting on the API. */
  readonly busyLabel?: string;
  /** True from the moment the form sends until the API answers. */
  readonly busy: boolean;
  /**
   * primary is the brick fill, for the screen's one primary action. outlined
   * is brick text and a brick border, for a form on a screen whose fill is
   * already spent.
   */
  readonly variant?: 'primary' | 'outlined';
}

/**
 * The button that sends a form, and the one guard against sending it twice.
 *
 * While the form is busy the button is disabled, and the browser enforces
 * that: a disabled submit button takes no click, and Enter in a field, which
 * submits through the form's default button, submits nothing while that
 * button is disabled. The form's submit handler makes no check of its own. A
 * second guard there would still send nothing when this one was taken away,
 * and the test that presses twice would go on passing with nothing left
 * holding the door.
 *
 * The label changes with it, so a slow save looks like a save under way rather
 * than a press that did nothing, which is the moment a reader presses again.
 * The button is not dimmed: the label is the sign the reader is waiting for,
 * and it has to stay readable.
 *
 * Disabling a focused button drops focus to the page. Every way a send can end
 * then puts it somewhere: a written record moves on or takes focus itself, a
 * refusal focuses the field at fault, and a failed request shows an alert,
 * which is announced wherever focus is.
 */
export function SubmitButton({
  label,
  busyLabel = 'Saving…',
  busy,
  variant = 'primary',
}: SubmitButtonProps): ReactElement {
  return (
    <button
      type="submit"
      className={`button button--${variant}`}
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? busyLabel : label}
    </button>
  );
}
