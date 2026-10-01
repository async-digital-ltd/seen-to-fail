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
import {
  escapeHtml,
  publishedStatusOrder,
  readableDay,
  renderPage,
} from './page.ts';
import { buildSnapshot } from './snapshot.ts';
import type { PublishedCheck } from './snapshot.ts';

/**
 * The published page.
 *
 * Two things are worth testing about a rendered document, and neither is what
 * it looks like. One is that everything the record holds reaches it, because a
 * record that is not on the page is a record nobody will ever read. The other
 * is that it stays a document: no script, nothing fetched, nothing worked out
 * after the build.
 */

it('holds the same statuses the filter knows in its reading order, and no others', () => {
  expect([...publishedStatusOrder].sort()).toEqual([...STATUSES].sort());
});

it('names every check, and counts each status beside its word', () => {
  const page = renderPage(fixtureSnapshot());
  expect(page).toContain('A check with a catch behind it');
  expect(page).toContain('A check nobody has planted anything for');
  expect(page).toContain('✓ Proven 1');
  expect(page).toContain('? Unproven 1');
  expect(page).toContain('✕ Broken 0');
  expect(page).toContain('! Stale 0');
  expect(page).toContain('○ Unarmed 0');
});

/**
 * The first thing a reader is told is the result, so the headline is worked
 * out from the tally rather than written, and a page with fewer proven checks
 * says fewer.
 */
it('leads with how many checks have been seen to catch a planted defect', () => {
  const snapshot = fixtureSnapshot();
  expect(renderPage(snapshot)).toContain(
    '<span class="result">1 of 2</span> checks have been seen to catch a planted defect',
  );
  const fewer = {
    ...snapshot,
    statusCounts: { ...snapshot.statusCounts, Proven: 0, Unproven: 2 },
  };
  expect(renderPage(fewer)).toContain(
    '<span class="result">0 of 2</span> checks have been seen to catch a planted defect',
  );
});

it('shows a run with what was planted and what was expected', () => {
  const page = renderPage(fixtureSnapshot());
  expect(page).toContain('A type error.');
  expect(page).toContain('The type check fails.');
  expect(page).toContain('10 Sep 2026');
});

it('prints a day as a reader says it, without a time zone moving it', () => {
  expect(readableDay('2026-09-01')).toBe('1 Sep 2026');
  expect(readableDay('2026-12-31')).toBe('31 Dec 2026');
  expect(() => readableDay('not a day')).toThrow();
});

/**
 * A status is explained by tapping it rather than by a legend, so every status
 * has its explanation on the page, and every pill that shows a status opens
 * that status's explanation and no other. Stale's sentence carries the
 * threshold the build used, not a number written into the page.
 */
it('explains every status from the pill that shows it', () => {
  const page = renderPage(fixtureSnapshot());
  for (const status of publishedStatusOrder) {
    expect(page).toContain(`<div popover id="means-${status}"`);
    expect(page).toContain(`popovertarget="means-${status}"`);
  }
  expect(page).toContain(
    `Its last proof is older than ${String(fixtureSnapshot().staleAfterDays)} days.`,
  );
  const targets = [...page.matchAll(/popovertarget="([^"]+)"/g)].map(
    (match) => match[1],
  );
  const popovers = new Set(
    [...page.matchAll(/<div popover id="([^"]+)"/g)].map((match) => match[1]),
  );
  for (const target of targets) {
    expect(popovers.has(target)).toBe(true);
  }
  const pills = [
    ...page.matchAll(
      /popovertarget="means-([^"]+)"><span class="pill pill-([^" ]+)/g,
    ),
  ];
  expect(pills).toHaveLength(targets.length);
  for (const [, opens, shows] of pills) {
    expect(opens).toBe(shows);
  }
});

/**
 * Checks are grouped by their area, and the areas are read proof first: the
 * area with the larger share of its checks proven comes before the one with
 * less, whatever their names.
 */
