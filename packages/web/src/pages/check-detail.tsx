import type { Status } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';
import { useId } from 'react';
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
import { RecordObservation } from './record-observation';

type RecordedCheck = NonNullable<CheckDetailQuery['check']>;
type Run = RecordedCheck['runs'][number];

/**
 * What to do next, by status: the sentence the callout says, or null for a
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

/**
 * What the latest arming observation said, and when. The observations come
 * newest first, so the latest is the first, and it is the same one the status
 * was worked out from.
 */
function armingLine(check: RecordedCheck, day: string): string {
  const [latest] = check.armingObservations;
  if (latest === undefined) {
    return 'Never checked';
  }
  const seen = latest.armed ? 'Seen on' : 'Seen off';
  return `${seen}, ${ago(latest.observedOn, day)}`;
}

/**
 * The text a check was described with, or a muted line saying nobody has
 * written it yet. Only a name and an area are required, and an empty card
 * would read as a page that failed to load.
 */
function WrittenDown({ text }: { readonly text: string }): ReactElement {
  return text.trim() === '' ? (
    <p className="muted">Not written down yet</p>
  ) : (
    <p>{text}</p>
  );
}

interface RunCardProps {
  readonly run: Run;
  readonly today: string;
}

/** One planted defect: when, what happened, and the three rows that say it. */
function RunCard({ run, today: day }: RunCardProps): ReactElement {
  const missed = run.outcome === 'MISSED';
  return (
    <article className={missed ? 'run-card run-card--missed' : 'run-card'}>
      <div className="run-card__when">
        <p className="run-card__age">{capitalised(ago(run.runOn, day))}</p>
        <p className="muted">{formatDay(run.runOn)}</p>
      </div>
      <div className="run-card__what">
        <OutcomeBadge outcome={run.outcome} />
        <dl className="run-card__rows">
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
        </dl>
        {run.note === null ? null : (
          <p className="muted run-card__note">{run.note}</p>
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
  const runsId = useId();

  const status = statusFromName(check.status);
  const nextStep = nextSteps[status](check, day);
  const meta = [
    check.area,
    counted(check.runCount, 'run'),
    `${String(check.caughtCount)} caught`,
    `${String(check.missedCount)} missed`,
  ].join(' · ');

  return (
    <div className="check-detail">
      <Link to={paths.checks()} className="check-detail__back">
        <span aria-hidden="true">← </span>
        Checks
      </Link>

      <div className="check-detail__heading">
        <div className="check-detail__title">
          <h1>{check.name}</h1>
          <p className="muted check-detail__meta">{meta}</p>
        </div>
        <span className="check-detail__status">
          <StatusBadge status={status} />
        </span>
      </div>

      {nextStep === null ? null : (
        <div className="check-detail__callout">
          <p>{nextStep}</p>
          <Link
            to={paths.newRun({ check: check.id })}
            className="button button--primary"
          >
            Log a test run
          </Link>
        </div>
      )}

      <div className="check-detail__about">
        <section className="check-detail__card" aria-labelledby={protectsId}>
          <h2 id={protectsId} className="check-detail__label">
            What it protects
          </h2>
          <WrittenDown text={check.protects} />
        </section>
        <section className="check-detail__card" aria-labelledby={armedId}>
          <h2 id={armedId} className="check-detail__label">
            How you can tell it is switched on
          </h2>
          <WrittenDown text={check.howToTellArmed} />
          <div className="check-detail__arming">
            <p className="muted">{armingLine(check, day)}</p>
            <RecordObservation checkId={check.id} />
          </div>
        </section>
      </div>

      <section className="check-detail__runs" aria-labelledby={runsId}>
        <div className="check-detail__runs-heading">
          <h2 id={runsId}>Test runs</h2>
          {check.runs.length === 0 ? null : (
            <p className="muted">
              Newest first. {lastCaughtLine(check.lastCaughtOn, day)}.
            </p>
          )}
        </div>
        {check.runs.length === 0 ? (
          <div className="check-detail__card">
            <p className="check-detail__empty">No runs yet</p>
            <p className="muted">
              Plant the defect this check exists to catch, then log what it did.
            </p>
          </div>
        ) : (
          // In the order the API sends, which is newest first. The client
          // cannot sort them itself: two runs on the same day are ordered by
          // when each was written down, and that is not something it is sent.
          <ol className="check-detail__run-list">
            {check.runs.map((run) => (
              <li key={run.id}>
                <RunCard run={run} today={day} />
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
