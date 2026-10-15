import { expect, it } from 'vitest';

import { pageAddress, renderRobots, renderSitemap } from './discovery.ts';

/**
 * The files a crawler reads before the page (#254). The live address is
 * written out here rather than imported, so a change to it in the renderer has
 * to be made a second time on purpose.
 */
const livePage = 'https://seen-to-fail.async-digital.com/';

it('lets every crawler in and names the sitemap by its absolute address', () => {
  expect(renderRobots()).toBe(
    `User-agent: *\nAllow: /\nSitemap: ${livePage}sitemap.xml\n`,
  );
});

it('gives the index its root address and any other page its filename under the root', () => {
  expect(pageAddress('index.html')).toBe(livePage);
  expect(pageAddress('about.html')).toBe(`${livePage}about.html`);
});

it('lists every page it is given, each with the day it was built', () => {
  const sitemap = renderSitemap(['index.html', 'about.html'], '2026-10-15');

  expect(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(
    true,
  );
  expect(
    [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]),
  ).toEqual([livePage, `${livePage}about.html`]);
  expect(sitemap.match(/<lastmod>2026-10-15<\/lastmod>/g)).toHaveLength(2);
});