it('groups checks by area, the best proven area first', () => {
  const snapshot = fixtureSnapshot();
  const proven = snapshot.checks.find((check) => check.status === 'Proven');
  const unproven = snapshot.checks.find((check) => check.status === 'Unproven');
  if (proven === undefined || unproven === undefined) {
    throw new Error('The fixture holds two checks.');
  }
  const page = renderPage({
    ...snapshot,
    checks: [
      { ...unproven, area: 'A first by name' },
      { ...proven, area: 'Z last by name' },
    ],
  });
  expect(page.indexOf('Z last by name')).toBeGreaterThan(-1);
  expect(page.indexOf('Z last by name')).toBeLessThan(
    page.indexOf('A first by name'),
  );
  expect(page).toContain('1 of 1 proven');
  expect(page).toContain('0 of 1 proven');
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
 * Five destinations and no sixth: a commit in this repository, the run a
 * replay named, the export beside the page, the repository itself, and the
 * studio that built it. Nothing here is fetched; these are places a reader can
 * go, and the list is closed so that a page which started reaching somewhere
 * else would fail rather than be noticed by somebody reading the HTML. Every
 * link is held to it, and so is every absolute address, which also lets the
 * SVG namespace through because it is not a link.
 *
 * The replay's ledger is the one rendered, because it is the one with a link
 * that is not a commit. Rendering the other would let a page that dropped the
 * run link pass.
 */
it('links only to a commit, a run a record named, the export, the repository or the studio', () => {
  const page = renderPage(fixtureSnapshot(fixtureContentsFromAReplay()));
  const urls = [...page.matchAll(/https?:\/\/[^"'\s]+/g)].map(
    (match) => match[0],
  );

  const repository = 'https://github.com/async-digital-ltd/seen-to-fail';
  const studio = 'https://async-digital.com';
  expect(urls).toContain(fixtureReplayRunUrl);
  expect(urls).toContain(repository);
  expect(urls).toContain(studio);
  const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const exported = 'ledger.json';
  expect(hrefs).toContain(exported);
  for (const url of [...urls, ...hrefs]) {
    if (
      url === fixtureReplayRunUrl ||
      url === repository ||
      url === studio ||
      url === exported ||
      url === 'http://www.w3.org/2000/svg'
    ) {
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
  expect(page).toContain('Ran against');
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
  expect(page).toContain(
    'Its status is read from 10 Sep 2026, the last run that settled anything.',
  );
  expect(page).toContain('<span class="run-day">16 Sep 2026</span>');
  // Read from the catch, not from the run that settled nothing.
  expect(page).toContain('1 settled nothing');
  expect(page).toContain('<span class="pill pill-Proven">✓ Proven</span>');
});

/**
 * The fact beside a check's name says what it leaves out.
 *
 * On a check where nothing settled nothing the figure is absent, and that is
 * safe only because the catches and the run count are both shown, so a reader
 * can see nothing is held back. Both sides are asserted so the absence is a
 * decision rather than a figure that got lost.
 */
it('names the runs that settled nothing only when there are some', () => {
  expect(renderPage(fixtureSnapshot())).toContain('Caught 1 of 1');
  expect(renderPage(fixtureSnapshot())).toContain('Never planted');
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
  ).toContain('Caught 1 of 2, 1 settled nothing');
});

/**
 * A check with a run behind it and no observation, against one with neither.
 *
 * Neither has an observation, so the "Last seen" line cannot be what separates
 * them, and a reader still has to be able to tell a check something was
 * planted for from one nothing has ever been done to. The run is taken in both
 * shapes it comes in: one that caught, which also moves the status, and one
 * that settled nothing, which leaves the check reading Unarmed exactly like a
 * check with neither, so only the fact beside the name and the list of planted
 * defects are left to tell them apart. Each check is read inside its own
 * section, so a page that said the right words about the wrong check fails.
 */
it('tells a check with a run and no observation apart from one with neither', () => {
  const snapshot = fixtureSnapshot();
  const caught = snapshot.checks.find((check) => check.id === 'first-check');
  const observed = snapshot.checks.find((check) => check.id === 'second-check');
  const unsettledRun = fixtureSnapshot(
    fixtureContentsWithAnUnsettledRun(),
    fixtureSummariesWithAnUnsettledRun(),
  )
    .checks.find((check) => check.id === 'first-check')
    ?.runs.find((run) => run.outcome === 'inconclusive');
  if (
    caught === undefined ||
    observed === undefined ||
    unsettledRun === undefined
  ) {
    throw new Error(
      'The fixture holds two checks and a run that settled nothing.',
    );
  }
  // The fixture's caught check has a run and no observation; this test is
  // only about that pair if it still does.
  expect(caught.runs).toHaveLength(1);
  expect(caught.observations).toHaveLength(0);

  const unsettled: PublishedCheck = {
    ...caught,
    id: 'unsettled-check',
    name: 'A check whose only run settled nothing',
    status: 'Unarmed',
    runCount: 1,
    caughtCount: 0,
    inconclusiveCount: 1,
    lastCaughtOn: null,
    lastRunOn: unsettledRun.runOn,
    lastSettledOn: null,
    runs: [unsettledRun],
  };
  const neither: PublishedCheck = {
    ...observed,
    id: 'bare-check',
    name: 'A check with no run and no observation',
    status: 'Unarmed',
    lastSeenArmedOn: null,
    lastArmed: null,
    observations: [],
  };
  const page = renderPage({
    ...snapshot,
    checks: [...snapshot.checks, unsettled, neither],
    statusCounts: { ...snapshot.statusCounts, Unarmed: 2 },
  });
  const section = (id: string): string => {
    const match = new RegExp(
      `<details class="check" id="${id}">[\\s\\S]*?</details>`,
    ).exec(page);
    if (match === null) {
      throw new Error(`The page has no section for ${id}.`);
    }
    return match[0];
  };

  const bare = section('bare-check');
  expect(bare).toContain('<span class="pill pill-Unarmed">');
  expect(bare).toContain('Never planted');
  expect(bare).toContain('None yet.');

  const proven = section('first-check');
  expect(proven).toContain('<span class="pill pill-Proven">');
  expect(proven).toContain('Caught 1 of 1');

  const nothingSettled = section('unsettled-check');
  expect(nothingSettled).toContain('<span class="pill pill-Unarmed">');
  expect(nothingSettled).toContain('Caught 0 of 1, 1 settled nothing');

  for (const withARun of [proven, nothingSettled]) {
    expect(withARun).toContain('Planted defects, newest first');
    expect(withARun).not.toContain('Never planted');
    expect(withARun).not.toContain('None yet.');
  }
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
