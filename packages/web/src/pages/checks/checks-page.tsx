import { emptyFilter } from '@seen-to-fail/filter';
import type { Filter, Status } from '@seen-to-fail/filter';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import type { UseQueryState } from 'urql';
import { useQuery } from 'urql';

import { ErrorNotice } from '../../components/error-notice';
import { FilterBar } from '../../components/filter/filter-bar';
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
 * the filter, so changing the filter re-reads only the list, and the tiles,
 * the lede and the filter bar stay on screen while it does.
 *
 * The tiles and the bar both change the list the same way, by putting a
 * filter in the address, and the bar shows whatever the address holds. So a
 * tile's filter appears in the bar as a chip, and a chip added in the bar is
 * in the link the reader copies.
 */
export function ChecksPage(): ReactElement {
  const { filter, setFilter, unreadable } = useFilter();
  // Read from the network on every visit, not only when the cache is cold.
  // The answer is a StatusCounts, which is a type no mutation returns, so the
  // document cache has nothing to invalidate it on: a check written a moment
  // ago is in the list, which does hold Checks and is re-read, while the
  // counts beside it still describe the workspace as it was. At a total of
  // nothing that is not a tile one short, it is the empty state below,
  // standing in front of a list that already has the check in it.
  const [counts, reexecuteCounts] = useQuery({
    query: StatusCountsDocument,
    requestPolicy: 'cache-and-network',
  });
  // Read from the network on every visit, for a reason of its own. A list
  // holding Checks is re-read when a mutation answers with one, but an empty
  // list holds none, so there is no Check in the cached answer for the write
  // to match and the first check added to a workspace does not appear in it.
  // The case that cannot invalidate itself is exactly the first-run one.
  const [list, reexecuteList] = useQuery({
    query: ChecksDocument,
    variables: { filter },
    requestPolicy: 'cache-and-network',
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
        <FilterBar
          filter={filter}
          onChange={setFilter}
          total={statusCounts.total}
          unreadable={unreadable}
        />
        <CheckList
          result={list}
          onRetry={retryList}
          onClear={() => {
            setFilter(emptyFilter);
          }}
        />
        {/*
          The way to the form once the workspace has anything in it. The empty
          state's button is the other one, and it is gone by the time this
          shows, so between them the form is reachable whatever the list holds.
          A link rather than a button: the screen's one filled action is spent
          on the empty state's, and adding a check is not what a reader came to
          this page to do.
        */}
        <p className="checks-page__add">
          <Link to={paths.newCheck()}>Add a check</Link>
        </p>
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
