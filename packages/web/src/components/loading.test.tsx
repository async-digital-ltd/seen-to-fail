import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Loading } from './loading';

it('announces that something is loading', () => {
  render(<Loading />);

  expect(screen.getByRole('status')).toHaveTextContent('Loading…');
});

it('says what is loading when the screen names it', () => {
  render(<Loading label="Loading checks…" />);

  expect(screen.getByRole('status')).toHaveTextContent('Loading checks…');
});
