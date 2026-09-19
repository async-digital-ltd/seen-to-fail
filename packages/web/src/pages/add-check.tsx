import type { ReactElement } from 'react';
import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery } from 'urql';

import { ErrorNotice } from '../components/error-notice';
import { ErrorSummary } from '../components/form/error-summary';
import type { FieldErrors } from '../components/form/field-errors';
import { SubmitButton, TextField } from '../components/form/fields';
import { useFormErrors } from '../components/form/use-form-errors';
import type { CreateCheckInput } from '../graphql/generated/graphql';
import {
  AreasDocument,
  CreateCheckDocument,
} from '../graphql/generated/graphql';
import { paths } from '../paths';
import './add-check.css';

type CheckField = keyof CreateCheckInput;

/**
 * The fields in the order the form lays them out, which is the order errors
 * are read in and the order focus visits them.
 */
const checkFields: readonly CheckField[] = [
  'name',
  'area',
  'protects',
  'howToTellArmed',
];

function idOf(field: CheckField): string {
  return `check-${field}`;
}

const summaryId = 'check-errors';

/** What the form holds while it is being filled in. */
interface Draft {
  readonly name: string;
  readonly area: string;
  readonly protects: string;
  readonly howToTellArmed: string;
}

type Checked =
  | { readonly ok: true; readonly input: CreateCheckInput }
  | { readonly ok: false; readonly errors: FieldErrors<CheckField> };

/**
 * The form's own checks, run before anything is sent. Only a name and an area
 * are required, and blank means blank once trimmed, as it does to the API.
 *
 * What the check protects and how to tell it is switched on are sent as they
 * were typed, blank included. The API trims them and stores a blank one as
 * empty text, which is how the record says nobody has written it down. Sending
 * nothing at all is not an option the schema offers, and it would not mean the
 * same thing if it were.
 */
function checkDraft(draft: Draft): Checked {
  const errors: FieldErrors<CheckField> = {};
  if (draft.name.trim() === '') {
    errors.name = 'Give the check a name.';
  }
  if (draft.area.trim() === '') {
    errors.area = 'Say where the check runs.';
  }
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      name: draft.name,
      area: draft.area,
      protects: draft.protects,
      howToTellArmed: draft.howToTellArmed,
    },
  };
}

/**
 * The form for adding a check, at /checks/new.
 *
 * On success it goes to the new check's own page, which is where the reader
 * would go next to plant a defect against it. A check with nothing logged
 * against it reads Unarmed, on that page and in the list, until an observation
 * or a run says otherwise.
 *
 * The list does not have to be told about the new check. The mutation answers
 * with a Check, and the client's document cache re-reads every query holding
 * one, which the list is.
 *
 * A query that holds no Check is not re-read, and there are two of them: the
 * areas below, and the status counts beside the list. Each says at its own
 * call why it reads cache-and-network instead.
 */
export function AddCheck(): ReactElement {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [protects, setProtects] = useState('');
  const [howToTellArmed, setHowToTellArmed] = useState('');
  const errors = useFormErrors(checkFields, idOf, summaryId);
  const [{ fetching, error: sendError }, createCheck] =
    useMutation(CreateCheckDocument);
  const form = useRef<HTMLFormElement>(null);
  const areasId = `${useId()}-areas`;

  // Read from the network on every visit, not only when the cache is cold.
  // The answer is a list of plain strings with no type of its own, so the
  // document cache has nothing to invalidate it on: a check created a moment
  // ago would bring a new area with it, and a cached answer would go on
  // offering the old list until the page was reloaded. The suggestions are a
  // convenience either way, since the box takes any text whether or not the
  // list has arrived.
  const [{ data }] = useQuery({
    query: AreasDocument,
    requestPolicy: 'cache-and-network',
  });
  const areas = data?.areas ?? [];

  async function send(): Promise<void> {
    const checked = checkDraft({ name, area, protects, howToTellArmed });
    if (!checked.ok) {
      errors.show(checked.errors);
      return;
    }
    errors.clear();

    const result = await createCheck({ input: checked.input });
    const answer = result.data?.createCheck;
    if (answer === undefined) {
      // The request itself failed, and the notice above the form says so.
      return;
    }
    if (answer.__typename === 'ValidationErrors') {
      // A name already in use is found as the row is written, so it arrives
      // here rather than from the checks above, and lands on the name field
      // because that is the path the API names.
      errors.showFromApi(answer.errors);
      return;
    }
    await navigate(paths.check(answer.id));
  }

  return (
    <div className="add-check">
      <h1>Add a check</h1>
      <p className="add-check__lede">
        A check is anything meant to catch a mistake before it lands. Name it
        and say where it runs; the rest can wait until you know it.
      </p>
      <form
        ref={form}
        className="form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void send();
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
        <TextField
          id={idOf('name')}
          label="Name"
          value={name}
          onChange={setName}
          error={errors.byField.name}
        />
        <TextField
          id={idOf('area')}
          label="Area"
          list={areasId}
          value={area}
          onChange={setArea}
          error={errors.byField.area}
        />
        <datalist id={areasId}>
          {areas.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
        <TextField
          id={idOf('protects')}
          label="What it protects"
          optional
          multiline
          value={protects}
          onChange={setProtects}
          error={errors.byField.protects}
        />
        <TextField
          id={idOf('howToTellArmed')}
          label="How you can tell it is switched on"
          optional
          multiline
          value={howToTellArmed}
          onChange={setHowToTellArmed}
          error={errors.byField.howToTellArmed}
        />
        <div className="form__actions">
          <SubmitButton label="Save check" busy={fetching} />
          <Link to={paths.checks()} className="button">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
