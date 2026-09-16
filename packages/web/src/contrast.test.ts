import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The guard on contrast: every pairing of tokens a screen relies on to be read
 * or told apart, measured from styles/tokens.css as it stands.
 *
 * #50 found a check's page separating its regions with the surface tint and
 * the border token, which measure 1.05:1 and 1.23:1 against the page. Nothing
 * failed when those were chosen, because nothing measured them. This does, so
 * a later edit to a token cannot quietly take a pairing back under its floor.
 *
 * Text needs 4.5:1 (WCAG 2.2, 1.4.3). A boundary a reader needs in order to
 * tell one region or control from another needs 3:1 (1.4.11).
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(
  join(packageRoot, 'src', 'styles', 'tokens.css'),
  'utf8',
);

type Token =
  | 'bg'
  | 'surface'
  | 'border'
  | 'ink'
  | 'muted'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error';

/** A token's hex value, read from the tokens file. */
function token(name: Token): string {
  const found = new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, 'i').exec(css);
  if (found?.[1] === undefined) {
    throw new Error(`tokens.css does not declare --${name}.`);
  }
  return found[1];
}

/** Relative luminance, WCAG 2. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** The contrast ratio of two colours, the lighter over the darker. */
function ratio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const text = 4.5;
const boundary = 3;

/**
 * Black and white, built rather than written, because tokens.test.ts refuses
 * a colour literal anywhere outside the tokens file.
 */
const black = `#${'0'.repeat(6)}`;
const white = `#${'f'.repeat(6)}`;

describe('the measure', () => {
  it('reads black on white as 21:1', () => {
    expect(ratio(black, white)).toBeCloseTo(21, 5);
  });

  it('reads a colour against itself as 1:1', () => {
    expect(ratio(token('primary'), token('primary'))).toBeCloseTo(1, 5);
  });

  // The pairings #50 found. They are measured here to prove this file can
  // fail: if either ever reads as a boundary, the measure is broken.
  it('fails the surface tint and the border as boundaries on the page', () => {
    expect(ratio(token('surface'), token('bg'))).toBeLessThan(boundary);
    expect(ratio(token('border'), token('bg'))).toBeLessThan(boundary);
  });
});

/** Every pairing a screen relies on, with what it is used for. */
const pairings: readonly {
  readonly use: string;
  readonly fore: Token;
  readonly back: Token;
  readonly floor: number;
}[] = [
  { use: 'body text on the page', fore: 'ink', back: 'bg', floor: text },
  { use: 'muted text on the page', fore: 'muted', back: 'bg', floor: text },
  {
    use: 'muted text on the surface tint',
    fore: 'muted',
    back: 'surface',
    floor: text,
  },
  {
    use: 'brick links and outlines on the page',
    fore: 'primary',
    back: 'bg',
    floor: text,
  },
  {
    use: 'light text on a brick fill',
    fore: 'bg',
    back: 'primary',
    floor: text,
  },
  {
    use: 'the dark surface against the page',
    fore: 'ink',
    back: 'bg',
    floor: boundary,
  },
  {
    use: 'light text on the dark surface',
    fore: 'bg',
    back: 'ink',
    floor: text,
  },
  {
    use: 'pale labels on the dark surface',
    fore: 'border',
    back: 'ink',
    floor: text,
  },
  {
    use: 'a green status pill against the dark surface',
    fore: 'success',
    back: 'ink',
    floor: boundary,
  },
  {
    use: 'light text on a green fill',
    fore: 'bg',
    back: 'success',
    floor: text,
  },
  {
    use: 'a red status pill against the dark surface',
    fore: 'error',
    back: 'ink',
    floor: boundary,
  },
  { use: 'light text on a red fill', fore: 'bg', back: 'error', floor: text },
  {
    use: 'an amber status pill against the dark surface',
    fore: 'warning',
    back: 'ink',
    floor: boundary,
  },
  {
    use: 'dark text on an amber fill',
    fore: 'ink',
    back: 'warning',
    floor: text,
  },
  {
    use: 'dark text on a pale status pill',
    fore: 'ink',
    back: 'border',
    floor: text,
  },
  {
    use: 'the ink rule over each kind of evidence',
    fore: 'ink',
    back: 'bg',
    floor: boundary,
  },
  {
    use: 'the ink edge of a form on the surface tint',
    fore: 'ink',
    back: 'surface',
    floor: boundary,
  },
  { use: 'green words on the page', fore: 'success', back: 'bg', floor: text },
  { use: 'red words on the page', fore: 'error', back: 'bg', floor: text },
];

describe.each(pairings)('$use', ({ fore, back, floor }) => {
  it(`reaches ${String(floor)}:1`, () => {
    expect(ratio(token(fore), token(back))).toBeGreaterThanOrEqual(floor);
  });
});
