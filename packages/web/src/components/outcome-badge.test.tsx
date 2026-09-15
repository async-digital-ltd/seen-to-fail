import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OutcomeBadge } from './outcome-badge';

/** Each outcome and its mark, written out here rather than read back. */
const marks = [
  { outcome: 'CAUGHT', label: 'Caught', glyph: '✓' },
  { outcome: 'MISSED', label: 'Missed', glyph: '✕' },
] as const;

describe.each(marks)('for $outcome', ({ outcome, label, glyph }) => {
  it('renders the glyph and the word', () => {
    const { container } = render(<OutcomeBadge outcome={outcome} />);

    expect(container).toHaveTextContent(`${glyph}${label}`);
  });

  it('keeps the glyph from being read aloud as well as the word', () => {
    render(<OutcomeBadge outcome={outcome} />);

    expect(screen.getByText(glyph)).toHaveAttribute('aria-hidden', 'true');
  });
});
