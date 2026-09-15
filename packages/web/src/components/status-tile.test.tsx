import { STATUSES } from '@seen-to-fail/filter';
import type { Status } from '@seen-to-fail/filter';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StatusTile } from './status-tile';

/** Each status with the glyph and hint the design gives its tile. */
const tiles: readonly {
  readonly status: Status;
  readonly glyph: string;
  readonly hint: string;
}[] = [
  { status: 'Proven', glyph: '✓', hint: 'Caught a planted defect' },
  { status: 'Broken', glyph: '✕', hint: 'Latest run missed' },
  { status: 'Stale', glyph: '!', hint: 'Last proof is old' },
  { status: 'Unproven', glyph: '?', hint: 'Never seen to fail' },
  { status: 'Unarmed', glyph: '○', hint: 'No evidence it is on' },
];

it('covers every status the filter language has, each once', () => {
  expect(tiles.map(({ status }) => status).sort()).toEqual(
    [...STATUSES].sort(),
  );
});

describe.each(tiles)('the $status tile', ({ status, glyph, hint }) => {
  it('renders its glyph, count, label and hint', () => {
    render(<StatusTile status={status} count={7} onSelect={vi.fn()} />);

    const tile = screen.getByRole('button');
    expect(tile).toHaveTextContent(`${glyph} 7 ${status} ${hint}`);
    expect(tile).toHaveAccessibleName(`7 ${status} ${hint}`);
  });

  it('says which status was pressed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<StatusTile status={status} count={0} onSelect={onSelect} />);

    await user.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(status);
  });
});
