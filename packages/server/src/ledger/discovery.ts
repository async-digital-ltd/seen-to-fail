import type { IsoDate } from '../database/rows.ts';
import { escapeHtml, publishedUrl } from './page.ts';

/**
 * The two files a crawler reads before the page (#254): `robots.txt`, which
 * lets it in and says where the sitemap is, and `sitemap.xml`, which lists the
 * pages.
 *
 * Both are written by the build beside the page, so they ship with every
 * publish and say what that publish holds. The sitemap is drawn from the pages
 * the build writes, never typed, so a page added to the build is listed by the
 * same change; the published-output check refuses a served page the sitemap
 * leaves out, and an entry with no page behind it.
 */

export const robotsFilename = 'robots.txt';
export const sitemapFilename = 'sitemap.xml';

/**
 * Where a page is served. The site's index is its root address, the way the
 * page names itself in its canonical link, and any other page is its filename
 * under the root.
 */
export function pageAddress(filename: string): string {
  return filename === 'index.html'
    ? publishedUrl
    : new URL(filename, publishedUrl).href;
}

/** Every crawler let in, and pointed at the sitemap by its absolute address. */
export function renderRobots(): string {
  return [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${new URL(sitemapFilename, publishedUrl).href}`,
    '',
  ].join('\n');
}

/**
 * One entry per page, in the order given, each dated the day the build read
 * the record as of: that day is when what the page says was last worked out,
 * so it is when the page last changed in any way a reader could see.
 */
export function renderSitemap(
  pageFilenames: readonly string[],
  builtOn: IsoDate,
): string {
  const entries = pageFilenames.map(
    (filename) =>
      `  <url>\n    <loc>${escapeHtml(pageAddress(filename))}</loc>\n    <lastmod>${builtOn}</lastmod>\n  </url>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}
