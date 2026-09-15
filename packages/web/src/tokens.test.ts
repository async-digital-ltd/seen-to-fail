import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { filesUnder } from './testing/files';

/**
 * The guard on the palette: every colour lives in styles/tokens.css, and no
 * other file in this package carries one of its own.
 *
 * It is a scan rather than a lint rule because a rule would read the CSS and
 * miss an inline style in a component; this reads both, and index.html, as
 * text. What counts as a colour: a hex literal, any of the colour functions,
 * and a named colour where it is the value of a colour-carrying property.
 * `transparent`, `currentColor` and `inherit` are not colours of their own
 * and pass. So does a `var()`.
 *
 * Two files are left out of the scan: the tokens file, which is where colours
 * belong, and this one, whose samples have to be colours to prove the scanner
 * sees them.
 */

const thisPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(thisPath), '..');
const tokensFile = join('src', 'styles', 'tokens.css');
const thisFile = relative(packageRoot, thisPath);

/** Every token the design names. */
const tokenNames = [
  'bg',
  'surface',
  'border',
  'ink',
  'muted',
  'primary',
  'primary-hover',
  'success',
  'warning',
  'error',
];

describe('the tokens file', () => {
  const css = readFileSync(join(packageRoot, tokensFile), 'utf8');

  it.each(tokenNames)('declares --%s as a six-digit hex colour', (name) => {
    expect(css).toMatch(new RegExp(`^\\s*--${name}:\\s*#[0-9a-f]{6};`, 'im'));
  });

  it('declares nothing but custom properties on :root', () => {
    const declarations = css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && line !== ':root {' && line !== '}');
    expect(declarations.length).toBe(tokenNames.length);
    for (const declaration of declarations) {
      expect(declaration).toMatch(/^--[a-z-]+: #[0-9a-f]{6};$/);
    }
  });
});

