import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { Placeholder } from './placeholder';

it('carries the finished screen heading and says the screen is still to come', () => {
  render(<Placeholder title="Checks" />);

  expect(
    screen.getByRole('heading', { level: 1, name: 'Checks' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("This screen hasn't been built yet."),
  ).toBeInTheDocument();
});
