import { STATUSES } from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import {
  fixtureCommit,
  fixtureContents,
  fixtureContentsFromAReplay,
  fixtureContentsWithAnUnsettledRun,
  fixtureReplayCommit,
  fixtureReplayRunUrl,
  fixtureSnapshot,
  fixtureSummaries,
  fixtureSummariesWithAnUnsettledRun,
  fixtureUnsettledReason,
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
 * A run that settled nothing, on the page it is published to.
 *
 * The page it is published to is where somebody finds out that a plant has
 * stopped applying, so three things have to be on it: that the run settled
 * nothing, why, and how old the evidence behind the status really is. The
 * status itself is unchanged, and that is asserted too, because a page that
 * moved it would be the failure this outcome exists to stop.
 */
it('shows a run that settled nothing, its reason, and the day the status is read from', () => {
  const page = renderPage(
    fixtureSnapshot(
      fixtureContentsWithAnUnsettledRun(),
      fixtureSummariesWithAnUnsettledRun(),
    ),
  );

  expect(page).toContain('settled nothing');
  expect(page).toContain(escapeHtml(fixtureUnsettledReason));
  expect(page).toContain('<dt>Last settled</dt><dd>2026-09-10</dd>');
  expect(page).toContain('<dt>Last run</dt><dd>2026-09-16</dd>');
  // Read from the catch, not from the run that settled nothing.
  expect(page).toContain('1 settled nothing');
  expect(page).toContain('<span class="status status-Proven">Proven</span>');
});

/**
 * The counts under a check's name say what they leave out.
 *
 * On a check where nothing settled nothing the third figure is absent, and
 * that is safe only because the other two add up to the run count beside
 * them. Both sides are asserted so the absence is a decision rather than a
 * figure that got lost.
 */
it('names the runs that settled nothing only when there are some', () => {
  expect(renderPage(fixtureSnapshot())).toContain('1 run, 1 caught, 0 missed');
  // The footer explains the outcome whatever is recorded, so what is absent
  // from a page with none of them is the figure rather than the words.
  expect(renderPage(fixtureSnapshot())).not.toContain('0 settled nothing');

  expect(
    renderPage(
      fixtureSnapshot(
        fixtureContentsWithAnUnsettledRun(),
        fixtureSummariesWithAnUnsettledRun(),
      ),
    ),
  ).toContain('2 runs, 1 caught, 0 missed, 1 settled nothing');
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

/**
 * Where a replay's free text is allowed to land on the published page.
 *
 * `inconclusiveReason` is the one field on a run whose words come from a
 * program rather than from a person, and #67 hands it canfail's own `detail`
 * verbatim. `escapeHtml` escapes `& < > " '`, which is enough in a text node
 * and enough in a quoted attribute, and is not enough in three places that are
 * not the same as each other: an unquoted attribute, where escaping the quotes
 * buys nothing; a URL-valued attribute, where escaping never touches the
 * scheme; and a script or style context, where it does nothing whatever.
 *
 * So the property worth holding is structural rather than about characters: the
 * text reaches the document as a text node and nowhere else. The marker below
 * is looked for everywhere it appears, and each appearance is required to sit
 * after a `>` rather than inside a tag. A page that moved the reason into an
 * attribute would still escape it and would still fail here.
 */
const hostileReason =
  'ZZREASONZZ the anchor said "a" & <b>b</b>\' onmouseover=alert(1) javascript:alert(2)';

/** Every place the marker appears, and whether each sits in a text node. */
function marksInTextNodes(page: string, marker: string): boolean[] {
  const places: boolean[] = [];
  for (
    let at = page.indexOf(marker);
    at !== -1;
    at = page.indexOf(marker, at + 1)
  ) {
    const opened = page.lastIndexOf('<', at);
    const closed = page.lastIndexOf('>', at);
    places.push(closed > opened);
  }
  return places;
}

it('renders a replay reason as a text node, never inside a tag', () => {
  const contents = fixtureContentsWithAnUnsettledRun();
  const unsettled = contents.runs.at(-1);
  if (unsettled === undefined) {
    throw new Error('The fixture has no run that settled nothing.');
  }
  const page = renderPage(
    fixtureSnapshot(
      {
        ...contents,
        runs: [
          ...contents.runs.slice(0, -1),
          {
            ...unsettled,
            record: { ...unsettled.record, inconclusiveReason: hostileReason },
          },
        ],
      },
      fixtureSummariesWithAnUnsettledRun(),
    ),
  );

  // The reason is on the page twice: once in the run's row, once in the note
  // about the latest run. Both have to be text nodes, and the designed number
  // is asserted so that a render dropping one of them is a failure rather than
  // a shorter list that still passes.
  const places = marksInTextNodes(page, 'ZZREASONZZ');
  expect(places).toHaveLength(2);
  expect(places).toEqual([true, true]);

  expect(page).toContain(escapeHtml(hostileReason));
  expect(page).not.toMatch(/<b>/i);
  expect(page).not.toMatch(/<script/i);
});
