import axe from 'axe-core';

/**
 * Runs axe over what is rendered and names each rule it finds broken, with
 * the elements that break it, so a failing test says what to fix (#28).
 *
 * Every rule axe ships runs, best practices included, with one switched off:
 * colour contrast needs a layout engine and jsdom has none, so axe can only
 * ever report it as unsure. Contrast is held instead by contrast.test.ts,
 * which measures every pairing of the palette the stylesheets use.
 *
 * The whole document is read, not only the rendered tree, so a page without a
 * title or with content outside a landmark is caught. The language of the
 * page is set by index.html, which a test never loads, so the one rule about
 * it is left to the build.
 */
export async function axeViolations(): Promise<string[]> {
  const results = await axe.run(document, {
    rules: {
      'color-contrast': { enabled: false },
      'html-has-lang': { enabled: false },
    },
  });
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')}`,
  );
}
