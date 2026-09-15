import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CombinedError } from 'urql';
import { expect, it, vi } from 'vitest';

import { describeError, ErrorNotice } from './error-notice';

it('says the server could not be reached when the request never got there', () => {
  const error = new CombinedError({
    networkError: new Error('Failed to fetch'),
  });

  expect(describeError(error)).toBe('The server could not be reached.');
});

it('passes on what the server said when it answered with errors', () => {
  const error = new CombinedError({
    graphQLErrors: ['No check has that id.', 'The date is in the future.'],
  });

  expect(describeError(error)).toBe(
    'The server reported a problem: No check has that id. The date is in the future.',
  );
});

it('keeps a developer message off the screen', () => {
  expect(describeError(new TypeError('x is not a function'))).toBe(
    'Something went wrong.',
  );
  expect(describeError(undefined)).toBe('Something went wrong.');
});

it('renders as an alert that says what to do next', () => {
  render(<ErrorNotice error={new Error('boom')} />);

  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent('Something went wrong.');
  expect(alert).toHaveTextContent('Reload the page to try again.');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('offers to try again when the screen can', async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(<ErrorNotice error={new Error('boom')} onRetry={onRetry} />);

  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('alert')).not.toHaveTextContent('Reload the page');
});
