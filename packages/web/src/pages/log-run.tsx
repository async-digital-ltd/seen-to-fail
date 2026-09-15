import type { Status } from '@seen-to-fail/filter';
import type { ReactElement, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useMutation, useQuery } from 'urql';

import { ErrorNotice } from '../components/error-notice';
import { ErrorSummary } from '../components/form/error-summary';
import type { FieldErrors } from '../components/form/field-errors';
import type { Choice } from '../components/form/fields';
import {
  DateField,
  SelectField,
  TextField,
  ToggleField,
} from '../components/form/fields';
import { useFormErrors } from '../components/form/use-form-errors';
import { Loading } from '../components/loading';
import type {
  LogTestRunInput,
  LogTestRunMutation,
  Outcome,
} from '../graphql/generated/graphql';
import {
  CheckOptionsDocument,
  LogTestRunDocument,
} from '../graphql/generated/graphql';
import { checkParameter, paths } from '../paths';
import type { StatusName } from '../status';
import { statusFromName } from '../status';
import { today } from '../today';
import './log-run.css';

/** The check a run was logged against, as it reads with the run counted. */
type LoggedCheck = Extract<
  LogTestRunMutation['logTestRun'],
  { __typename: 'TestRunLogged' }
>['check'];

type RunField = keyof LogTestRunInput;

/** The fields in the order the form lays them out. */
const runFields: readonly RunField[] = [
  'checkId',
  'runOn',
  'planted',
  'expected',
  'outcome',
  'note',
];

function idOf(field: RunField): string {
  return `run-${field}`;
}

const summaryId = 'run-errors';

const outcomes: readonly Choice<Outcome>[] = [
  { value: 'CAUGHT', label: 'Caught it' },
  { value: 'MISSED', label: 'Missed it' },
];

/** What the form holds while it is being filled in. */
interface Draft {
  readonly checkId: string;
  readonly runOn: string;
  readonly planted: string;
  readonly expected: string;
  readonly outcome: Outcome | null;
  readonly note: string;
}

type Checked =
  | { readonly ok: true; readonly input: LogTestRunInput }
  | { readonly ok: false; readonly errors: FieldErrors<RunField> };

/**
 * The form's own checks, run before anything is sent. Blank means blank once
 * trimmed, as it does to the API. The API makes the same checks and more; these
 * are here so that a form with a gap in it is answered at once.
 */
function checkDraft(draft: Draft, day: string): Checked {
  const errors: FieldErrors<RunField> = {};
  if (draft.checkId === '') {
    errors.checkId = 'Choose the check the defect was planted for.';
  }
  if (draft.runOn === '') {
    errors.runOn = 'Enter the day the defect was planted.';
  } else if (draft.runOn > day) {
    errors.runOn = 'A run cannot be dated after today.';
  }
  if (draft.planted.trim() === '') {
    errors.planted = 'Say what was planted.';
  }
  if (draft.expected.trim() === '') {
    errors.expected = 'Say what the check was expected to do.';
  }
  if (draft.outcome === null) {
    errors.outcome = 'Say whether the check caught it or missed it.';
  }
  if (draft.outcome === null || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      checkId: draft.checkId,
      runOn: draft.runOn,
      planted: draft.planted,
      expected: draft.expected,
      outcome: draft.outcome,
      note: draft.note.trim() === '' ? null : draft.note,
    },
  };
}

/**
 * What the check reads now, and what to do about it when that is not good. The
 * status word is the one every badge and tile shows.
 */
function reading(status: Status): string {
  const reads = `It reads ${status}`;
  switch (status) {
    case 'Proven':
      return `${reads} as of today.`;
    case 'Broken':
      return `${reads}. Fix the check, then log another run to prove it.`;
    case 'Stale':
      return `${reads}, because its latest run is too old to rely on. Log a recent run to prove it.`;
    case 'Unarmed':
      return `${reads}, because the last time somebody looked, it was switched off.`;
    case 'Unproven':
      return `${reads}.`;
  }
}

/**
 * The sentence the success card leads with.
 *
 * Logging a caught run usually reads Proven and a missed one Broken, but the
 * status is whatever the API worked out, not a guess from the outcome: a run
 * dated long ago can leave a check Stale, and a check somebody saw switched
 * off after the run's date stays Unarmed.
 */
export function loggedSentence(check: {
  readonly name: string;
  readonly runCount: number;
  readonly status: StatusName;
}): string {
  const runs =
    check.runCount === 1 ? '1 run' : `${String(check.runCount)} runs`;
  return `${check.name} now has ${runs}. ${reading(statusFromName(check.status))}`;
}

interface RunFormProps {
  readonly checks: readonly Choice<string>[];
  /** The check chosen when the form opens, or empty for none. */
  readonly initialCheck: string;
  /** Where Cancel goes. */
  readonly cancelTo: string;
  /** Puts focus on the first field once the form is on screen. */
  readonly focusOnMount: boolean;
  readonly onLogged: (check: LoggedCheck) => void;
}

