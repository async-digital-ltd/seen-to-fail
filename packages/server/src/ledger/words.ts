import type { Status } from '@seen-to-fail/filter';

import type { TestRunOutcome } from '../database/rows.ts';

/**
 * The words on the published page, once for each language it is published in
 * (#284).
 *
 * The page is built in English and in Welsh from the same snapshot by the same
 * renderer, so the two cannot come to say different things about the record:
 * only these words differ. Both sets are held to one interface, so a label
 * added for one language and not the other fails to compile, and so does a
 * status or an outcome either set leaves unworded.
 *
 * What is written here is the page's own wording. The records' text, such as a
 * check's name, its area, what was planted and every note, is the records'
 * own, written in English. The Welsh page prints its Welsh from the table in
 * record-welsh.ts, which is keyed on each text exactly as the record holds it,
 * so the table cannot quietly come to say something its record does not: an
 * edited record has no entry, and the build refuses to publish until it has.
 *
 * Every month is named from a fixed list rather than by the platform's date
 * formatting, which names Welsh months in English on runtimes that carry no
 * Welsh locale data and says nothing about having done it. No day of the week
 * is printed in either language, so neither set has a list of them.
 *
 * Values that are HTML are marked so. A value that is not is escaped where it
 * is put on the page.
 */

/** The languages the page is published in, in the order they are built. */
export const pageLanguages = ['en', 'cy'] as const;
export type PageLanguage = (typeof pageLanguages)[number];

/** Markup ready to go on the page as it stands: escaped, or the renderer's own. */
type Html = string;

type Months = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** One status and how many checks hold it. */
export interface StatusCount {
  readonly status: Status;
  readonly count: number;
}

export interface PageWords {
  readonly language: PageLanguage;
  /** The language as `lang` and `hreflang` name it. */
  readonly tag: 'en-GB' | 'cy';
  /** The same language as Open Graph names a locale. */
  readonly locale: 'en_GB' | 'cy_GB';
  /** The language's name in itself, which the other page's switch shows. */
  readonly ownName: string;
  /** The months, January first, as a day on the page names them. */
  readonly months: Months;

  /** The page's title. HTML. */
  readonly title: Html;
  readonly description: string;
  readonly previewImageAlt: string;
  /** The line above the headline, linking the repository. HTML. */
  readonly about: (repositoryHref: Html) => Html;

  readonly headlineEmpty: string;
  /** The headline, with the count in its result span. HTML. */
  readonly headline: (proven: number, total: number) => Html;
  /** The line under the headline, from the area names, escaped. HTML. */
  readonly scope: (areaNames: readonly Html[], whyHref: Html) => Html;

  readonly statuses: Readonly<Record<Status, string>>;
  readonly statusMeaning: (status: Status, staleAfterDays: number) => string;
  readonly statusHint: string;
  /** What a row of status squares says to a reader who cannot see it. */
  readonly cellsLabel: (parts: readonly StatusCount[]) => string;

  readonly idea: string;
  readonly viewRepository: string;
  /** The words a "Built from" line starts with, before the commit's link. */
  readonly builtFromCommit: string;
  readonly readAsOf: (day: string) => string;

  readonly checksHeading: (count: number) => string;
  readonly checksHint: string;
  readonly areaCount: (proven: number, total: number) => string;

  readonly neverPlanted: string;
  readonly caughtOf: (
    caught: number,
    total: number,
    settledNothing: number,
  ) => string;
  readonly protectsAgainst: string;
  readonly howToTellArmed: string;
  readonly lastSeen: string;
  readonly notWrittenDown: string;
  readonly notYetObserved: string;
  readonly seenSwitched: (armed: boolean) => string;
  /** The last observation, with its day, escaped. HTML. */
  readonly seenSwitchedOn: (armed: boolean, day: Html) => Html;
  readonly observationsHeading: string;

  /** Where a run was recorded, from a link to the commit. HTML. */
  readonly recordedIn: (commit: Html) => Html;
  readonly notCommittedYet: string;
  readonly byHand: string;
  readonly byReplay: string;
  readonly viewProof: string;
  /** What a replay ran against, from a link to the commit. HTML. */
  readonly ranAgainst: (commit: Html) => Html;
  /** Each outcome's name and mark. HTML. */
  readonly outcomes: Readonly<Record<TestRunOutcome, Html>>;
  readonly planted: string;
  readonly expected: string;
  readonly runsHeading: string;
  readonly runsHeadingNewestFirst: string;
  readonly noRunsYet: string;
  /** The notice over a check whose latest run settled nothing. HTML. */
  readonly latestSettledNothing: (reason: Html, since: Html) => Html;
  readonly nothingEverSettled: string;
  /** The day a check's status is read from, escaped. HTML. */
  readonly statusReadFrom: (day: Html) => Html;

