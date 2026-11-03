import { STATUSES } from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import { testRunOutcomes } from '../database/rows.ts';
import type { IsoDate } from '../database/rows.ts';
import { fixtureSnapshot } from '../testing/ledger.ts';
import { readableDay, renderPage } from './page.ts';
import type { PublishedLedger } from './snapshot.ts';

/**
 * The Welsh page (#284).
 *
 * The ledger is published in Welsh as well as English, from the same snapshot
 * in the same build, so the two pages cannot say different things about the
 * record. What can go wrong is quieter than a missing page: an English word
 * left in the Welsh one. A date is the likeliest place for it, because a date
 * is produced by code rather than written as copy, and code that formats a
 * day in English will go on doing it on a page that says `lang="cy"` without
 * anything looking broken to a reader who does not read Welsh.
 *
 * These are written against what the renderer is asked for, the Welsh page,
 * and they were run against the renderer as it was before it had one, where
 * every one of them failed.
 */

/** The English month and day names, in full and as three letters. */
const englishMonths = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const englishDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const englishDateWords = [
  ...englishMonths,
  ...englishDays,
  ...[...englishMonths, ...englishDays].map((name) => name.slice(0, 3)),
];

/** The months as the Welsh page names them, in order. */
const welshMonths = [
  'Ionawr',
  'Chwefror',
  'Mawrth',
  'Ebrill',
  'Mai',
  'Mehefin',
  'Gorffennaf',
  'Awst',
  'Medi',
  'Hydref',
  'Tachwedd',
  'Rhagfyr',
];

/**
 * Every English month or day name in a document, as whole words and in any
 * case, so `Oct`, `OCT` and `October` are all found and `Hydref` is not.
 */
function englishDateWordsIn(html: string): string[] {
  const pattern = new RegExp(`\\b(?:${englishDateWords.join('|')})\\b`, 'giu');
  return [...html.matchAll(pattern)].map((match) => match[0]);
}

/**
 * The fixture with every day on it moved into one month: the day it was built,
 * every run and every observation, and the days each check's status is read
 * from. Rendered once per month, that puts each of the twelve month names the
 * renderer knows on the page.
 */
function allIn(month: number): PublishedLedger {
  const ledger = fixtureSnapshot();
  const inMonth = (day: IsoDate | null): IsoDate | null =>
    day === null
      ? null
      : `${day.slice(0, 4)}-${String(month).padStart(2, '0')}${day.slice(7)}`;
  const moved = (day: IsoDate): IsoDate => inMonth(day) ?? day;
  return {
    ...ledger,
    builtOn: moved(ledger.builtOn),
    checks: ledger.checks.map((check) => ({
      ...check,
      lastCaughtOn: inMonth(check.lastCaughtOn),
      lastRunOn: inMonth(check.lastRunOn),
      lastSettledOn: inMonth(check.lastSettledOn),
      lastSeenArmedOn: inMonth(check.lastSeenArmedOn),
      runs: check.runs.map((run) => ({ ...run, runOn: moved(run.runOn) })),
      observations: check.observations.map((observation) => ({
        ...observation,
        observedOn: moved(observation.observedOn),
      })),
    })),
  };
}

/**
 * The fixture with one run of every outcome the ledger can record on the check
 * that has a run, newest first, so the Welsh page has to word all of them.
 */
function everyOutcome(): PublishedLedger {
  const ledger = fixtureSnapshot();
  const planted = ledger.checks.find((check) => check.runs.length > 0);
  const [run] = planted?.runs ?? [];
  if (planted === undefined || run === undefined) {
    throw new Error('The fixture has no check with a run.');
  }
  const runs = testRunOutcomes.map((outcome, index) => ({
    ...run,
    id: `${run.id}-${outcome}`,
    runOn: `2026-09-${String(17 - index).padStart(2, '0')}`,
    outcome,
    inconclusiveReason:
      outcome === 'inconclusive' ? 'The plant did not apply.' : null,
  }));
  return {
    ...ledger,
    checks: ledger.checks.map((check) =>
      check === planted ? { ...check, runs } : check,
    ),
  };
}

/** What a pill for this status says on a page, one entry per pill. */
function pillLabels(page: string, status: string): string[] {
  const pattern = new RegExp(
    `<span class="pill pill-${status}(?: pill-quiet)?">([^<]*)</span>`,
    'gu',
  );
  return [...page.matchAll(pattern)].map((match) => match[1] ?? '');
}

/** What the popover that explains this status says on a page. */
function meaningOf(page: string, status: string): string {
  const pattern = new RegExp(
    `<div popover id="means-${status}" class="meaning">(.*?)</div>`,
    'u',
  );
  return pattern.exec(page)?.[1] ?? '';
}

/** What each run's outcome is called on a page, in the order the runs are. */
function outcomeLabels(page: string): string[] {
  return [
    ...page.matchAll(
      /<span class="outcome outcome-([a-z]+)">([^<]*)<\/span>/gu,
    ),
  ].map((match) => `${match[1] ?? ''}: ${match[2] ?? ''}`);
}

it('gives the Welsh page its language', () => {
  const page = renderPage(fixtureSnapshot(), 'cy');

  expect(page).toMatch(/^<!doctype html>\n<html lang="cy">\n/u);
});

