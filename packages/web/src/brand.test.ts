import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The guard on the brand: the shell's tokens, type and buttons hold the values
 * of the studio's brand record, brand.css in the async-digital-site repository
 * (#43). The expected values are copied from that file by hand, because this
 * package cannot read another repository at test time. When the brand changes,
 * this test is where the client is told.
 *
 * Seen to fail with each departure #43 listed put back in turn: the old token
 * names, the old font stack, a 6px button and a paper label on the brick
 * button. The old hover is caught in tokens.test.ts.
 */

const styles = join(dirname(fileURLToPath(import.meta.url)), 'styles');
const tokens = readFileSync(join(styles, 'tokens.css'), 'utf8');
const base = readFileSync(join(styles, 'base.css'), 'utf8');

/** The declarations of every rule in a sheet, by each of its selectors. */
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
        declarations.set(
          property.trim(),
          value.join(':').replace(/\s+/g, ' ').trim(),
        );
      }
    }
    for (const selector of selectors.split(',')) {
      rules.set(selector.trim(), declarations);
    }
  }
  return rules;
}

const root = rulesOf(tokens).get(':root');
const rules = rulesOf(base);

/*
 * The token values are pinned in tokens.test.ts, the one test file allowed to
 * write a colour. This one pins the names, the type and the buttons.
 */
describe('the tokens file', () => {
  it.each(['--card', '--text', '--on-primary', '--primary-hover'])(
    'declares %s, the name the brand gives it',
    (name) => {
      expect(root?.has(name)).toBe(true);
    },
  );

  it.each(['--surface', '--ink'])(
    'declares no %s, a name the brand does not use',
    (name) => {
      expect(root?.has(name)).toBe(false);
    },
  );
});

describe('the base stylesheet', () => {
  it('sets the brand system stack, --font-sans', () => {
    expect(rules.get('body')?.get('font-family')?.replace(/'/g, '"')).toBe(
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    );
  });

  it('rounds a button at the brand --radius, 10px', () => {
    expect(rules.get('.button')?.get('border-radius')).toBe('10px');
  });

  it.each(['.button--primary', '.button--primary:hover'])(
    'labels %s in the brand label colour on brick',
    (selector) => {
      expect(rules.get(selector)?.get('color')).toBe('var(--on-primary)');
    },
  );
});