const hexAnywhere = /#[0-9a-f]{3,8}\b/gi;
// In a script a hash also starts an element id or a ticket number, so a hex
// literal counts only where a style would put one: after a quote or a colon.
const hexInScript = /(?<=["'`]|:\s*)#[0-9a-f]{3,8}\b/gi;
const colourFunction =
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/gi;
const colourProperty =
  /(?:^|[;{\s'"])(?:color|background(?:-color)?|border(?:-[a-z]+)*|outline(?:-[a-z]+)?|fill|stroke|box-shadow|text-shadow|text-decoration(?:-color)?|caret-color|accent-color|column-rule(?:-color)?)['"]?\s*:\s*([^;}\n]*)/gi;
const namedColours = [
  'aliceblue',
  'antiquewhite',
  'aqua',
  'aquamarine',
  'azure',
  'beige',
  'bisque',
  'black',
  'blanchedalmond',
  'blue',
  'blueviolet',
  'brown',
  'burlywood',
  'cadetblue',
  'chartreuse',
  'chocolate',
  'coral',
  'cornflowerblue',
  'cornsilk',
  'crimson',
  'cyan',
  'darkblue',
  'darkcyan',
  'darkgoldenrod',
  'darkgray',
  'darkgreen',
  'darkgrey',
  'darkkhaki',
  'darkmagenta',
  'darkolivegreen',
  'darkorange',
  'darkorchid',
  'darkred',
  'darksalmon',
  'darkseagreen',
  'darkslateblue',
  'darkslategray',
  'darkslategrey',
  'darkturquoise',
  'darkviolet',
  'deeppink',
  'deepskyblue',
  'dimgray',
  'dimgrey',
  'dodgerblue',
  'firebrick',
  'floralwhite',
  'forestgreen',
  'fuchsia',
  'gainsboro',
  'ghostwhite',
  'gold',
  'goldenrod',
  'gray',
  'green',
  'greenyellow',
  'grey',
  'honeydew',
  'hotpink',
  'indianred',
  'indigo',
  'ivory',
  'khaki',
  'lavender',
  'lavenderblush',
  'lawngreen',
  'lemonchiffon',
  'lightblue',
  'lightcoral',
  'lightcyan',
  'lightgoldenrodyellow',
  'lightgray',
  'lightgreen',
  'lightgrey',
  'lightpink',
  'lightsalmon',
  'lightseagreen',
  'lightskyblue',
  'lightslategray',
  'lightslategrey',
  'lightsteelblue',
  'lightyellow',
  'lime',
  'limegreen',
  'linen',
  'magenta',
  'maroon',
  'mediumaquamarine',
  'mediumblue',
  'mediumorchid',
  'mediumpurple',
  'mediumseagreen',
  'mediumslateblue',
  'mediumspringgreen',
  'mediumturquoise',
  'mediumvioletred',
  'midnightblue',
  'mintcream',
  'mistyrose',
  'moccasin',
  'navajowhite',
  'navy',
  'oldlace',
  'olive',
  'olivedrab',
  'orange',
  'orangered',
  'orchid',
  'palegoldenrod',
  'palegreen',
  'paleturquoise',
  'palevioletred',
  'papayawhip',
  'peachpuff',
  'peru',
  'pink',
  'plum',
  'powderblue',
  'purple',
  'rebeccapurple',
  'red',
  'rosybrown',
  'royalblue',
  'saddlebrown',
  'salmon',
  'sandybrown',
  'seagreen',
  'seashell',
  'sienna',
  'silver',
  'skyblue',
  'slateblue',
  'slategray',
  'slategrey',
  'snow',
  'springgreen',
  'steelblue',
  'tan',
  'teal',
  'thistle',
  'tomato',
  'turquoise',
  'violet',
  'wheat',
  'white',
  'whitesmoke',
  'yellow',
  'yellowgreen',
];
const namedColour = new RegExp(`\\b(?:${namedColours.join('|')})\\b`, 'i');

const scriptExtensions = ['.ts', '.tsx', '.js', '.jsx'];
const scannedExtensions = [...scriptExtensions, '.css', '.html', '.svg'];

/** The colour literals in one file's text, each as it was written. */
export function colourLiterals(text: string, fileName: string): string[] {
  const isScript = scriptExtensions.some((ext) => fileName.endsWith(ext));
  const found = [
    ...text.matchAll(isScript ? hexInScript : hexAnywhere),
    ...text.matchAll(colourFunction),
  ].map((match) => match[0]);

  for (const match of text.matchAll(colourProperty)) {
    const value = match[1] ?? '';
    const named = namedColour.exec(value);
    if (named !== null) {
      found.push(named[0]);
    }
  }
  return found;
}

describe('the scanner', () => {
  it('finds a hex colour in a stylesheet', () => {
    expect(colourLiterals('a { color: #c0ffee; }', 'a.css')).toEqual([
      '#c0ffee',
    ]);
  });

  it('finds a colour function anywhere', () => {
    expect(colourLiterals('a { color: rgb(1 2 3); }', 'a.css')).toEqual([
      'rgb(',
    ]);
    expect(colourLiterals('x = `color: hsl(1 2 3)`', 'a.ts')).toEqual(['hsl(']);
  });

  it('finds a named colour as the value of a colour property', () => {
    expect(colourLiterals('a { background: white; }', 'a.css')).toEqual([
      'white',
    ]);
    expect(colourLiterals('a { border: 1px solid red; }', 'a.css')).toEqual([
      'red',
    ]);
  });

  it('finds a colour in an inline style', () => {
    expect(colourLiterals("style={{ color: '#fff' }}", 'a.tsx')).toEqual([
      '#fff',
    ]);
    expect(colourLiterals("style={{ color: 'red' }}", 'a.tsx')).toEqual([
      'red',
    ]);
  });

  it('finds a colour in markup', () => {
    expect(colourLiterals('<meta content="#c0ffee">', 'index.html')).toEqual([
      '#c0ffee',
    ]);
  });

  it('passes a token, the keywords that are not colours, and a class name', () => {
    expect(
      colourLiterals(
        'a { color: var(--primary); background: transparent; border-color: currentColor; outline: inherit; }',
        'a.css',
      ),
    ).toEqual([]);
    expect(colourLiterals('.tile--red { padding: 0; }', 'a.css')).toEqual([]);
  });

  it('passes a ticket number and an element id in a script', () => {
    expect(
      colourLiterals("// see #123 and #abc\ngetElementById('root')", 'a.ts'),
    ).toEqual([]);
  });
});

/** Every file in this package that could carry a colour, but the two above. */
const scannedFiles = [
  join(packageRoot, 'index.html'),
  ...filesUnder(join(packageRoot, 'src')),
]
  .map((path) => relative(packageRoot, path))
  .filter((path) => scannedExtensions.some((ext) => path.endsWith(ext)))
  .filter((path) => path !== tokensFile && path !== thisFile)
  .sort();

describe('the package', () => {
  it('has files to scan', () => {
    expect(scannedFiles.length).toBeGreaterThan(10);
  });

  it.each(scannedFiles)('%s takes every colour from the tokens', (file) => {
    const text = readFileSync(join(packageRoot, file), 'utf8');
    expect(colourLiterals(text, file)).toEqual([]);
  });
});
