import { emptyFilter } from '@seen-to-fail/filter';
import type { Filter, Status } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import type { UseQueryState } from 'urql';
import { useQuery } from 'urql';

import { ErrorNotice } from '../../components/error-notice';
import { Loading } from '../../components/loading';
import { StatusTile } from '../../components/status-tile';
import { useFilter } from '../../filter/use-filter';
import type {
  ChecksQuery,
  ChecksQueryVariables,
  StatusCountsQuery,
} from '../../graphql/generated/graphql';
import {
  ChecksDocument,
  StatusCountsDocument,
} from '../../graphql/generated/graphql';
import { paths } from '../../paths';
import { statusOrder } from '../../status';
import { today } from '../../today';
import { CheckRow } from './check-row';
import { describeHidden, describeMatching, describeWorkspace } from './summary';
import './checks-page.css';

type StatusCounts = StatusCountsQuery['statusCounts'];

const loadingLabel = 'Loading checks…';

function countOf(counts: StatusCounts, status: Status): number {
  switch (status) {
    case 'Proven':
      return counts.proven;
    case 'Broken':
      return counts.broken;
    case 'Stale':
      return counts.stale;
    case 'Unproven':
      return counts.unproven;
    case 'Unarmed':
      return counts.unarmed;
  }
}

/** The filter a tile sets: that status, and nothing else. */
function onlyStatus(status: Status): Filter {
  return {
    kind: 'groups',
    joiner: 'and',
    groups: [
      {
        joiner: 'and',
        conditions: [{ field: 'status', op: 'is', value: status }],
      },
    ],
  };
}

/**
 * The home page: how the workspace stands, and the checks the filter selects.
 *
 * Two queries, read side by side. The counts are the whole workspace whatever
 * the filter, so changing the filter re-reads only the list, and the tiles and
 * the lede stay on screen while it does.
 */
export function ChecksPage(): ReactElement {
  const { filter, setFilter } = useFilter();
  const [counts, reexecuteCounts] = useQuery({ query: StatusCountsDocument });
  const [list, reexecuteList] = useQuery({
    query: ChecksDocument,
    variables: { filter },
  });

  const retryList = (): void => {
    reexecuteList({ requestPolicy: 'network-only' });
  };

  let body: ReactElement;
  if (counts.error !== undefined && !counts.fetching) {
    body = (
      <ErrorNotice
        error={counts.error}
        onRetry={() => {
          reexecuteCounts({ requestPolicy: 'network-only' });
          retryList();
        }}
      />
    );
  } else if (counts.data === undefined) {
    body = <Loading label={loadingLabel} />;
  } else if (counts.data.statusCounts.total === 0) {
    body = <EmptyWorkspace />;
  } else {
    const statusCounts = counts.data.statusCounts;
    body = (
      <>
        <p className="checks-page__lede">{describeWorkspace(statusCounts)}</p>
        <div
          className="checks-page__tiles"
          role="group"
          aria-label="Show the checks with one status"
        >
          {statusOrder.map((status) => (
            <StatusTile
              key={status}
              status={status}
              count={countOf(statusCounts, status)}
              onSelect={(selected) => {
                setFilter(onlyStatus(selected));
              }}
            />
          ))}
        </div>
        <CheckList
          result={list}
          onRetry={retryList}
          onClear={() => {
            setFilter(emptyFilter);
          }}
        />
      </>
    );
  }

  return (
    <>
      <h1>Checks</h1>
      {body}
    </>
  );
}

interface CheckListProps {
  readonly result: UseQueryState<ChecksQuery, ChecksQueryVariables>;
  readonly onRetry: () => void;
  readonly onClear: () => void;
}

/**
 * The result line and the checks under it, or why there are none.
 *
 * Today is read once here and handed to every row, so all the day figures in
 * one list are counted from the same day.
 */
function CheckList({ result, onRetry, onClear }: CheckListProps): ReactElement {
  if (result.error !== undefined && !result.fetching) {
    return <ErrorNotice error={result.error} onRetry={onRetry} />;
  }
  if (result.data === undefined) {
    return <Loading label={loadingLabel} />;
  }

  const { checks, matching, hidden } = result.data.checks;
  const hiddenLine = describeHidden(hidden);
  const asOf = today();

  return (
    <>
      <p className="checks-page__result">
        <span className="checks-page__matching">
          {describeMatching({ matching, hidden })}
        </span>
        {hiddenLine === undefined ? null : (
          <span className="checks-page__hidden">{hiddenLine}</span>
        )}
      </p>
      {checks.length === 0 ? (
        <div className="checks-page__no-match">
          <p>
            No checks match this filter. Remove a condition, or widen it with
            OR.
          </p>
          <button type="button" className="button" onClick={onClear}>
            Clear filter
          </button>
        </div>
      ) : (
        <ul className="checks-page__list">
          {checks.map((check) => (
            <CheckRow key={check.id} check={check} today={asOf} />
          ))}
        </ul>
      )}
    </>
  );
}

/** A workspace with nothing in it yet, and the one way to start. */
function EmptyWorkspace(): ReactElement {
  return (
    <section className="checks-page__empty">
      <h2>No checks yet</h2>
      <p>
        A check is anything that's meant to catch a mistake before it lands: a
        lint rule, a hook, a required step in a pipeline. Add one, then plant
        the defect it exists for and log what it did.
      </p>
      <Link to={paths.newCheck()} className="button button--primary">
        Add a check
      </Link>
    </section>
  );
}
