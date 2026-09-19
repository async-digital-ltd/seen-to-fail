import { STATUSES } from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import {
  fixtureCommit,
  fixtureContents,
  fixtureContentsFromAReplay,
  fixtureReplayCommit,
  fixtureReplayRunUrl,
  fixtureSnapshot,
  fixtureSummaries,
} from '../testing/ledger.ts';
import { escapeHtml, publishedStatusOrder, renderPage } from './page.ts';
import { buildSnapshot } from './snapshot.ts';

/**
 * The published page.
 *
 * Two things are worth testing about a rendered document, and neither is what
 * it looks like. One is that everything the record holds reaches it, because a
 * record that is not on the page is a record nobody will ever read. The other
 * is that it stays a document: no script, nothing fetched, nothing worked out
 * after the build.
 */

it('shows the reading order, and holds the same statuses the filter knows', () => {
  expect([...publishedStatusOrder].sort()).toEqual([...STATUSES].sort());
});

it('names every check, and counts them on the tiles', () => {
  const page = renderPage(fixtureSnapshot());
  expect(page).toContain('A check with a catch behind it');
  expect(page).toContain('A check nobody has planted anything for');
  expect(page).toContain(
    '<span class="count">1</span><span class="label">Proven</span>',
  );
});

it('shows a run with what was planted and what was expected', () => {
  const page = renderPage(fixtureSnapshot());
  expect(page).toContain('A type error.');
  expect(page).toContain('The type check fails.');
  expect(page).toContain('2026-09-10');
});

/**
 * The link back to the commit is what makes a published run checkable: a reader
 * who doubts it can read the diff that recorded it.
 */
it('links each run to the commit that recorded it', () => {
  expect(renderPage(fixtureSnapshot())).toContain(
    'https://github.com/async-digital-ltd/seen-to-fail/commit/1234567890abcdef1234567890abcdef12345678',
  );
});

it('names the commit it was built from', () => {
  expect(renderPage(fixtureSnapshot())).toContain(fixtureCommit.slice(0, 7));
});

/**
 * A check whose tell nobody has written down is the thing this product exists
 * to make visible, so the page has to say so rather than leave a gap a reader
 * reads as "fine".
 */
it('says so where nobody has written something down', () => {
  expect(renderPage(fixtureSnapshot())).toContain(
    'Nobody has written this down',
  );
});

it('says that the filter language is not on the page and where it is', () => {
  const page = renderPage(fixtureSnapshot());
  expect(page).toContain('no filter bar');
  expect(page).toContain('locally');
});

/**
 * The one property that makes this a published record rather than a deployed
 * application. A script would mean something on the page is worked out in the
 * reader's browser, after the build, with nothing naming a commit for it.
 */
it('carries no script at all', () => {
  expect(renderPage(fixtureSnapshot())).not.toMatch(/<script/i);
});

/**
 * Three destinations and no fourth: a commit in this repository, the run a
 * replay named, and the export beside the page. Nothing here is fetched; these
 * are places a reader can go, and the list is closed so that a page which
 * started reaching somewhere else would fail rather than be noticed by
 * somebody reading the HTML.
 *
 * The replay's ledger is the one rendered, because it is the one with a link
 * that is not a commit. Rendering the other would let a page that dropped the
 * run link pass.
 */
it('links only to a commit, to a run a record named, or to the export', () => {
  const page = renderPage(fixtureSnapshot(fixtureContentsFromAReplay()));
  const urls = [...page.matchAll(/https?:\/\/[^"'\s]+/g)].map(
    (match) => match[0],
  );

  expect(urls).toContain(fixtureReplayRunUrl);
  for (const url of urls) {
    if (url === fixtureReplayRunUrl) {
      continue;
    }
    expect(url).toMatch(
      /^https:\/\/github\.com\/async-digital-ltd\/seen-to-fail\/commit\//,
    );
  }
});

/**
 * Where each run came from, on the page, for both answers.
 *
 * "By hand" is rendered as plainly as "by replay", because the absence of a
 * word is the one thing a reader cannot tell from a page that failed to render
 * it, and by hand is the answer that says the proof does not keep itself.
 */
it('says where every run came from', () => {
  expect(renderPage(fixtureSnapshot())).toContain('By hand');

  const replayed = renderPage(fixtureSnapshot(fixtureContentsFromAReplay()));
  expect(replayed).toContain('By replay');
  expect(replayed).not.toContain('By hand');
});

/**
 * Two commits can appear in one row and they are different facts: the commit a
 * replay ran against, and the commit that recorded the run afterwards. The
 * page names both, so neither is told from the other by position alone.
 */
it('names the commit a replay ran against apart from the one that recorded it', () => {
  const page = renderPage(fixtureSnapshot(fixtureContentsFromAReplay()));

  expect(page).toContain(`/commit/${fixtureReplayCommit}`);
  expect(page).toContain('/commit/1234567890abcdef1234567890abcdef12345678');
  expect(page).toContain('Came from');
  expect(page).toContain('Recorded in');
});

/**
 * A record is text somebody wrote and the page is a document. A check named
 * with a tag should read as a check named with a tag.
 */
it('escapes what a record holds rather than letting it close a tag', () => {
  const contents = fixtureContents();
  const [first, ...rest] = contents.checks;
  if (first === undefined) {
    throw new Error('The fixture has no checks.');
  }
  const page = renderPage(
    buildSnapshot({
      contents: {
        ...contents,
        checks: [
          { ...first, record: { ...first.record, name: '<script>alert(1)' } },
          ...rest,
        ],
      },
      summaries: fixtureSummaries(),
      ledgerPath: 'ledger',
      repository: 'async-digital-ltd/seen-to-fail',
      builtFrom: fixtureCommit,
      builtOn: '2026-09-18',
      staleAfterDays: 30,
      recordingCommits: new Map(),
    }),
  );

  expect(page).not.toMatch(/<script/i);
  expect(page).toContain(escapeHtml('<script>alert(1)'));
});
