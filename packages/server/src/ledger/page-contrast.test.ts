import { describe, expect, it } from 'vitest';

import { fixtureSnapshot } from '../testing/ledger.ts';
import { renderPage } from './page.ts';

/**
 * The guard on the published page's contrast: every pairing of colours the
 * page relies on to be read, measured in both of its colour schemes from the
 * stylesheet the rendered page carries.
 *
 * The page's palette is a copy of the client's and is allowed to drift from
 * it, so the client's contrast test says nothing about it. A Stale pill here
 * went out as amber text at 2.9:1 on the light ground (#90) because nothing
 * measured this palette, and the dark scheme added in #133 doubled the number
 * of pairings nothing read.
 *
 * The same floors as the client: text needs 4.5:1 (WCAG 2.2, 1.4.3), and a
 * graphic a reader needs to see needs 3:1 (1.4.11). Large text is held to the
 * text floor rather than the 3:1 WCAG allows it, because every large heading
 * here also sets smaller text in the same colour.
 *
 * Edges are not measured. A status on this page is never told by colour
 * alone: a pill says its word and its mark, and a square in the hero strip
 * carries the mark, so the amber edge of a Stale pill and the dashed edge of an
 * Unproven one sit beside what a reader reads rather than being it. The marks
 * and words are what is measured.
 *
 * The maths repeats the client's contrast.test.ts rather than sharing it. The
 * only package both sides import is the filter language, which is closed to
 * anything else, and the formula is fixed by WCAG, so the two copies cannot
 * drift on anything a reader would see. Both files prove their measure on
 * black and white before trusting it.
 */

/** The stylesheet exactly as the page publishes it. */
const style = (() => {
  const found = /<style>([\s\S]*?)<\/style>/.exec(
    renderPage(fixtureSnapshot()),
  );
  if (found?.[1] === undefined) {
    throw new Error('The rendered page carries no stylesheet.');
  }
  return found[1];
})();

/** Every `--name: #rrggbb;` declaration in a block of CSS. */
function declarations(block: string): Map<string, string> {
  const tokens = new Map<string, string>();
  for (const [, name, hex] of block.matchAll(
    /--([a-z-]+):\s*(#[0-9a-f]{6});/gi,
  )) {
    if (name !== undefined && hex !== undefined) {
      tokens.set(name, hex);
    }
  }
  return tokens;
}

/** The text between a block's opening brace and its matching closing one. */
function blockAfter(marker: string): string {
  const start = style.indexOf(marker);
  if (start === -1) {
    throw new Error(`The page's stylesheet has no ${marker} block.`);
  }
  const open = style.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < style.length; index += 1) {
    if (style[index] === '{') depth += 1;
    if (style[index] === '}') depth -= 1;
    if (depth === 0) return style.slice(open + 1, index);
  }
  throw new Error(`The ${marker} block is never closed.`);
}

const light = declarations(blockAfter(':root'));

/**
 * The dark scheme is the light one with its own declarations on top, which is
 * what the cascade does: a token the dark block leaves alone keeps its light
 * value, so it is measured against the dark ground with that value.
 */
const dark = new Map([
  ...light,
  ...declarations(blockAfter('@media (prefers-color-scheme: dark)')),
]);

const schemes = { light, dark } as const;
type Scheme = keyof typeof schemes;

/** A token's hex value in a scheme, read from the page. */
function token(scheme: Scheme, name: string): string {
  const hex = schemes[scheme].get(name);
  if (hex === undefined) {
    throw new Error(`The page does not declare --${name}.`);
  }
  return hex;
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
const graphic = 3;

describe('the measure', () => {
  it('reads black on white as 21:1', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('reads a colour against itself as 1:1', () => {
    expect(ratio(token('light', 'ink'), token('light', 'ink'))).toBeCloseTo(
      1,
      5,
    );
  });

  // The pairing #90 was filed for. If amber ever reads as text on the light
  // ground, either the palette changed or the measure is broken.
  it('fails amber as text on the light ground', () => {
    expect(ratio(token('light', 'warning'), token('light', 'bg'))).toBeLessThan(
      text,
    );
  });

  it('reads a dark value in the dark scheme, and keeps a light one it does not redeclare', () => {
    expect(token('dark', 'bg')).not.toBe(token('light', 'bg'));
    expect(token('dark', 'warning')).toBe(token('light', 'warning'));
  });
});

/** Every pairing the page renders, with where it is rendered. */
const pairings: readonly {
  readonly use: string;
  readonly fore: string;
  readonly back: string;
  readonly floor: number;
}[] = [
  {
    use: 'ink on the page: body text, a Stale pill, a Stale square',
    fore: 'ink',
    back: 'bg',
    floor: text,
  },
  {
    use: 'ink on an area card: area titles, pills in a check line',
    fore: 'ink',
    back: 'surface',
    floor: text,
  },
  {
    use: 'muted text on the page: hints, facts, footer, Unarmed and Unproven squares',
    fore: 'muted',
    back: 'bg',
    floor: text,
  },
  {
    use: 'muted text on an area card: counts, chevrons, small squares',
    fore: 'muted',
    back: 'surface',
    floor: text,
  },
  { use: 'links on the page', fore: 'primary', back: 'bg', floor: text },
  {
    use: 'links on a card, in how this page works',
    fore: 'primary',
    back: 'surface',
    floor: text,
  },
  {
    use: 'the button that leads to the repository',
    fore: 'on-primary',
    back: 'primary',
    floor: text,
  },
  {
    use: 'green words on the page: the headline count, a Proven pill, Caught',
    fore: 'success-ink',
    back: 'bg',
    floor: text,
  },
  {
    use: 'a Proven pill in a check line on an area card',
    fore: 'success-ink',
    back: 'surface',
    floor: text,
  },
  {
    use: 'red words on the page: a Broken pill and square, Missed',
    fore: 'error',
    back: 'bg',
    floor: text,
  },
  {
    use: 'a Broken pill and square on an area card',
    fore: 'error',
    back: 'surface',
    floor: text,
  },
  {
    use: 'the mark on a Proven square',
    fore: 'on-success',
    back: 'success',
    floor: text,
  },
  {
    use: 'what a status means, in its popover',
    fore: 'bg',
    back: 'ink',
    floor: text,
  },
  {
    use: 'the studio mark in the footer',
    fore: 'studio',
    back: 'bg',
    floor: graphic,
  },
];

describe.each(Object.keys(schemes) as Scheme[])('the %s scheme', (scheme) => {
  describe.each(pairings)('$use', ({ fore, back, floor }) => {
    it(`reaches ${String(floor)}:1`, () => {
      expect(
        ratio(token(scheme, fore), token(scheme, back)),
      ).toBeGreaterThanOrEqual(floor);
    });
  });
});

/**
 * A new colour for text, or a new ground, has to be added to the pairings
 * above before this passes, so a pairing cannot reach the page unmeasured.
 */
describe('the pairings', () => {
  const used = (property: string): Set<string> =>
    new Set(
      [
        ...style.matchAll(
          new RegExp(`(?:^|[\\s;{])${property}:\\s*var\\(--([a-z-]+)\\)`, 'g'),
        ),
      ].map(([, name]) => name ?? ''),
    );

  it('measure every token the page sets text in', () => {
    const measured = new Set(pairings.map(({ fore }) => fore));
    expect([...used('color')].filter((name) => !measured.has(name))).toEqual(
      [],
    );
  });

  it('measure every token the page sets as a ground', () => {
    const measured = new Set(pairings.map(({ back }) => back));
    expect(
      [...used('background')].filter((name) => !measured.has(name)),
    ).toEqual([]);
  });
});
