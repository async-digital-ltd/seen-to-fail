import { screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router';
import { gql, useQuery } from 'urql';
import { expect, it } from 'vitest';

import { ErrorNotice } from '../components/error-notice';
import { Loading } from '../components/loading';
import type { StatusCountsQuery } from '../graphql/generated/graphql';
import { StatusCountsDocument } from '../graphql/generated/graphql';
import type { Answer } from './client';
import { answer, graphqlFailure, networkFailure, pending } from './client';
import { renderWithProviders } from './render';

/**
 * A screen as the stories will write one: one query, and the shared loading
 * and error states around it.
 */
function StatusCountsProbe(): ReactElement {
  const [{ data, fetching, error }, reexecuteQuery] = useQuery({
    query: StatusCountsDocument,
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
    return <p>No data</p>;
  }
  return <p>{String(data.statusCounts.total)} checks</p>;
}

const counts = {
  proven: 3,
  unproven: 2,
  stale: 1,
  unarmed: 1,
  broken: 1,
  total: 8,
};

it('renders the data an answer gives', async () => {
  renderWithProviders(<StatusCountsProbe />, {
    answers: [answer(StatusCountsDocument, { statusCounts: counts })],
  });

  expect(await screen.findByText('8 checks')).toBeInTheDocument();
});

it('holds the loading state while an answer is pending', () => {
  renderWithProviders(<StatusCountsProbe />, {
    answers: [pending(StatusCountsDocument)],
  });

  expect(screen.getByRole('status')).toHaveTextContent('Loading…');
});

it('shows the error notice for a request that never arrived', async () => {
  renderWithProviders(<StatusCountsProbe />, {
    answers: [networkFailure(StatusCountsDocument)],
  });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The server could not be reached.',
  );
});

it('shows the error notice with what the server said', async () => {
  renderWithProviders(<StatusCountsProbe />, {
    answers: [graphqlFailure(StatusCountsDocument, 'Nothing is counted yet.')],
  });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The server reported a problem: Nothing is counted yet.',
  );
});

it('names an operation nobody wrote an answer for', async () => {
  renderWithProviders(<StatusCountsProbe />);

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'No answer is registered for the query StatusCounts.',
  );
});

it('refuses an answer the schema does not allow', async () => {
  // Typed as complete so that the compiler lets it through; the schema is
  // what catches it.
  const incomplete = { proven: 3 } as StatusCountsQuery['statusCounts'];
  renderWithProviders(<StatusCountsProbe />, {
    answers: [answer(StatusCountsDocument, { statusCounts: incomplete })],
  });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Cannot return null for non-nullable field StatusCounts.unproven.',
  );
});

it('lets the later of two answers to one operation win', async () => {
  renderWithProviders(<StatusCountsProbe />, {
    answers: [
      answer(StatusCountsDocument, { statusCounts: counts }),
      answer(StatusCountsDocument, { statusCounts: { ...counts, total: 9 } }),
    ],
  });

  expect(await screen.findByText('9 checks')).toBeInTheDocument();
});

it('records each operation the screen sent, once per mount', async () => {
  const { calls } = renderWithProviders(<StatusCountsProbe />, {
    answers: [answer(StatusCountsDocument, { statusCounts: counts })],
  });
  await screen.findByText('8 checks');

  expect(calls).toEqual([
    { kind: 'query', name: 'StatusCounts', variables: {} },
  ]);
});

it('serves a second reader of the same query from the cache', async () => {
  let served = 0;
  const { calls } = renderWithProviders(
    <>
      <StatusCountsProbe />
      <StatusCountsProbe />
    </>,
    {
      answers: [
        answer(StatusCountsDocument, () => {
          served += 1;
          return { statusCounts: counts };
        }),
      ],
    },
  );

  expect(await screen.findAllByText('8 checks')).toHaveLength(2);
  expect(served).toBe(1);
  expect(calls).toHaveLength(1);
});

it('retries through the notice and reaches the stub again', async () => {
  let attempts = 0;
  const failsOnce: Answer = {
    operationName: 'StatusCounts',
    respond: (operation) => {
      attempts += 1;
      const stub =
        attempts === 1
          ? networkFailure(StatusCountsDocument)
          : answer(StatusCountsDocument, { statusCounts: counts });
      return stub.respond(operation);
    },
  };
  const { user } = renderWithProviders(<StatusCountsProbe />, {
    answers: [failsOnce],
  });
  await screen.findByRole('alert');

  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('8 checks')).toBeInTheDocument();
  expect(attempts).toBe(2);
});

/**
 * Stands in for a later story's operation, so that variables can be shown
 * flowing through before any operation in this package takes them. It is
 * still run against the schema, so it has to be a query the API serves.
 */
const probeDocument = gql<{ check: { id: string } | null }, { id: string }>`
  query Probe($id: ID!) {
    check(id: $id) {
      id
    }
  }
`;

function ProbeWithVariables({ id }: { readonly id: string }): ReactElement {
  const [{ data }] = useQuery({ query: probeDocument, variables: { id } });
  if (data?.check == null) {
    return <p>No data</p>;
  }
  return <p>Got {data.check.id}</p>;
}

it('hands an answer written as a function the operation variables', async () => {
  const { calls } = renderWithProviders(<ProbeWithVariables id="abc" />, {
    answers: [answer(probeDocument, ({ id }) => ({ check: { id } }))],
  });

  expect(await screen.findByText('Got abc')).toBeInTheDocument();
  expect(calls[0]).toMatchObject({ name: 'Probe', variables: { id: 'abc' } });
});

function ShowId(): ReactElement {
  const { id } = useParams();
  return <p>{id ?? 'no id'}</p>;
}

it('mounts an element at a route pattern so it can read its params', () => {
  renderWithProviders(<ShowId />, {
    route: '/checks/abc',
    path: '/checks/:id',
  });

  expect(screen.getByText('abc')).toBeInTheDocument();
});

it('exposes the router so a test can read where a click went', async () => {
  const { router, user } = renderWithProviders(
    <Link to="/elsewhere?f=status%20is%20Proven">Go</Link>,
    { route: '/' },
  );

  await user.click(screen.getByRole('link', { name: 'Go' }));

  expect(router.state.location.pathname).toBe('/elsewhere');
  expect(router.state.location.search).toBe('?f=status%20is%20Proven');
});
