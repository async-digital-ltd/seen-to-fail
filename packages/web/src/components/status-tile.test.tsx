import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    render(
      <StatusTile
        status={status}
        count={7}
        selected={false}
        onSelect={vi.fn()}
      />,
    );

    const tile = screen.getByRole('button');
    expect(tile).toHaveTextContent(`${glyph} 7 ${status} ${hint}`);
    expect(tile).toHaveAccessibleName(`7 ${status} ${hint}`);
  });

  it('says which status was pressed', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <StatusTile
        status={status}
        count={0}
        selected={false}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(status);
  });

  it('says whether it is the status the list is showing', () => {
    const { rerender } = render(
      <StatusTile status={status} count={1} selected onSelect={vi.fn()} />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <StatusTile
        status={status}
        count={1}
        selected={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * The look that says a tile can be pressed, read off the stylesheet as text,
 * the way brick-fill.test.ts reads fills: jsdom applies no :hover, so the DOM
 * cannot show it. Each state is a rule that has to be there, declaring the
 * thing that makes the state visible, so taking a rule out fails here rather
 * than leaving the tile looking like a card again with nothing to say so.
 * Watched failing with the hover and focus rule deleted, both states reading
 * undefined, and again with the pressed rule deleted; passing with each put
 * back.
 */
describe('the stylesheet', () => {
  const css = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'status-tile.css'),
    'utf8',
  );

  /** The declarations of every rule in the sheet, by each of its selectors. */
  function rulesOf(sheet: string): Map<string, Map<string, string>> {
    const rules = new Map<string, Map<string, string>>();
    const blocks = sheet
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g);
    for (const [, selectors = '', body = ''] of blocks) {
      const declarations = new Map<string, string>();
      for (const declaration of body.split(';')) {
        const [property, ...value] = declaration.split(':');
        if (property !== undefined && value.length > 0) {
          declarations.set(property.trim(), value.join(':').trim());
        }
      }
      for (const selector of selectors.split(',')) {
        rules.set(selector.trim(), declarations);
      }
    }
    return rules;
  }

  const rules = rulesOf(css);

  it('reads its own rules, by selector', () => {
    const parsed = rulesOf('.a,\n.b:hover {\n  color: var(--ink);\n}');
    expect(parsed.get('.a')?.get('color')).toBe('var(--ink)');
    expect(parsed.get('.b:hover')?.get('color')).toBe('var(--ink)');
    expect(parsed.get('.c')).toBeUndefined();
  });

  it('gives the resting tile the pointer, on the surface tint', () => {
    const resting = rules.get('.status-tile');
    expect(resting?.get('cursor')).toBe('pointer');
    expect(resting?.get('background')).toBe('var(--surface)');
    expect(resting?.get('border')).toBe('1px solid var(--border)');
  });

  it.each(['.status-tile:hover', '.status-tile:focus-visible'])(
    'turns the edge ink and lifts the ground for %s',
    (state) => {
      const rule = rules.get(state);
      expect(rule?.get('border-color')).toBe('var(--ink)');
      expect(rule?.get('background')).toBe('var(--bg)');
    },
  );

  it('gives the pressed tile a second ink line inside its edge', () => {
    const pressed = rules.get(".status-tile[aria-pressed='true']");
    expect(pressed?.get('border-color')).toBe('var(--ink)');
    expect(pressed?.get('box-shadow')).toBe('inset 0 0 0 1px var(--ink)');
  });
});
