import type { ReactElement } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from 'urql';

import { ErrorNotice } from '../components/error-notice';
import { ErrorSummary } from '../components/form/error-summary';
import type { FieldErrors } from '../components/form/field-errors';
import type { Choice } from '../components/form/fields';
import { DateField, TextField, ToggleField } from '../components/form/fields';
import { useFormErrors } from '../components/form/use-form-errors';
import type { RecordArmingObservationInput } from '../graphql/generated/graphql';
import { RecordArmingObservationDocument } from '../graphql/generated/graphql';
import { today } from '../today';
import './record-observation.css';

type ObservationField = Exclude<keyof RecordArmingObservationInput, 'checkId'>;

/**
 * The fields in the order the form lays them out. The check is not one of
 * them: the form is on that check's page. A refusal on checkId has no field
 * to sit beside, so it is shown with the summary.
 */
const observationFields: readonly ObservationField[] = [
  'observedOn',
  'armed',
  'note',
];

type Seen = 'on' | 'off';

const seenChoices: readonly Choice<Seen>[] = [
  { value: 'on', label: 'It is on' },
  { value: 'off', label: 'It is off' },
];

/** What the form holds while it is being filled in. */
interface Draft {
  readonly observedOn: string;
  readonly seen: Seen | null;
  readonly note: string;
}

type Checked =
  | {
      readonly ok: true;
      readonly input: Omit<RecordArmingObservationInput, 'checkId'>;
    }
  | { readonly ok: false; readonly errors: FieldErrors<ObservationField> };

/**
 * The form's own checks, run before anything is sent. The API makes the same
 * checks, and the messages match its own, so a refusal reads the same
 * whichever side found it.
 */
function checkDraft(draft: Draft, day: string): Checked {
  const errors: FieldErrors<ObservationField> = {};
  if (draft.observedOn === '') {
    errors.observedOn = 'Enter the day you looked.';
  } else if (draft.observedOn > day) {
    errors.observedOn = 'An observation cannot be dated after today.';
  }
  if (draft.seen === null) {
    errors.armed = 'Say whether the check was on or off.';
  }
  if (draft.seen === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      observedOn: draft.observedOn,
      armed: draft.seen === 'on',
      note: draft.note.trim() === '' ? null : draft.note,
    },
  };
}

interface ObservationFormProps {
  /** The id prefix every control in this form is named from. */
  readonly idPrefix: string;
  readonly checkId: string;
  readonly onSaved: () => void;
}

function ObservationForm({
  idPrefix,
  checkId,
  onSaved,
}: ObservationFormProps): ReactElement {
  const [observedOn, setObservedOn] = useState(today);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [note, setNote] = useState('');
  const idOf = (field: ObservationField): string => `${idPrefix}-${field}`;
  const summaryId = `${idPrefix}-errors`;
  const errors = useFormErrors(observationFields, idOf, summaryId);
  const [{ fetching, error: sendError }, record] = useMutation(
    RecordArmingObservationDocument,
  );
  const form = useRef<HTMLFormElement>(null);

  // Opening the form is asking to fill it in, so the first field takes focus.
  useEffect(() => {
    document.getElementById(`${idPrefix}-observedOn`)?.focus();
  }, [idPrefix]);

  async function send(): Promise<void> {
    const checked = checkDraft({ observedOn, seen, note }, today());
    if (!checked.ok) {
      errors.show(checked.errors);
      return;
    }
    errors.clear();

    const result = await record({ input: { checkId, ...checked.input } });
    const answer = result.data?.recordArmingObservation;
    if (answer === undefined) {
      // The request itself failed, and the notice in the form says so.
      return;
    }
    if (answer.__typename === 'ValidationErrors') {
      errors.showFromApi(answer.errors);
      return;
    }
    onSaved();
  }

  return (
    <form
      ref={form}
      id={idPrefix}
      className="form record-observation__form"
      aria-label="Record an observation"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!fetching) {
          void send();
        }
      }}
    >
      <ErrorSummary
        id={summaryId}
        count={errors.count}
        unplaced={errors.unplaced}
      />
      {sendError === undefined ? null : (
        <ErrorNotice
          error={sendError}
          onRetry={() => {
            form.current?.requestSubmit();
          }}
        />
      )}
      <DateField
        id={idOf('observedOn')}
        label="Date"
        max={today()}
        value={observedOn}
        onChange={setObservedOn}
        error={errors.byField.observedOn}
      />
      <ToggleField
        id={idOf('armed')}
        label="What you found"
        choices={seenChoices}
        value={seen}
        onChange={setSeen}
        error={errors.byField.armed}
      />
      <TextField
        id={idOf('note')}
        label="Note"
        optional
        multiline
        value={note}
        onChange={setNote}
        error={errors.byField.note}
      />
      <div className="form__actions">
        {/* Not brick: the page's one brick action is its "Log a test run". */}
        <button type="submit" className="button">
          Save observation
        </button>
      </div>
    </form>
  );
}

interface RecordObservationProps {
  readonly checkId: string;
}

/**
 * "Record an observation" and the small form it opens, on a check's page.
 *
 * The control is a button that shows and hides the form, drawn as a link
 * because it sits in a line of text. Saving closes the form and puts focus
 * back on the control. The page's status and arming line then change by
 * themselves: the save returns the check, which is what tells the client's
 * cache that the page's own reading of that check is out of date.
 */
export function RecordObservation({
  checkId,
}: RecordObservationProps): ReactElement {
  const idPrefix = useId();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={toggle}
        type="button"
        className="record-observation__toggle"
        aria-expanded={open}
        aria-controls={open ? idPrefix : undefined}
        onClick={() => {
          setOpen(!open);
        }}
      >
        Record an observation
      </button>
      {open ? (
        <ObservationForm
          idPrefix={idPrefix}
          checkId={checkId}
          onSaved={() => {
            setOpen(false);
            toggle.current?.focus();
          }}
        />
      ) : null}
    </>
  );
}