  readonly howThisPageWorks: string;
  /** The body of the section that says how the page works. HTML. */
  readonly howItWorks: (staleAfterDays: number) => Html;
  /** A link's text naming the repository on GitHub, escaped. HTML. */
  readonly onGitHub: (repository: Html) => Html;
  readonly madeBy: string;
}

const englishNumberWords = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

/** A count as a reader would write it in a sentence: words up to ten. */
function counted(count: number, noun: string): string {
  const number = englishNumberWords[count] ?? String(count);
  return `${number} ${count === 1 ? noun : `${noun}s`}`;
}

/** Names joined as a list is written: "A", "A and B", "A, B and C". */
function listed(names: readonly string[], and: (last: string) => string) {
  const last = names.at(-1);
  if (last === undefined) {
    return '';
  }
  return names.length === 1
    ? last
    : `${names.slice(0, -1).join(', ')} ${and(last)} ${last}`;
}

/**
 * What the page is, said once, for a reader who arrives with no context. The
 * same words open the page and fill the link preview's description, so the two
 * cannot come to describe different things.
 */
const whatItIs =
  "a record of whether each of this project's own checks has been seen to catch a defect planted on purpose";

/** Escapes the one character the English wording has that a page cannot hold as it is. */
function apostrophes(text: string): string {
  return text.replace(/'/g, '&#39;');
}

export const english: PageWords = {
  language: 'en',
  tag: 'en-GB',
  locale: 'en_GB',
  ownName: 'English',
  months: [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ],

  title: "Seen to Fail: the record of this repository's own checks",
  description: `${whatItIs.charAt(0).toUpperCase()}${whatItIs.slice(1)}.`,
  previewImageAlt:
    'The Seen to Fail mark, an eye with a cross for its pupil, beside the words Seen to Fail.',
  about: (repositoryHref) =>
    `Seen to Fail is ${apostrophes(whatItIs)}, kept in <a href="${repositoryHref}">its repository on GitHub</a>.`,

  headlineEmpty: 'Nothing has been recorded yet',
  headline: (proven, total) =>
    `<span class="result">${String(proven)} of ${String(total)}</span> ${total === 1 ? 'check has' : 'checks have'} been seen to catch a planted defect`,
  scope: (areaNames, whyHref) => {
    const areasSentence =
      areaNames.length === 0
        ? ''
        : `These are the project&#39;s checks in ${counted(areaNames.length, 'area')}: ${listed(areaNames, () => 'and')}. `;
    return `${areasSentence}Checks about security, such as secret scanning, are left off a public ledger on purpose; <a href="${whyHref}">why</a>.`;
  },

  statuses: {
    Proven: 'Proven',
    Broken: 'Broken',
    Stale: 'Stale',
    Unproven: 'Unproven',
    Unarmed: 'Unarmed',
  },
  statusMeaning: (status, staleAfterDays) => {
    const meanings = {
      Proven: 'Caught a planted defect.',
      Broken: 'Its latest run missed.',
      Stale: `Its last proof is older than ${String(staleAfterDays)} days.`,
      Unproven: 'Never seen to fail.',
      Unarmed: 'No evidence it is switched on.',
    } as const satisfies Record<Status, string>;
    return meanings[status];
  },
  statusHint: 'Select a status to see what it means.',
  cellsLabel: (parts) =>
    parts
      .map((part) => `${String(part.count)} ${part.status.toLowerCase()}`)
      .join(', '),

  idea: 'A check earns trust only after someone plants the defect it exists to catch, runs it, and watches it go red.',
  viewRepository: 'View the repository on GitHub ↗',
  builtFromCommit: 'Built from commit',
  readAsOf: (day) => `read as of ${day}`,

  checksHeading: (count) =>
    `The ${String(count)} ${count === 1 ? 'check' : 'checks'}, by area`,
  checksHint: 'Open an area, then a check, to see its proof.',
  areaCount: (proven, total) => `${String(proven)} of ${String(total)} proven`,

  neverPlanted: 'Never planted',
  caughtOf: (caught, total, settledNothing) =>
    `Caught ${String(caught)} of ${String(total)}${settledNothing === 0 ? '' : `, ${String(settledNothing)} settled nothing`}`,
  protectsAgainst: 'Protects against',
  howToTellArmed: 'How you can tell it is switched on',
  lastSeen: 'Last seen',
  notWrittenDown: 'Nobody has written this down.',
  notYetObserved: 'Not yet observed.',
  seenSwitched: (armed) => `Seen switched ${armed ? 'on' : 'off'}`,
  seenSwitchedOn: (armed, day) =>
    `Seen switched ${armed ? 'on' : 'off'}, ${day}.`,
  observationsHeading: 'Seen switched on or off, newest first',

  recordedIn: (commit) => `Recorded in ${commit}.`,
  notCommittedYet: 'not committed yet',
  byHand: 'By hand',
  byReplay: 'By replay',
  viewProof: 'View proof',
  ranAgainst: (commit) => `Ran against ${commit}.`,
  outcomes: {
    caught: '✓ Caught',
    missed: '✕ Missed',
    inconclusive: 'Settled nothing',
  },
  planted: 'Planted',
  expected: 'Expected',
  runsHeading: 'Planted defects',
  runsHeadingNewestFirst: 'Planted defects, newest first',
  noRunsYet:
    'None yet. Until a defect is planted and caught, this check has not been seen to fail.',
  latestSettledNothing: (reason, since) =>
    `The latest run settled nothing: ${reason} ${since}`,
  nothingEverSettled: 'Nothing has ever settled anything for this check.',
  statusReadFrom: (day) =>
    `Its status is read from ${day}, the last run that settled anything.`,

  howThisPageWorks: 'How this page works',
  howItWorks: (
    staleAfterDays,
  ) => `<p>The checks on this page are recorded in a ledger kept in this repository, and the page is built from it at the commit named below.</p>
<p>To prove a check, a defect it should catch is planted on purpose, the check is run, and the result is recorded as one of three outcomes.</p>
<dl class="pair"><dt>Caught</dt><dd>The check went red.</dd><dt>Missed</dt><dd>The check stayed green.</dd><dt>Settled nothing</dt><dd>The run told us nothing about the check, and the reason is shown as it was written. No status is read from it.</dd></dl>
<p>A run by hand is one somebody planted, watched, and recorded. A replay was planted and scored by a job against newer code, so a check declared for replay keeps being tested after its first proof. A check that is not declared is tested only when somebody plants a defect by hand. A proof older than ${String(staleAfterDays)} days turns Stale.</p>
<p>Every run is a file in the repository, added by a commit like any other change, so a record that is wrong has an author, a diff, and a revert.</p>
<p>This page is read-only: it has no filter bar and no server behind it. The filter works when you run the app locally. The same ledger is published beside this page as <a href="ledger.json"><code>ledger.json</code></a>.</p>`,
  onGitHub: (repository) => `${repository} on GitHub ↗`,
  madeBy: 'Made by',
};

/**
 * A count of a masculine noun as Welsh writes it in figures: the figure and
 * the noun in the singular, which two softens (2 wiriad, 3 gwiriad). Every
 * noun counted on the page is masculine, so the feminine forms of two, three
 * and four are not needed here.
 */
function cyNumbered(count: number, noun: string, afterTwo: string): string {
  return `${String(count)} ${count === 2 ? afterTwo : noun}`;
}

/**
 * Names joined as a Welsh list: "A", "A a B", "A, B a C" (#284).
 *
 * The names are the records' own, in Welsh from record-welsh.ts, so the one
 * after "a" takes the aspirate mutation: an opening c, p or t becomes ch, ph
 * or th, as in "Cod, Adeiladu a Chofnod cyhoeddedig". Before a vowel "a" is
 * "ac" and nothing mutates. A name that opens with code is printed as it is,
 * so it takes "a" and no mutation.
 */
function cyListed(names: readonly Html[]): Html {
  const last = names.at(-1);
  if (last === undefined) {
    return '';
  }
  if (names.length === 1) {
    return last;
  }
  const joined = /^[aeiouyâêîôûŵŷ]/iu.test(last)
    ? `ac ${last}`
    : `a ${last.replace(/^([CcPpTt])(?![Hh])/u, '$1h')}`;
  return `${names.slice(0, -1).join(', ')} ${joined}`;
}

const cyStatuses = {
  Proven: 'Wedi’i brofi',
  Broken: 'Wedi torri',
  Stale: 'Wedi dyddio',
  Unproven: 'Heb ei brofi',
  Unarmed: 'Heb ei alluogi',
} as const satisfies Record<Status, string>;

/** Each outcome's name, which the run's line marks and the how section defines. */
const cyOutcomeNames = {
  caught: 'Wedi dal',
  missed: 'Heb ddal',
  inconclusive: 'Heb benderfynu dim',
} as const satisfies Record<TestRunOutcome, string>;

/** The same words in Welsh: formal but not stiff, as a public body writes. */
export const welsh: PageWords = {
  language: 'cy',
  tag: 'cy',
  locale: 'cy_GB',
  ownName: 'Cymraeg',
  months: [
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
  ],

  title: 'Seen to Fail: cofnod gwiriadau’r ystorfa hon ei hun',
  description:
    'Cofnod sy’n dangos a welwyd pob un o wiriadau’r prosiect hwn yn dal nam a blannwyd yn fwriadol.',
  previewImageAlt:
    'Nod Seen to Fail, llygad â chroes yn gannwyll iddo, wrth ymyl y geiriau Seen to Fail.',
  about: (repositoryHref) =>
    `Mae <span lang="en">Seen to Fail</span> yn gofnod sy’n dangos a welwyd pob un o wiriadau’r prosiect hwn yn dal nam a blannwyd yn fwriadol. Mae’n cael ei gadw yn <a href="${repositoryHref}">yr ystorfa ar GitHub</a>.`,

  headlineEmpty: 'Nid oes dim wedi’i gofnodi eto',
  headline: (proven, total) =>
    `Gwiriadau a welwyd yn dal nam a blannwyd: <span class="result">${String(proven)} o ${String(total)}</span>`,
  scope: (areaNames, whyHref) => {
    const areasSentence =
      areaNames.length === 0
        ? ''
        : `Dyma wiriadau’r prosiect ${areaNames.length === 1 ? 'yn y maes hwn' : 'yn y meysydd hyn'}: ${cyListed(areaNames)}. `;
    return `${areasSentence}Mae gwiriadau sy’n ymwneud â diogelwch, fel sganio am gyfrinachau, yn cael eu hepgor o gyfriflyfr cyhoeddus yn fwriadol; <a href="${whyHref}">pam</a> (yn Saesneg).`;
  },

  statuses: cyStatuses,
  statusMeaning: (status, staleAfterDays) => {
    const meanings = {
      Proven: 'Daliodd nam a blannwyd.',
      Broken: 'Ni ddaliodd ei rediad diweddaraf y nam.',
      Stale: `Mae ei brawf olaf yn hŷn na ${cyNumbered(staleAfterDays, 'diwrnod', 'ddiwrnod')}.`,
      Unproven: 'Heb ei weld yn methu erioed.',
      Unarmed: 'Dim tystiolaeth ei fod wedi’i droi ymlaen.',
    } as const satisfies Record<Status, string>;
    return meanings[status];
  },
  statusHint: 'Dewiswch statws i weld beth mae’n ei olygu.',
  cellsLabel: (parts) =>
    parts
      .map((part) => `${cyStatuses[part.status]}: ${String(part.count)}`)
      .join(', '),

  idea: 'Nid yw gwiriad yn ennill ymddiriedaeth nes i rywun blannu’r nam y mae i fod i’w ddal, rhedeg y gwiriad, a gwylio’r gwiriad yn troi’n goch.',
  viewRepository: 'Gweld yr ystorfa ar GitHub ↗',
  builtFromCommit: 'Adeiladwyd o ymrwymiad',
  readAsOf: (day) => `gyda’r statws fel yr oedd ar ${day}`,

  checksHeading: (count) =>
    `${cyNumbered(count, 'gwiriad', 'wiriad')}, fesul maes`,
  checksHint: 'Agorwch faes, yna wiriad, i weld ei brawf.',
  areaCount: (proven, total) =>
    `${String(proven)} o ${String(total)} ${proven === 1 ? 'wedi’i brofi' : 'wedi’u profi'}`,

  neverPlanted: 'Ni phlannwyd nam erioed',
  caughtOf: (caught, total, settledNothing) =>
    `Daliodd ${String(caught)} o ${String(total)}${settledNothing === 0 ? '' : `, ${String(settledNothing)} heb benderfynu dim`}`,
  protectsAgainst: 'Yn amddiffyn rhag',
  howToTellArmed: 'Sut i wybod ei fod wedi’i droi ymlaen',
  lastSeen: 'Gwelwyd ddiwethaf',
  notWrittenDown: 'Nid oes neb wedi ysgrifennu hyn.',
  notYetObserved: 'Heb ei weld eto.',
  seenSwitched: (armed) => `Gwelwyd ei fod ${armed ? 'ymlaen' : 'i ffwrdd'}`,
  seenSwitchedOn: (armed, day) =>
    `Gwelwyd ei fod ${armed ? 'ymlaen' : 'i ffwrdd'} ar ${day}.`,
  observationsHeading:
    'Wedi’i weld ymlaen neu i ffwrdd, y diweddaraf yn gyntaf',

  recordedIn: (commit) => `Cofnodwyd yn ${commit}.`,
  notCommittedYet: 'heb ei ymrwymo eto',
  byHand: 'Â llaw',
  byReplay: 'Drwy ailchwarae',
  viewProof: 'Gweld y prawf',
  ranAgainst: (commit) => `Rhedwyd yn erbyn ${commit}.`,
  outcomes: {
    caught: `✓ ${cyOutcomeNames.caught}`,
    missed: `✕ ${cyOutcomeNames.missed}`,
    inconclusive: cyOutcomeNames.inconclusive,
  },
  planted: 'Plannwyd',
  expected: 'Disgwylid',
  runsHeading: 'Namau a blannwyd',
  runsHeadingNewestFirst: 'Namau a blannwyd, y diweddaraf yn gyntaf',
  noRunsYet:
    'Dim eto. Nes i nam gael ei blannu a’i ddal, nid yw’r gwiriad hwn wedi’i weld yn methu.',
  latestSettledNothing: (reason, since) =>
    `Ni phenderfynodd y rhediad diweddaraf ddim: ${reason} ${since}`,
  nothingEverSettled:
    'Nid oes yr un rhediad erioed wedi penderfynu dim ynghylch y gwiriad hwn.',
  statusReadFrom: (day) =>
    `Mae ei statws yn cael ei ddarllen o’r rhediad ar ${day}, yr olaf a benderfynodd rywbeth.`,

  howThisPageWorks: 'Sut mae’r dudalen hon yn gweithio',
  howItWorks: (
    staleAfterDays,
  ) => `<p>Mae’r gwiriadau ar y dudalen hon wedi’u cofnodi mewn cyfriflyfr a gedwir yn yr ystorfa hon, ac mae’r dudalen yn cael ei hadeiladu ohono ar yr ymrwymiad a enwir isod.</p>
<p>I brofi gwiriad, mae nam y dylai’r gwiriad ei ddal yn cael ei blannu’n fwriadol, mae’r gwiriad yn cael ei redeg, ac mae’r canlyniad yn cael ei gofnodi fel un o dri chanlyniad.</p>
<dl class="pair"><dt>${cyOutcomeNames.caught}</dt><dd>Trodd y gwiriad yn goch.</dd><dt>${cyOutcomeNames.missed}</dt><dd>Arhosodd y gwiriad yn wyrdd.</dd><dt>${cyOutcomeNames.inconclusive}</dt><dd>Ni ddywedodd y rhediad ddim wrthym am y gwiriad, ac mae’r rheswm a gofnodwyd yn cael ei ddangos. Nid oes statws yn cael ei ddarllen ohono.</dd></dl>
<p>Rhediad â llaw yw un y mae rhywun wedi’i blannu, ei wylio a’i gofnodi. Mae ailchwarae yn cael ei blannu a’i sgorio gan swydd yn erbyn cod newyddach, felly mae gwiriad a ddatganwyd ar gyfer ailchwarae yn dal i gael ei brofi ar ôl ei brawf cyntaf. Dim ond pan fydd rhywun yn plannu nam â llaw y caiff gwiriad nad yw wedi’i ddatgan ei brofi. Mae prawf sy’n hŷn na ${cyNumbered(staleAfterDays, 'diwrnod', 'ddiwrnod')} yn cael y statws ${cyStatuses.Stale}.</p>
<p>Mae pob rhediad yn ffeil yn yr ystorfa, wedi’i hychwanegu gan ymrwymiad fel unrhyw newid arall, felly mae gan gofnod anghywir awdur, gwahaniaeth i’w ddarllen, a ffordd o’i ddadwneud.</p>
<p>Darllen yn unig yw’r dudalen hon: nid oes ganddi far hidlo na gweinydd y tu ôl iddi. Mae’r hidlydd yn gweithio pan fyddwch yn rhedeg yr ap yn lleol. Cyhoeddir yr un cyfriflyfr wrth ymyl y dudalen hon fel <a href="ledger.json"><code>ledger.json</code></a>.</p>`,
  onGitHub: (repository) => `${repository} ar GitHub ↗`,
  madeBy: 'Gwnaed gan',
};

/** The words for each language, by its code. */
export const pageWords = {
  en: english,
  cy: welsh,
} as const satisfies Record<PageLanguage, PageWords>;