function RunForm({
  checks,
  initialCheck,
  cancelTo,
  focusOnMount,
  onLogged,
}: RunFormProps): ReactElement {
  const [checkId, setCheckId] = useState(initialCheck);
  const [runOn, setRunOn] = useState(today);
  const [planted, setPlanted] = useState('');
  const [expected, setExpected] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState('');
  const errors = useFormErrors(runFields, idOf, summaryId);
  const [{ fetching, error: sendError }, logTestRun] =
    useMutation(LogTestRunDocument);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusOnMount) {
      document.getElementById(idOf('checkId'))?.focus();
    }
  }, [focusOnMount]);

  async function send(): Promise<void> {
    const checked = checkDraft(
      { checkId, runOn, planted, expected, outcome, note },
      today(),
    );
    if (!checked.ok) {
      errors.show(checked.errors);
      return;
    }
    errors.clear();

    const result = await logTestRun({ input: checked.input });
    const answer = result.data?.logTestRun;
    if (answer === undefined) {
      // The request itself failed, and the notice above the form says so.
      return;
    }
    if (answer.__typename === 'ValidationErrors') {
      errors.showFromApi(answer.errors);
      return;
    }
    onLogged(answer.check);
  }

  return (
    <form
      ref={form}
      className="form"
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
      <SelectField
        id={idOf('checkId')}
        label="Check"
        placeholder="Choose a check"
        choices={checks}
        value={checkId}
        onChange={setCheckId}
        error={errors.byField.checkId}
      />
      <DateField
        id={idOf('runOn')}
        label="Date"
        max={today()}
        value={runOn}
        onChange={setRunOn}
        error={errors.byField.runOn}
      />
      <TextField
        id={idOf('planted')}
        label="What you planted"
        multiline
        value={planted}
        onChange={setPlanted}
        error={errors.byField.planted}
      />
      <TextField
        id={idOf('expected')}
        label="What you expected"
        multiline
        value={expected}
        onChange={setExpected}
        error={errors.byField.expected}
      />
      <ToggleField
        id={idOf('outcome')}
        label="What you observed"
        choices={outcomes}
        value={outcome}
        onChange={setOutcome}
        error={errors.byField.outcome}
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
        <button type="submit" className="button button--primary">
          Save run
        </button>
        <Link to={cancelTo} className="button">
          Cancel
        </Link>
      </div>
    </form>
  );
}

interface RunLoggedProps {
  readonly check: LoggedCheck;
  readonly onLogAnother: () => void;
}

/**
 * Replaces the form once the run is saved. Focus moves to its sentence, so a
 * keyboard or screen reader user is told the run was saved and starts from the
 * card's buttons rather than from the top of the page.
 */
function RunLogged({ check, onLogAnother }: RunLoggedProps): ReactElement {
  const sentence = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    sentence.current?.focus();
  }, []);

  return (
    <div className="run-logged">
      <p ref={sentence} tabIndex={-1} className="run-logged__sentence">
        {loggedSentence(check)}
      </p>
      <div className="form__actions">
        <Link to={paths.checks()} className="button button--primary">
          Back to checks
        </Link>
        <button type="button" className="button" onClick={onLogAnother}>
          Log another run
        </button>
      </div>
    </div>
  );
}

/** A fresh form after a saved run, keeping the check the last one was for. */
interface Another {
  readonly round: number;
  readonly check: string;
}

/**
 * The form for logging a test run, at /runs/new.
 *
 * `?check=<id>` pre-selects a check, which is how a check's own page links
 * here. An id that is not in the list pre-selects nothing, and Cancel then goes
 * to the list rather than to a page for a check that is not there.
 *
 * Every visit starts afresh. The router keeps a screen mounted when a link
 * leads to the address it is already on, so without the key the top bar's
 * "Log a test run" would leave the success card where it was.
 */
export function LogRun(): ReactElement {
  const location = useLocation();
  return <LogRunVisit key={location.key} />;
}

function LogRunVisit(): ReactElement {
  const [searchParams] = useSearchParams();
  const [{ data, error }, reexecuteQuery] = useQuery({
    query: CheckOptionsDocument,
  });
  const [logged, setLogged] = useState<LoggedCheck | null>(null);
  const [another, setAnother] = useState<Another | null>(null);

  let body: ReactNode;
  if (logged !== null) {
    body = (
      <RunLogged
        check={logged}
        onLogAnother={() => {
          setAnother({ round: (another?.round ?? 0) + 1, check: logged.id });
          setLogged(null);
        }}
      />
    );
  } else if (data !== undefined) {
    const checks = data.checks.checks.map((check) => ({
      value: check.id,
      label: check.name,
    }));
    const requested = another?.check ?? searchParams.get(checkParameter) ?? '';
    const known = checks.some((check) => check.value === requested);
    body =
      checks.length === 0 ? (
        <p>
          There aren't any checks yet, so there's nothing to log a run against.{' '}
          <Link to={paths.newCheck()}>Add a check</Link> first.
        </p>
      ) : (
        <RunForm
          key={another?.round ?? 0}
          checks={checks}
          initialCheck={known ? requested : ''}
          cancelTo={known ? paths.check(requested) : paths.checks()}
          focusOnMount={another !== null}
          onLogged={setLogged}
        />
      );
  } else if (error !== undefined) {
    body = (
      <ErrorNotice
        error={error}
        onRetry={() => {
          reexecuteQuery({ requestPolicy: 'network-only' });
        }}
      />
    );
  } else {
    body = <Loading />;
  }

  return (
    <div className="log-run">
      <h1>Log a test run</h1>
      <p className="log-run__lede">
        One run is one planted defect. Record what you planted and what the
        check actually did, so the next person can repeat it.
      </p>
      {body}
    </div>
  );
}
