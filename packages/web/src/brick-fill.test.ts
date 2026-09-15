import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { filesUnder } from './testing/files';

/**
 * The guard behind one brick action per screen: a brick fill comes from the
 * .button--primary class and from nothing else in this package.
 *
 * routes.test.tsx counts that class on a screen. A count of one class says
 * how many brick fills a screen shows only while no other rule fills with
 * brick, and this scan is what keeps that true. It reads every stylesheet for
 * a background taken from a brick token and refuses any selector but the
 * primary button's, and it reads every script for the same background in an
 * inline style, where no selector could make it right.
 *
 * Brick text and a brick border are not a fill, so an outlined button and a
 * link pass. This file is left out of the scan, because its samples have to be
 * brick fills to prove the scanner sees them.
 */

const thisPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(thisPath), '..');
const thisFile = relative(packageRoot, thisPath);

/** A background, or its colour alone, taken from either brick token. */
const brickBackground =
  /(?:^|[;{\s'"])background(?:-color|Color)?['"]?\s*:\s*[^;}\n]*var\(\s*--primary(?:-hover)?\s*\)/i;

/** The primary button, in any state such as :hover. */
const primarySelector = /^\.button--primary(?::[a-z-]+)*$/;

/** The selectors of every rule in a stylesheet that fills with brick. */
function brickFilledSelectors(css: string): string[] {
  const rules = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}]+)\{([^{}]*)\}/g);
  return [...rules]
    .filter((rule) => brickBackground.test(rule[2] ?? ''))
    .flatMap((rule) =>
      (rule[1] ?? '').split(',').map((selector) => selector.trim()),
    );
}

/** Whether a script sets a brick background in an inline style. */
function hasInlineBrickFill(script: string): boolean {
  return brickBackground.test(script);
}

describe('the scanner', () => {
  it('finds a brick background on a rule, by each selector', () => {
    expect(brickFilledSelectors('.a { background: var(--primary); }')).toEqual([
      '.a',
    ]);
    expect(
      brickFilledSelectors(
        '.a,\n.b:hover {\n  background-color: var(--primary-hover);\n}',
      ),
    ).toEqual(['.a', '.b:hover']);
  });

  it('passes brick text and a brick border, which outline rather than fill', () => {
    expect(
      brickFilledSelectors(
        '.a { border: 1px solid var(--primary); color: var(--primary); background: var(--bg); }',
      ),
    ).toEqual([]);
  });

  it('ignores a rule inside a comment', () => {
    expect(
      brickFilledSelectors('/* .a { background: var(--primary); } */'),
    ).toEqual([]);
  });

  it('finds a brick background in an inline style', () => {
    expect(hasInlineBrickFill("style={{ background: 'var(--primary)' }}")).toBe(
      true,
    );
    expect(
      hasInlineBrickFill("style={{ backgroundColor: 'var(--primary-hover)' }}"),
    ).toBe(true);
    expect(hasInlineBrickFill("style={{ color: 'var(--primary)' }}")).toBe(
      false,
    );
  });

  it('knows the primary button in any state from anything else', () => {
    expect(primarySelector.test('.button--primary')).toBe(true);
    expect(primarySelector.test('.button--primary:hover')).toBe(true);
    expect(primarySelector.test('.button--outlined')).toBe(false);
    expect(primarySelector.test('.callout .button--primary')).toBe(false);
  });
});

const read = (file: string): string =>
  readFileSync(join(packageRoot, file), 'utf8');

const sourceFiles = filesUnder(join(packageRoot, 'src'))
  .map((path) => relative(packageRoot, path))
  .filter((path) => path !== thisFile)
  .sort();
const stylesheets = sourceFiles.filter((path) => path.endsWith('.css'));
const scripts = sourceFiles.filter((path) => /\.[jt]sx?$/.test(path));

describe('the package', () => {
  it('fills the primary button with brick, where the scan can see it', () => {
    expect(
      brickFilledSelectors(read(join('src', 'styles', 'base.css'))),
    ).toContain('.button--primary');
  });

  it.each(stylesheets)(
    '%s fills with brick only through the primary button',
    (file) => {
      const others = brickFilledSelectors(read(file)).filter(
        (selector) => !primarySelector.test(selector),
      );
      expect(others).toEqual([]);
    },
  );

  it.each(scripts)('%s puts no brick fill in an inline style', (file) => {
    expect(hasInlineBrickFill(read(file))).toBe(false);
  });
});
