import { STATUSES } from '@seen-to-fail/filter';
import type { Status } from '@seen-to-fail/filter';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StatusBadge, StatusGlyph } from './status-badge';

/**
 * Each status and the mark the design gives it, written out here rather than
 * read from the component, so a glyph changed there is a failure here.
 */
const marks: readonly { readonly status: Status; readonly glyph: string }[] = [
  { status: 'Proven', glyph: '✓' },
  { status: 'Broken', glyph: '✕' },
  { status: 'Stale', glyph: '!' },
  { status: 'Unproven', glyph: '?' },
  { status: 'Unarmed', glyph: '○' },
];

it('covers every status the filter language has, each once', () => {
  expect(marks.map(({ status }) => status).sort()).toEqual(
    [...STATUSES].sort(),
  );
});

describe.each(marks)('for $status', ({ status, glyph }) => {
  it('renders the glyph and the label', () => {
    const { container } = render(<StatusBadge status={status} />);

    expect(container).toHaveTextContent(`${glyph}${status}`);
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.getByText(glyph)).toBeInTheDocument();
  });

  it('keeps the glyph from being read aloud as well as the label', () => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(glyph)).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the same glyph on its own', () => {
    const { container } = render(<StatusGlyph status={status} />);

    expect(container).toHaveTextContent(glyph);
    expect(container).not.toHaveTextContent(status);
  });
});
