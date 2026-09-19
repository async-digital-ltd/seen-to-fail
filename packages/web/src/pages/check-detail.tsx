import type { Status } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';
import { useId, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from 'urql';

import { ErrorNotice } from '../components/error-notice';
import { Loading } from '../components/loading';
import { OutcomeBadge } from '../components/outcome-badge';
import { StatusBadge } from '../components/status-badge';
import { ago, counted, daysAgo, formatDay, lastCaughtLine } from '../days';
import type { CheckDetailQuery } from '../graphql/generated/graphql';
import { CheckDetailDocument } from '../graphql/generated/graphql';
import { paths } from '../paths';
import { statusFromName } from '../status';
import { today } from '../today';
import './check-detail.css';
import type { SavedObservation } from './record-observation';
import { ObservationForm } from './record-observation';

type RecordedCheck = NonNullable<CheckDetailQuery['check']>;
type Run = RecordedCheck['runs'][number];
type Observation = RecordedCheck['armingObservations'][number];

/**
 * What to do next, by status: the sentence the page leads with, or null for a
 * status that asks for nothing. Proven is the only one; its evidence is
 * already recent and already a catch.
 *
 * Keyed by the filter language's statuses, so a status added there and not
 * here fails to compile rather than rendering a page with no advice.
 */
const nextSteps = {
  Proven: () => null,
  Stale: (check, day) => {
    if (check.lastCaughtOn === null) {
      // Stale means the latest run caught, so the API has a day for it. A
      // check that reads Stale without one is a fault in the API, and saying
      // so beats a sentence with no number in it.
      throw new Error(
        `The check ${check.id} reads Stale and has never caught.`,
      );
    }
    const age = counted(daysAgo(check.lastCaughtOn, day), 'day');
    return `The last proof is ${age} old. Log a new test run to confirm this check still catches what it should.`;
  },
  Broken: () =>
    'The latest planted defect was missed. Fix the check, then log another run to prove it.',
  Unproven: () =>
    'This check has never been seen to catch anything. Plant the defect it exists for and log what happens.',
  Unarmed: () =>
    'There is no evidence this check is switched on. Confirm it is on, then plant a defect.',
} as const satisfies Record<
  Status,
  (check: RecordedCheck, today: string) => string | null
>;

/** The first letter up, for a phrase that starts a line on its own. */
function capitalised(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** What one observation found, as the page words it. */
function finding(armed: boolean): string {
  return armed ? 'Found switched on' : 'Found switched off';
}

/**
 * What the latest observation found, and when. The observations come newest
 * first, so the latest is the first, and it is the same one the status was
 * worked out from.
 */
function latestObservationLine(check: RecordedCheck, day: string): string {
  const [latest] = check.armingObservations;
  if (latest === undefined) {
    return 'Never checked';
  }
  return `${finding(latest.armed)}, ${ago(latest.observedOn, day)}`;
}

/** What the latest run did, and when. Runs also come newest first. */
function latestRunLine(check: RecordedCheck, day: string): string {
  const [latest] = check.runs;
  if (latest === undefined) {
    return 'None yet';
  }
  const did = latest.outcome === 'MISSED' ? 'Missed it' : 'Caught it';
  return `${did}, ${ago(latest.runOn, day)}`;
}

/**
 * The text a check was described with, or a muted line saying nobody has
 * written it yet. Only a name and an area are required, and an empty space
 * would read as a page that failed to load.
 */
function WrittenDown({ text }: { readonly text: string }): ReactElement {
  return text.trim() === '' ? (
    <p className="muted">Not written down yet</p>
  ) : (
    <p>{text}</p>
  );
}

interface EntryProps<T> {
  readonly entry: T;
  readonly today: string;
}

/** When an entry was recorded: how long ago, then the day. */
function When({
  day,
  today: now,
}: {
  readonly day: string;
  readonly today: string;
}): ReactElement {
  return (
    <div className="evidence-entry__when">
      <p className="evidence-entry__age">{capitalised(ago(day, now))}</p>
      <p className="muted">{formatDay(day)}</p>
    </div>
  );
}

/** One observation: when, what was found, and the note if one was written. */
function ObservationEntry({
  entry,
  today: day,
}: EntryProps<Observation>): ReactElement {
  const modifier = entry.armed ? 'on' : 'off';
  return (
    <article className="evidence-entry">
      <When day={entry.observedOn} today={day} />
      <div className="evidence-entry__what">
        <p className={`finding finding--${modifier}`}>
          <span
            className={`finding__glyph finding__glyph--${modifier}`}
            aria-hidden="true"
          >
            {entry.armed ? '✓' : '✕'}
          </span>
          {finding(entry.armed)}
        </p>
        {entry.note === null ? null : (
          <p className="muted evidence-entry__note">{entry.note}</p>
        )}
      </div>
    </article>
  );
}

/** The first seven characters of a commit, as git and GitHub abbreviate it. */
function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/**
 * Where a run came from, as the row that says so.
 *
 * Every run says this, including the ones a person typed in, because "by hand"
 * is the answer that matters most: it is the one that says the proof does not
 * keep itself. Leaving it off the hand runs and printing it only on replays
 * would make the absence carry the meaning, and an absence is the one thing a
 * reader cannot tell from a page that failed to load it.
 *
 * A replay names the commit it ran against and links the run that produced it,
 * so a reader can go and look rather than take the row's word for it. The
 * commit is shown and not linked: this screen does not know which repository
 * the check guards, and a link built from a guess is worse than no link.
 */
function CameFrom({ run }: { readonly run: Run }): ReactElement {
  if (run.source === 'HAND') {
    return <>By hand</>;
  }
  if (run.sourceCommit === null || run.sourceRunUrl === null) {
    // A replay carries both or the API refuses it, so this is the API being
    // wrong rather than a run with less to say. Saying so beats a row that
    // reads as a replay nobody can check.
    throw new Error(
      `A replay run on ${run.runOn} arrived without the commit it ran against or the run that produced it.`,
    );
  }
  return (
    <>
      By replay, against <code>{shortCommit(run.sourceCommit)}</code>.{' '}
      <a href={run.sourceRunUrl} rel="noreferrer">
        The run that produced it
      </a>
    </>
  );
}

/** One planted defect: when, what happened, and the four rows that say it. */
function RunEntry({ entry: run, today: day }: EntryProps<Run>): ReactElement {
  const missed = run.outcome === 'MISSED';
  return (
    <article className="evidence-entry">
      <When day={run.runOn} today={day} />
      <div className="evidence-entry__what">
        <OutcomeBadge outcome={run.outcome} />
        <dl className="evidence-entry__rows">
          <div>
            <dt>Planted</dt>
            <dd>{run.planted}</dd>
          </div>
          <div>
            <dt>Expected</dt>
            <dd>{run.expected}</dd>
          </div>
          <div>
            <dt>Observed</dt>
            <dd>{missed ? 'Missed it' : 'Caught it'}</dd>
          </div>
          <div>
            <dt>Came from</dt>
            <dd>
              <CameFrom run={run} />
            </dd>
          </div>
        </dl>
        {run.note === null ? null : (
          <p className="muted evidence-entry__note">{run.note}</p>
        )}
      </div>
    </article>
  );
}

interface CheckRecordProps {
  readonly check: RecordedCheck;
  readonly today: string;
}

/** Everything recorded about one check, and what to do about it next. */
function CheckRecord({ check, today: day }: CheckRecordProps): ReactElement {
  const protectsId = useId();
  const armedId = useId();
  const evidenceId = useId();
  const switchedOnId = useId();
  const worksId = useId();
  const observationsId = useId();
  const runsId = useId();
  const formId = useId();

  const [observing, setObserving] = useState(false);
  const [saved, setSaved] = useState<SavedObservation | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  const status = statusFromName(check.status);
  const nextStep = nextSteps[status](check, day);
  const meta = [
    check.area,
    counted(check.runCount, 'run'),
    `${String(check.caughtCount)} caught`,
    `${String(check.missedCount)} missed`,
  ].join(' · ');

  const observationCount = check.armingObservations.length;
  const observationSummary =
    observationCount === 0
      ? 'Nothing recorded yet'
      : `${counted(observationCount, 'observation')}, the latest ${ago(
          check.armingObservations[0]?.observedOn ?? day,
          day,
        )}`;
  const runSummary =
    check.runCount === 0
      ? 'Nothing recorded yet'
      : `${counted(check.runCount, 'run')}, ${String(check.caughtCount)} caught and ${String(check.missedCount)} missed`;

  return (
    <div className="check-detail">
      <Link to={paths.checks()} className="check-detail__back">
        <span aria-hidden="true">← </span>
        Checks
      </Link>

      {/*
       * The page's one dark surface. It is what makes arriving here read as
       * arriving somewhere, and it holds the status and what to do about it,
       * so that is what is read first (#50).
       */}
      <header className="check-detail__hero">
        <StatusBadge status={status} />
        <h1>{check.name}</h1>
        <p className="check-detail__meta">{meta}</p>
        {nextStep === null ? null : (
          <p className="check-detail__next">{nextStep}</p>
        )}
        <dl className="check-detail__latest">
          <div>
            <dt>Latest observation</dt>
            <dd>{latestObservationLine(check, day)}</dd>
          </div>
          <div>
            <dt>Latest test run</dt>
            <dd>{latestRunLine(check, day)}</dd>
          </div>
        </dl>
      </header>

      <div className="check-detail__about">
        <section aria-labelledby={protectsId}>
          <h2 id={protectsId} className="check-detail__label">
            What it protects
          </h2>
          <WrittenDown text={check.protects} />
        </section>
        <section aria-labelledby={armedId}>
          <h2 id={armedId} className="check-detail__label">
            How you can tell it is switched on
          </h2>
          <WrittenDown text={check.howToTellArmed} />
        </section>
      </div>

      {/*
       * The two kinds of evidence side by side, each saying which question it
       * answers, so the choice between them is made on the page (#52).
       */}
      <section className="check-detail__evidence" aria-labelledby={evidenceId}>
        <h2 id={evidenceId}>Evidence</h2>
        <p className="muted check-detail__lede">
          Two kinds, answering two different questions. The status is worked out
          from both.
        </p>
        <div className="check-detail__kinds">
          <section className="evidence-kind" aria-labelledby={switchedOnId}>
            <h3 id={switchedOnId}>Is it switched on?</h3>
            <p className="muted">
              An observation. Somebody looked at the check, without planting
              anything, and recorded what they found.
            </p>
            <p className="evidence-kind__count">{observationSummary}</p>
            {/* Not brick: the page's one brick action is its "Log a test run". */}
            <button
              ref={toggle}
              type="button"
              className="button button--outlined"
              aria-expanded={observing}
              aria-controls={observing ? formId : undefined}
              onClick={() => {
                setObserving(!observing);
                setSaved(null);
              }}
            >
              Record an observation
            </button>
          </section>
          <section className="evidence-kind" aria-labelledby={worksId}>
            <h3 id={worksId}>Does it work?</h3>
            <p className="muted">
              A test run. Somebody planted the defect this check exists to catch
              and saw what happened.
            </p>
            <p className="evidence-kind__count">{runSummary}</p>
            <Link
              to={paths.newRun({ check: check.id })}
              className="button button--primary"
            >
              Log a test run
            </Link>
          </section>
        </div>
        {observing ? (
          <ObservationForm
            id={formId}
            checkId={check.id}
            onSaved={(observation) => {
              setObserving(false);
              setSaved(observation);
              toggle.current?.focus();
            }}
          />
        ) : null}
      </section>

      <section
        className="check-detail__history"
        aria-labelledby={observationsId}
      >
        <div className="check-detail__history-heading">
          <h2 id={observationsId}>Observations</h2>
          {observationCount === 0 ? null : (
            <p className="muted">Newest first.</p>
          )}
        </div>
        {/*
         * Always in the page, empty until something is saved, so a screen
         * reader is listening before the words arrive (#51).
         */}
        <p className="check-detail__saved" role="status">
          {saved === null ? null : (
            <>
              <span
                className="finding__glyph finding__glyph--on"
                aria-hidden="true"
              >
                ✓
              </span>
              Observation saved: {finding(saved.armed).toLowerCase()},{' '}
              {ago(saved.observedOn, day)}.
            </>
          )}
        </p>
        {observationCount === 0 ? (
          <div className="evidence-entry evidence-entry--empty">
            <p className="check-detail__empty">Never checked</p>
            <p className="muted">
              Look at the check where it runs, then record whether you found it
              on or off.
            </p>
          </div>
        ) : (
          // In the order the API sends, which is newest first.
          <ol className="check-detail__entries">
            {check.armingObservations.map((observation) => (
              <li key={observation.id}>
                <ObservationEntry entry={observation} today={day} />
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="check-detail__history" aria-labelledby={runsId}>
        <div className="check-detail__history-heading">
          <h2 id={runsId}>Test runs</h2>
          {check.runs.length === 0 ? null : (
            <p className="muted">
              Newest first. {lastCaughtLine(check.lastCaughtOn, day)}.
            </p>
          )}
        </div>
        {check.runs.length === 0 ? (
          <div className="evidence-entry evidence-entry--empty">
            <p className="check-detail__empty">No runs yet</p>
            <p className="muted">
              Plant the defect this check exists to catch, then log what it did.
            </p>
          </div>
        ) : (
          // In the order the API sends, which is newest first. The client
          // cannot sort them itself: two runs on the same day are ordered by
          // when each was written down, and that is not something it is sent.
          <ol className="check-detail__entries">
            {check.runs.map((run) => (
              <li key={run.id}>
                <RunEntry entry={run} today={day} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

/** An id nothing is recorded under. Says so, and points back at the list. */
function CheckNotFound(): ReactElement {
  return (
    <>
      <h1>Check not found</h1>
      <p>
        There's no check recorded at this address.{' '}
        <Link to={paths.checks()}>Back to the checks</Link>.
      </p>
    </>
  );
}

/**
 * `/checks/:id`: one check, its evidence, and the next thing to do about it.
 *
 * Every figure and every "days ago" is computed from what the API returns and
 * the reader's today, so nothing on the page is typed in.
 */
export function CheckDetail(): ReactElement {
  const { id = '' } = useParams();
  const [{ data, fetching, error }, reexecuteQuery] = useQuery({
    query: CheckDetailDocument,
    variables: { id },
  });

  if (fetching) {
    return <Loading />;
  }
  if (error !== undefined) {
    return (
      <ErrorNotice
        error={error}
        onRetry={() => {
          reexecuteQuery({ requestPolicy: 'network-only' });
        }}
      />
    );
  }
  if (data === undefined) {
    return <Loading />;
  }
  if (data.check === null) {
    return <CheckNotFound />;
  }
  return <CheckRecord check={data.check} today={today()} />;
}
