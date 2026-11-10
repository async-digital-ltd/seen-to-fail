import type { ReactElement } from 'react';

/** What follows every page's own title, so a tab names the app as well. */
export const appName = 'Seen to Fail';

/** The document title for a page: what the page is, then the app. */
export function documentTitle(page: string): string {
  return `${page} · ${appName}`;
}

/**
 * Sets the document title while the page is on screen (#28).
 *
 * The title is the first thing a screen reader says on arriving at a page,
 * and what names it in a tab, the history and a bookmark, so every route gives
 * one of its own rather than leaving the app's name on every page. React
 * moves a rendered `<title>` into the document head, and takes it out again
 * when the page goes.
 */
export function PageTitle({ page }: { readonly page: string }): ReactElement {
  return <title>{documentTitle(page)}</title>;
}