/**
 * The detector is shown to find what it looks for before its silence is read
 * as meaning anything: the English page for the same month names that month,
 * and the Welsh page names none.
 */
it('prints no English month or day name on the Welsh page, in any month', () => {
  for (let month = 1; month <= 12; month += 1) {
    const ledger = allIn(month);
    const english = renderPage(ledger, 'en');
    const welsh = renderPage(ledger, 'cy');

    expect(englishDateWordsIn(english)).toContain(
      englishMonths[month - 1]?.slice(0, 3),
    );
    expect(englishDateWordsIn(welsh)).toStrictEqual([]);
    expect(welsh).toContain(
      ` ${welshMonths[month - 1] ?? ''} ${ledger.builtOn.slice(0, 4)}`,
    );
  }
});

it('names every day in Welsh, from its own list of months', () => {
  expect(readableDay('2026-10-05', 'cy')).toBe('5 Hydref 2026');
  expect(readableDay('2026-01-31', 'cy')).toBe('31 Ionawr 2026');
  for (let month = 1; month <= 12; month += 1) {
    const day = `2026-${String(month).padStart(2, '0')}-01`;
    expect(readableDay(day, 'cy')).toBe(
      `1 ${welshMonths[month - 1] ?? ''} 2026`,
    );
  }
});

/**
 * Every status the ledger can hold is a pill on the page, with a count, and
 * each opens a line that says what it means. On the Welsh page neither the
 * pill nor the line may be the English one, and neither may be empty.
 */
it('gives every status the ledger can emit a Welsh label and a Welsh meaning', () => {
  const english = renderPage(fixtureSnapshot(), 'en');
  const welsh = renderPage(fixtureSnapshot(), 'cy');

  for (const status of STATUSES) {
    const englishLabels = pillLabels(english, status);
    const welshLabels = pillLabels(welsh, status);
    expect(englishLabels.length).toBeGreaterThan(0);
    expect(welshLabels).toHaveLength(englishLabels.length);
    for (const label of welshLabels) {
      expect(label).not.toMatch(new RegExp(`\\b${status}\\b`, 'iu'));
      expect(label.replace(/[^\p{L}]/gu, '')).not.toBe('');
    }

    const welshMeaning = meaningOf(welsh, status);
    expect(welshMeaning).not.toBe('');
    expect(welshMeaning).not.toBe(meaningOf(english, status));
    expect(welshMeaning).not.toMatch(new RegExp(`\\b${status}\\b`, 'iu'));
  }
});

it('words every outcome a run can have in Welsh', () => {
  const english = outcomeLabels(renderPage(everyOutcome(), 'en'));
  const welsh = outcomeLabels(renderPage(everyOutcome(), 'cy'));

  expect(english.map((label) => label.split(':')[0])).toStrictEqual([
    ...testRunOutcomes,
  ]);
  expect(welsh.map((label) => label.split(':')[0])).toStrictEqual([
    ...testRunOutcomes,
  ]);
  for (const [index, label] of welsh.entries()) {
    expect(label).not.toBe(english[index]);
    const [, words = ''] = label.split(': ');
    expect(words.replace(/[^\p{L}]/gu, '')).not.toBe('');
    expect(words).not.toMatch(/\b(?:caught|missed|settled nothing)\b/iu);
  }
});

/**
 * The product's name is English, so where a Welsh sentence on the page says
 * it, it is tagged English the way the records' own text is, and a screen
 * reader says it in English. The title and the meta tags cannot hold markup
 * and carry it plain.
 */
it('tags the product name as English inside the Welsh sentence that says what the page is', () => {
  const welsh = renderPage(fixtureSnapshot(), 'cy');

  expect(welsh).toContain(
    '<p class="eyebrow about">Mae <span lang="en">Seen to Fail</span> yn gofnod ',
  );
});

/**
 * Each page names itself as canonical, names both languages and a default
 * with hreflang, and links the other page in its own language's name, so a
 * reader on either can reach the other and a crawler can pair them.
 */
it('pairs the two pages with hreflang, a canonical each and a link to the other', () => {
  const english = renderPage(fixtureSnapshot(), 'en');
  const welsh = renderPage(fixtureSnapshot(), 'cy');
  const root = 'https://seen-to-fail.async-digital.com/';
  const welshAddress = `${root}index.cy.html`;
  const alternates = [
    `<link rel="alternate" hreflang="en-GB" href="${root}">`,
    `<link rel="alternate" hreflang="cy" href="${welshAddress}">`,
    `<link rel="alternate" hreflang="x-default" href="${root}">`,
  ];

  for (const page of [english, welsh]) {
    for (const alternate of alternates) {
      expect(page.split(alternate)).toHaveLength(2);
    }
  }
  expect(english).toContain(`<link rel="canonical" href="${root}">`);
  expect(welsh).toContain(`<link rel="canonical" href="${welshAddress}">`);
  expect(welsh).toContain(`<meta property="og:url" content="${welshAddress}">`);
  expect(english).toContain(
    '<a href="index.cy.html" hreflang="cy" lang="cy">Cymraeg</a>',
  );
  expect(welsh).toContain(
    '<a href="./" hreflang="en-GB" lang="en-GB">English</a>',
  );
});
