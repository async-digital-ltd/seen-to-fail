import type { ReactElement } from 'react';
import { useId, useState } from 'react';
import { Link } from 'react-router';

import { OutcomeBadge } from '../../components/outcome-badge';
import { StatusBadge } from '../../components/status-badge';
import { counted, formatDay, lastCaughtLine } from '../../days';
import type { ChecksQuery } from '../../graphql/generated/graphql';
import { paths } from '../../paths';
import { statusFromName } from '../../status';
import './check-row.css';

/** One check as the list query selects it. */
export type ListedCheck = ChecksQuery['checks']['checks'][number];

interface CheckRowProps {
  readonly check: ListedCheck;
  /** The day every "last caught" figure on the page is counted back from. */
  readonly today: string;
}

/**
 * One check in the list: what it is and how it stands, on a line that opens
 * in place to show the runs behind the status.
 *
 * The whole line is one button, so the target is as wide as the row and a
 * keyboard reaches it in one stop. "Open check" sits beside it rather than
 * inside it, because a link inside a button is neither a link nor a button to
 * assistive technology. The spaces between the button's parts keep its
 * accessible name in words; as flex items the parts are spaced by the layout.
 */
export function CheckRow({ check, today }: CheckRowProps): ReactElement {
  const [open, setOpen] = useState(false);
  const nameId = useId();
  const detailsId = useId();

  return (
    <li className="check-row">
      <div className="check-row__line">
        <button
          type="button"
          className="check-row__toggle"
          aria-expanded={open}
          aria-controls={open ? detailsId : undefined}
          onClick={() => {
            setOpen(!open);
          }}
        >
          <span className="check-row__identity">
            <span id={nameId} className="check-row__name">
              {check.name}
            </span>{' '}
            <span className="check-row__area">{check.area}</span>
          </span>{' '}
          <span className="check-row__facts">
            <StatusBadge status={statusFromName(check.status)} />{' '}
            <span className="check-row__caught">
              {lastCaughtLine(check.lastCaughtOn, today)}
            </span>{' '}
            <span className="check-row__run-count">
              {counted(check.runCount, 'run')}
            </span>{' '}
            <span className="check-row__caret" aria-hidden="true">
              {open ? '▲' : '▼'}
            </span>
          </span>
        </button>
        <Link
          to={paths.check(check.id)}
          className="check-row__open"
          aria-describedby={nameId}
        >
          Open check
        </Link>
      </div>
      {open ? (
        <div id={detailsId} className="check-row__details">
          <RunsOf check={check} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The runs behind a check's status, in the order the API gives them, which is
 * newest first. A check with none gets the next step instead of an empty list.
 */
function RunsOf({ check }: { readonly check: ListedCheck }): ReactElement {
  if (check.runs.length === 0) {
    return (
      <div className="check-row__no-runs">
        <p>
          Nothing's been planted for this check yet. Plant the defect it's there
          to catch, then log what it did.
        </p>
        <Link to={paths.newRun({ check: check.id })} className="button">
          Log a test run
        </Link>
      </div>
    );
  }

  return (
    <>
      <p className="check-row__runs-heading">Test runs</p>
      <ol className="run-list">
        {check.runs.map((run) => (
          <li key={run.id} className="run-list__run">
            <span className="run-list__day">{formatDay(run.runOn)}</span>{' '}
            <span className="run-list__outcome">
              <OutcomeBadge outcome={run.outcome} />
            </span>{' '}
            <span className="run-list__planted">{run.planted}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
