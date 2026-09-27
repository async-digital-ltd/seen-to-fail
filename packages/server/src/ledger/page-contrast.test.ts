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
 * Two states are drawn with `color-mix()` rather than a token: the keyboard
 * focus ring and the tint behind a pill under the pointer. Each is read off
 * the stylesheet with its percentage, laid over the page and over an area
 * card, and measured there: the ring as a graphic against its ground, and
 * every pill's text against the tint.
 *
 * Edges are not measured. A status on this page is never told by colour
 * alone: a pill says its word and its mark, and a square in the hero strip
 * carries the mark, so the amber edge of a Stale pill and the dashed edge of an
 * Unproven one sit beside what a reader reads rather than being it. The marks
 * and words are what is measured. The checks at the foot of this file cover
 * every `color:` and `background:` set from a token and every `color-mix()`,
 * and nothing set with `border`.
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

/** A token mixed with transparent, as the stylesheet declares it. */
interface Mix {
  readonly property: string;
  readonly token: string;
  readonly percent: number;
}

/** Every `color-mix(in srgb, var(--x) N%, transparent)`, with its property. */
const mixes: readonly Mix[] = [
  ...style.matchAll(
    /(?:^|[\s;{])([a-z-]+):[^;{}]*color-mix\(in srgb, var\(--([a-z-]+)\) (\d+(?:\.\d+)?)%, transparent\)/g,
  ),
].map(([, property = '', name = '', percent = '']) => ({
  property,
  token: name,
  percent: Number(percent),
}));

/** The one mix the stylesheet sets on a property. */
function mixOn(property: string): Mix {
  const found = mixes.filter((mix) => mix.property === property);
  if (found.length !== 1 || found[0] === undefined) {
    throw new Error(
      `Expected one color-mix on ${property}, found ${String(found.length)}.`,
    );
  }
  return found[0];
}

/**
 * A mix laid over an opaque ground, which is what a reader sees: each channel
 * is the mix's share of the token plus the rest of the ground.
 */
function composite(
  foreground: string,
  percent: number,
  ground: string,
): string {
  const share = percent / 100;
  return `#${[1, 3, 5]
    .map((start) => {
      const fore = Number.parseInt(foreground.slice(start, start + 2), 16);
      const back = Number.parseInt(ground.slice(start, start + 2), 16);
      return Math.round(share * fore + (1 - share) * back)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/** A token, or a mix of one laid over a token. */
type Paint = string | { readonly mix: Mix; readonly over: string };

function paint(scheme: Scheme, value: Paint): string {
  if (typeof value === 'string') {
    return token(scheme, value);
  }
  return composite(
    token(scheme, value.mix.token),
    value.mix.percent,
    token(scheme, value.over),
  );
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

  it('lays a mix over its ground: none of it is the ground, all of it is the colour', () => {
    expect(composite('#000000', 0, '#ffffff')).toBe('#ffffff');
    expect(composite('#000000', 100, '#ffffff')).toBe('#000000');
    expect(composite('#000000', 50, '#ffffff')).toBe('#808080');
  });
});

interface Pairing {
  readonly use: string;
  readonly fore: Paint;
  readonly back: Paint;
  readonly floor: number;
}

/** Every pairing the page renders from its tokens, with where it is rendered. */
const tokenPairings: readonly Pairing[] = [
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

/**
 * The colours a pill's text can take: ink, which a pill inherits, and every
 * token a `.pill` rule sets its text in.
 */
const pillInks = [
  ...new Set([
    'ink',
    ...[
      ...style.matchAll(
        /^\.pill[^{\n]*\{[^}]*[\s;{]color:\s*var\(--([a-z-]+)\)/gm,
      ),
    ].map(([, name = '']) => name),
  ]),
];

/** Pills sit on the page in the hero and on an area card in a check line. */
const grounds = [
  { name: 'the page', token: 'bg' },
  { name: 'an area card', token: 'surface' },
] as const;

const focusRing = mixOn('outline');
const hoverTint = mixOn('background');

/** The two mixed states, laid over each ground they are drawn on. */
const mixPairings: readonly Pairing[] = grounds.flatMap((ground) => [
  {
    use: `the focus ring on ${ground.name}`,
    fore: { mix: focusRing, over: ground.token },
    back: ground.token,
    floor: graphic,
  },
  ...pillInks.map((ink) => ({
    use: `--${ink} pill text on the hover tint, on ${ground.name}`,
    fore: ink,
    back: { mix: hoverTint, over: ground.token },
    floor: text,
  })),
]);

const pairings = [...tokenPairings, ...mixPairings];

describe.each(Object.keys(schemes) as Scheme[])('the %s scheme', (scheme) => {
  describe.each(pairings)('$use', ({ fore, back, floor }) => {
    it(`reaches ${String(floor)}:1`, () => {
      expect(
        ratio(paint(scheme, fore), paint(scheme, back)),
      ).toBeGreaterThanOrEqual(floor);
    });
  });
});

/**
 * A new colour for text, a new ground, or a new mix has to be measured above
 * before this passes, so a pairing cannot reach the page unmeasured.
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

  const tokensIn = (side: 'fore' | 'back'): Set<string> =>
    new Set(
      pairings.flatMap((pairing) =>
        typeof pairing[side] === 'string' ? [pairing[side]] : [],
      ),
    );

  it('measure every token the page sets text in', () => {
    const measured = tokensIn('fore');
    expect([...used('color')].filter((name) => !measured.has(name))).toEqual(
      [],
    );
  });

  it('measure every token the page sets as a ground', () => {
    const measured = tokensIn('back');
    expect(
      [...used('background')].filter((name) => !measured.has(name)),
    ).toEqual([]);
  });

  it('read every color-mix on the page, and measure each one', () => {
    expect(mixes).toHaveLength(style.split('color-mix(').length - 1);
    expect(
      mixes.filter((mix) => mix !== focusRing && mix !== hoverTint),
    ).toEqual([]);
  });

  it('find more than one colour of pill text', () => {
    expect(pillInks.length).toBeGreaterThan(1);
  });
});
