import type { Status } from '@seen-to-fail/filter';

import { outcomeSettlesSomething } from '../database/rows.ts';
import type { IsoDate } from '../database/rows.ts';
import { recordPieces } from './record-text.ts';
import type { RecordWelsh } from './record-text.ts';
import type {
  PublishedCheck,
  PublishedLedger,
  PublishedObservation,
  PublishedRun,
} from './snapshot.ts';
import { studioMark } from './studio-mark.ts';
import { pageLanguages, pageWords } from './words.ts';
import type { PageLanguage, PageWords } from './words.ts';

/**
 * The published page: one HTML file, rendered from the export and from nothing
 * else.
 *
 * It carries no script. Not "no framework" and not "no bundle": no JavaScript
 * at all, so there is nothing for a reader to have blocked, nothing to fetch, no
 * API behind it and no way for the page to disagree with the export it was
 * rendered from at some later moment. Whatever the page says, it said at build
 * time and a commit is named for it.
 *
 * It reads from the result down (#132). The first screen says which repository
 * this is the record of and how many of its checks have been seen to catch a
 * planted defect. The checks sit below that, grouped by area and closed, and a
 * reader opens an area and then a check to reach the proof. The opening and
 * closing is the browser's own `<details>`, and a status explains itself through
 * the browser's own popover, so neither needs a line of script.
 *
 * There is no filter bar, and the page says so rather than leaving the absence
 * to be noticed. The filter language compiles to SQL and there is no database
 * here to compile it against; running the app locally is where it works. That
 * was ruled on #63 with the cost stated plainly, and #73 is the follow-up.
 */

/**
 * Where the page is served, as the address a reader shares.
 *
 * GitHub Pages serves it there because the repository's Pages settings name
 * that custom domain; nothing in the build can read those settings, so the
 * address is written here once and every tag that needs it reads it from here.
 * Link previews need it absolute: a crawler reading `og:url` or `og:image` has
 * no page to resolve a relative address against (#237).
 */
export const publishedUrl = 'https://seen-to-fail.async-digital.com/';

/**
 * The image a link preview shows, written beside the page by the build.
 *
 * A static PNG committed beside this file, 1200 by 630, the size Open Graph
 * and the large Twitter card both expect: the Seen to Fail mark and the words
 * "Seen to Fail", the same image the studio's own site uses for this project.
 * It is copied, not drawn at build time, so the build fetches nothing and needs
 * no font.
 */
export const previewImageFilename = 'preview.png';
export const previewImageWidth = 1200;
export const previewImageHeight = 630;
const previewImageUrl = new URL(previewImageFilename, publishedUrl).href;

/**
 * The page's icons, committed beside this file and copied out by the build
 * beside the page (#254). All three draw the Seen to Fail mark, the eye with a
 * cross for its pupil that `preview.png` shows: `favicon.svg` is the studio's
 * tile of it, and the other two are rendered from that file. `favicon.ico` is
 * there because browsers and crawlers ask for it at the root whether the page
 * names it or not; the touch icon is what a phone uses for a saved link.
 *
 * The page names them by relative address, which resolves to the root of the
 * site because the page is the root.
 */
export const iconFilenames = [
  'favicon.ico',
  'favicon.svg',
  'apple-touch-icon.png',
] as const;

/**
 * The icon links, with each address under `base`. The page passes nothing,
 * because it is the root. The not-found page passes `/`, because GitHub Pages
 * serves it at whatever address was missed, where a relative address would
 * resolve under that address instead of the root.
 */
function iconLinksUnder(base: '' | '/'): string {
  return [
    `<link rel="icon" href="${base}favicon.ico" sizes="32x32">`,
    `<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">`,
    `<link rel="apple-touch-icon" href="${base}apple-touch-icon.png">`,
  ].join('\n');
}

const iconLinks = iconLinksUnder('');

/**
 * The README section that says why checks about security are not on a public
 * ledger, which the line under the headline links to (#240).
 *
 * GitHub gives a heading in a README an anchor made from its words, lowercased
 * and joined by hyphens. Nothing in the build can ask GitHub what anchor it
 * made, so page.test.ts and check-published-output.sh both read README.md and
 * refuse this anchor when no heading there would produce it.
 */
export const publicLedgerAnchor = 'what-belongs-on-a-public-ledger';

/**
 * The line under the headline that says what the count is a count of (#240).
 *
 * The headline's "N of M checks" reads as all of the project's checks, and it
 * is not: the repository's secret scanning and push protection are checks
 * about security, and they are left off on purpose. This line says so, and
 * links the README section that says why. It does not say they are recorded
 * somewhere else, because they are not: there is no private ledger.
 *
 * The areas are read from the checks themselves, in the order their cards
 * follow below, so the line cannot name an area the page does not have or miss
 * one it does.
 */
function scopeLine(
  words: Words,
  ledger: PublishedLedger,
  areaNames: readonly string[],
): string {
  const why = `${repositoryHref(ledger)}#${publicLedgerAnchor}`;
  return `<p class="eyebrow scope">${words.scope(areaNames.map(words.record), escapeHtml(why))}</p>`;
}

/**
 * The order the statuses are read in, from the one a reader can trust to the
 * one they know least about.
 *
 * The same order the app shows, written again here because the published page
 * cannot import the client and the filter package's list is in no particular
 * order for reading. page.test.ts checks this holds the same five words as that
 * list, so a status added there and not here fails a test rather than quietly
 * never appearing on the page.
 */
export const publishedStatusOrder: readonly Status[] = [
  'Proven',
  'Broken',
  'Stale',
  'Unproven',
  'Unarmed',
];

/**
 * The mark beside each status word, the same one the app draws.
 *
 * A status is never told by colour alone: the word is always there, and the
 * mark is the second thing that differs, for a reader who cannot tell the
 * colours apart.
 */
const statusMarks = {
  Proven: '✓',
  Broken: '✕',
  Stale: '!',
  Unproven: '?',
  Unarmed: '○',
} as const satisfies Record<Status, string>;

/**
 * The five characters that would otherwise let a record's text change the page
 * around it.
 *
 * Every value from the ledger goes through this on its way into the HTML. The
 * ledger's records are reviewed in a pull request before they land, so this is
 * not the only thing standing between a hostile record and the page, but a
 * record is text somebody wrote and the page is a document: a check named
 * `<script>` should read as a check named `<script>`.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * A day as a reader says it in the page's language, such as 18 Sep 2026 or
 * 18 Medi 2026, from that language's own list of months.
 *
 * Worked out from the three parts of the ISO day rather than through Date, so
 * no time zone can move it to the day before and no runtime's locale data can
 * decide what a month is called.
 */
export function readableDay(value: IsoDate, language: PageLanguage): string {
  const [year, month, dayOfMonth] = value.split('-');
  const name = pageWords[language].months[Number(month) - 1];
  if (year === undefined || dayOfMonth === undefined || name === undefined) {
    throw new Error(`${value} is not a day this page can print.`);
  }
  return `${String(Number(dayOfMonth))} ${name} ${year}`;
}

/** The first seven characters of a commit, as git and GitHub abbreviate it. */
function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

function repositoryHref(ledger: PublishedLedger): string {
  return `https://github.com/${encodeURI(ledger.repository)}`;
}

function commitHref(ledger: PublishedLedger, commit: string): string {
  return `${repositoryHref(ledger)}/commit/${encodeURIComponent(commit)}`;
}

/** A link to a commit on GitHub. */
function commitLink(ledger: PublishedLedger, commit: string): string {
  return `<a href="${escapeHtml(commitHref(ledger, commit))}"><code>${escapeHtml(shortCommit(commit))}</code></a>`;
}

/** A link to a commit on GitHub, or a plain statement that there is none. */
function commitCell(
  words: PageWords,
  ledger: PublishedLedger,
  commit: string | null,
): string {
  return commit === null
    ? `<span class="muted">${words.notCommittedYet}</span>`
    : commitLink(ledger, commit);
}

/**
 * A record's text as the page in this language prints it, escaped (#284).
 *
 * The English page prints the record as written, and the Welsh page prints its
 * Welsh from the table in record-welsh.ts, so the Welsh page is Welsh
 * throughout and carries no English standing in for it. On both, each
 * identifier and piece of quoted tool output the entry marks is printed as it
 * is, as code tagged English, so a screen reader reads it in English inside a
 * Welsh sentence and a reader can look it up exactly as printed.
 *
 * Escaping is per piece, and the only markup added is the code element, so a
 * record still cannot put markup of its own on the page.
 */
export function recordHtml(
  text: string,
  language: PageLanguage,
  recordWelsh: RecordWelsh,
): string {
  return recordPieces(text, language, recordWelsh)
    .map((piece) =>
      piece.code
        ? `<code lang="en">${escapeHtml(piece.text)}</code>`
        : escapeHtml(piece.text),
    )
    .join('');
}

/**
 * One page's words, with the way that page prints a record's text. Every part
 * of the page that shows a record takes these rather than the bare words, so
 * none of them can print a record's text any other way.
 */
interface Words extends PageWords {
  /** A record's text on this page, escaped, with its code marked. HTML. */
  readonly record: (text: string) => string;
}

/** Text a person may not have written down, said either way. */
function written(words: Words, text: string): string {
  return text === ''
    ? `<span class="muted">${words.notWrittenDown}</span>`
    : words.record(text);
}

/** A day on the page, in the page's language, escaped. */
function dayOn(words: PageWords, value: IsoDate): string {
  return escapeHtml(readableDay(value, words.language));
}

/** The id of the popover that explains a status. */
function meaningId(status: Status): string {
  return `means-${status}`;
}

/**
 * A status pill a reader can tap to be told what it means.
 *
 * A button rather than a span, because tapping it does something: it opens the
 * status's popover, and it can be reached and pressed from the keyboard. Inside
 * a check's summary line the button takes the tap for itself, so explaining a
 * status never opens or closes the check around it.
 */
function statusPill(words: PageWords, status: Status, count?: number): string {
  const name = words.statuses[status];
  const label =
    count === undefined
      ? `${statusMarks[status]} ${name}`
      : `${statusMarks[status]} ${name} ${String(count)}`;
  const quiet = count === 0 ? ' pill-quiet' : '';
  return `<button type="button" class="pill-button" popovertarget="${meaningId(status)}"><span class="pill pill-${status}${quiet}">${escapeHtml(label)}</span></button>`;
}

/**
 * The five explanations, one per status, each opened by every pill that shows
 * that status.
 */
function meanings(words: PageWords, ledger: PublishedLedger): string {
  return publishedStatusOrder
    .map(
      (status) =>
        `<div popover id="${meaningId(status)}" class="meaning"><strong>${escapeHtml(words.statuses[status])}</strong>: ${escapeHtml(words.statusMeaning(status, ledger.staleAfterDays))}</div>`,
    )
    .join('\n');
}

/** One square per check, in the order given, marked with its status. */
function cells(
  checks: readonly PublishedCheck[],
  size: 'large' | 'small',
): string {
  return checks
    .map(
      (check) =>
        `<span class="cell cell-${size} cell-${check.status}">${statusMarks[check.status]}</span>`,
    )
    .join('');
}

/** What the squares say, for a reader who cannot see them. */
function cellsLabel(
  words: PageWords,
  checks: readonly PublishedCheck[],
): string {
  return words.cellsLabel(
    publishedStatusOrder
      .map((status) => ({
        status,
        count: checks.filter((check) => check.status === status).length,
      }))
      .filter((part) => part.count > 0),
  );
}

function byReadingOrder(left: PublishedCheck, right: PublishedCheck): number {
  return (
    publishedStatusOrder.indexOf(left.status) -
    publishedStatusOrder.indexOf(right.status)
  );
}

/**
 * Where the proof of a run is, and what a reader is told about where it came
 * from.
 *
 * A replay's proof is the job run that planted and scored it. A run by hand has
 * no job behind it, so its proof is the commit that recorded it: a reader who
 * doubts it can read the diff. The commit a replay ran against is not the one
 * that recorded it, and both are named, each saying which it is, because two
 * abbreviated shas in one row are otherwise told apart by position alone.
 *
 * A replay missing either the commit or the run is refused by the reader, by
 * the database and by the check the build runs before it publishes. Reaching
 * here without them means all three have stopped working, so this says so
 * rather than rendering a row that quietly drops the evidence.
 */
function provenance(
  words: PageWords,
  ledger: PublishedLedger,
  run: PublishedRun,
): { method: string; proof: string; detail: string } {
  const recorded = words.recordedIn(commitCell(words, ledger, run.recordedIn));
  if (run.source === 'hand') {
    const proof =
      run.recordedIn === null
        ? ''
        : `<a class="proof" href="${escapeHtml(commitHref(ledger, run.recordedIn))}">${words.viewProof}</a>`;
    return { method: words.byHand, proof, detail: recorded };
  }
  if (run.sourceCommit === null || run.sourceRunUrl === null) {
    throw new Error(
      `The replay recorded in ${run.sourceFile} is published without the ` +
        'commit it ran against or the run that produced it.',
    );
  }
  return {
    method: words.byReplay,
    proof: `<a class="proof" href="${escapeHtml(run.sourceRunUrl)}">${words.viewProof}</a>`,
    detail: `${words.ranAgainst(commitLink(ledger, run.sourceCommit))} ${recorded}`,
  };
}

/**
 * One planted defect: when, what the check did, what was planted and what was
 * expected, and the way to the proof.
 *
 * For a run that settled nothing the reason is shown as it was written and not
 * sorted into a category. Only one of the situations that settle nothing means
 * the plant needs rewriting, they are told apart by a scoring tool inside an
 * English sentence, and a category recovered by matching that prose would send
 * a reader to rewrite a plant that is fine. The Welsh page shows the same
 * sentence in Welsh, translated from its exact words, and not a category
 * either.
 */
function runItem(
  words: Words,
  ledger: PublishedLedger,
  run: PublishedRun,
): string {
  const { method, proof, detail } = provenance(words, ledger, run);
  const reason =
    run.inconclusiveReason === null
      ? ''
      : `<p class="note">${words.record(run.inconclusiveReason)}</p>`;
  const note =
    run.note === null ? '' : `<p class="note">${words.record(run.note)}</p>`;
  return `<li class="run">
<p class="run-head"><span class="run-day">${dayOn(words, run.runOn)}</span><span class="outcome outcome-${run.outcome}">${words.outcomes[run.outcome]}</span><span class="muted">${method}</span>${proof}</p>
${reason}<dl class="pair"><dt>${words.planted}</dt><dd>${words.record(run.planted)}</dd><dt>${words.expected}</dt><dd>${words.record(run.expected)}</dd></dl>
${note}<p class="note">${detail}</p>
</li>`;
}

function runsList(
  words: Words,
  ledger: PublishedLedger,
  check: PublishedCheck,
): string {
  if (check.runs.length === 0) {
    return `<h4>${words.runsHeading}</h4>
<p class="empty">${words.noRunsYet}</p>`;
  }
  return `<h4>${words.runsHeadingNewestFirst}</h4>
<ol class="runs">
${check.runs.map((run) => runItem(words, ledger, run)).join('\n')}
</ol>`;
}

function observationItem(
  words: Words,
  ledger: PublishedLedger,
  observation: PublishedObservation,
): string {
  const note =
    observation.note === null
      ? ''
      : `<p class="note">${words.record(observation.note)}</p>`;
  return `<li><span class="run-day">${dayOn(words, observation.observedOn)}</span> ${words.seenSwitched(observation.armed)}. <span class="muted">${words.recordedIn(commitCell(words, ledger, observation.recordedIn))}</span>${note}</li>`;
}

/**
 * The last time anyone looked, or a plain statement that nobody has.
 *
 * Both the reading and the day come from one observation: the first in the
 * list, which is the latest, and which the build holds to be the one the
 * derivation named before anything is published (see verify.ts). The day is
 * never lastSeenArmedOn. That is the last day the check was seen switched on,
 * so beside "off" it named a day the check was on, and for a check only ever
 * seen switched off it is empty though somebody did look (#215).
 */
function lastSeen(words: PageWords, check: PublishedCheck): string {
  const [latest] = check.observations;
  if (latest === undefined) {
    return `<span class="muted">${words.notYetObserved}</span>`;
  }
  return words.seenSwitchedOn(latest.armed, dayOn(words, latest.observedOn));
}

function observationsList(
  words: Words,
  ledger: PublishedLedger,
  check: PublishedCheck,
): string {
  if (check.observations.length === 0) {
    return '';
  }
  return `<h4>${words.observationsHeading}</h4>
<ul class="observations">
${check.observations.map((observation) => observationItem(words, ledger, observation)).join('\n')}
</ul>`;
}

/**
 * The line that says the latest run told the reader nothing, when it did.
 *
 * Without it, a check whose replays have all stopped applying reads with the
 * status its last real run left it, and nothing on the page says that the runs
 * since then were not evidence. The status is not wrong; it is just older than
 * the newest run makes it look, and this says how much older.
 */
function unsettledNotice(words: Words, check: PublishedCheck): string {
  const [latest] = check.runs;
  if (latest === undefined || outcomeSettlesSomething[latest.outcome]) {
    return '';
  }
  if (latest.inconclusiveReason === null) {
    // A run that settled nothing carries its reason or the reader, the
    // database and the check the build runs before it publishes all refuse it.
    // Reaching here without one means all three have stopped working, so this
    // says so rather than printing a sentence with a hole in it.
    throw new Error(
      `The run recorded in ${latest.sourceFile} settled nothing and is published without a reason.`,
    );
  }
  const since =
    check.lastSettledOn === null
      ? words.nothingEverSettled
      : words.statusReadFrom(dayOn(words, check.lastSettledOn));
  // The reason is shown as it was written, or as its Welsh entry renders it,
  // so it may end without a full stop. One is added after it, outside any code
  // it ends with, so it does not run into the next sentence.
  const reason = words.record(latest.inconclusiveReason).trimEnd();
  const stop = /[.!?…](?:<\/code>)?$/u.test(reason) ? '' : '.';
  return `<p class="unsettled">${words.latestSettledNothing(`${reason}${stop}`, since)}</p>`;
}

/**
 * The one fact beside a check's name when it is closed.
 *
 * The runs that settled nothing are named only when there are some, and the
 * misses are there to be read off: caught and the total are both shown, so a
 * reader can see nothing is being held back.
 */
function checkFact(words: PageWords, check: PublishedCheck): string {
  if (check.runCount === 0) {
    return words.neverPlanted;
  }
  return words.caughtOf(
    check.caughtCount,
    check.runCount,
    check.inconclusiveCount,
  );
}

function checkSection(
  words: Words,
  ledger: PublishedLedger,
  check: PublishedCheck,
): string {
  return `<details class="check" id="${escapeHtml(check.id)}">
<summary><span class="check-name"><span class="chevron" aria-hidden="true">›</span>${words.record(check.name)}</span><span class="check-state">${statusPill(words, check.status)}<span class="fact">${escapeHtml(checkFact(words, check))}</span></span></summary>
<div class="check-body">
${unsettledNotice(words, check)}
<dl class="facts">
<div><dt>${words.protectsAgainst}</dt><dd>${written(words, check.protects)}</dd></div>
<div><dt>${words.howToTellArmed}</dt><dd>${written(words, check.howToTellArmed)}</dd></div>
<div><dt>${words.lastSeen}</dt><dd>${lastSeen(words, check)}</dd></div>
</dl>
${runsList(words, ledger, check)}
${observationsList(words, ledger, check)}
</div>
</details>`;
}

interface Area {
  readonly name: string;
  readonly checks: readonly PublishedCheck[];
  readonly proven: number;
}

/**
 * The checks, grouped by area, the area with the most of its checks proven
 * first.
 *
 * The proof leads because that is what a reader came to see; the bad news is
 * one area down, counted in the headline and never folded away out of reach.
 * Within an area checks follow the status reading order, and the export's own
 * order by name after that.
 */
function areas(ledger: PublishedLedger): readonly Area[] {
  const grouped = new Map<string, PublishedCheck[]>();
  for (const check of ledger.checks) {
    const list = grouped.get(check.area) ?? [];
    list.push(check);
    grouped.set(check.area, list);
  }
  return [...grouped.entries()]
    .map(([name, checks]) => ({
      name,
      checks: [...checks].sort(byReadingOrder),
      proven: checks.filter((check) => check.status === 'Proven').length,
    }))
    .sort(
      (left, right) =>
        right.proven / right.checks.length - left.proven / left.checks.length ||
        right.checks.length - left.checks.length ||
        left.name.localeCompare(right.name),
    );
}

function areaSection(
  words: Words,
  ledger: PublishedLedger,
  area: Area,
): string {
  const total = area.checks.length;
  return `<details class="area">
<summary><span class="area-name"><span class="chevron" aria-hidden="true">›</span><span><span class="area-title">${words.record(area.name)}</span><span class="area-count">${escapeHtml(words.areaCount(area.proven, total))}</span></span></span><span class="cells" role="img" aria-label="${escapeHtml(cellsLabel(words, area.checks))}">${cells(area.checks, 'small')}</span></summary>
<div class="area-body">
${area.checks.map((check) => checkSection(words, ledger, check)).join('\n')}
</div>
</details>`;
}

/**
 * The palette, the same custom properties the client's tokens file declares,
 * and a dark set for a reader whose system asks for one.
 *
 * Copied rather than imported, because the client's CSS is bundled by Vite and
 * this page is one file with no build behind it. The two are allowed to drift:
 * this is a published document and that is an application, and neither is the
 * other's source of truth.
 *
 * Amber measures 2.9:1 on the light ground, under the floor for text, so a
 * Stale pill takes the colour on its edge and says its word in ink.
 *
 * The focus ring is brick at 70% because 60% measured 2.9:1 on an area card in
 * the light scheme, under the 3:1 a focus indicator needs. The hover tint is
 * ink at 5% because 7% took red pill text on a card to 4.4:1. Both are held
 * by page-contrast.test.ts.
 */
const style = `:root {
  color-scheme: light dark;
  --bg: #fdfbf7;
  --surface: #f8f5ee;
  --border: #e8e4dc;
  --ink: #1f1c18;
  --muted: #6b6560;
  --primary: #8b3a2a;
  --on-primary: #ffffff;
  --success: #3e7a4a;
  --success-ink: #2f6a3b;
  --on-success: #ffffff;
  --warning: #c48b2c;
  --error: #cc2222;
  --studio: #8b3a2a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171512;
    --surface: #211e1a;
    --border: #36312b;
    --ink: #eee9e1;
    --muted: #a9a197;
    --primary: #e3927f;
    --on-primary: #1a0e0b;
    --success: #7cc08a;
    --success-ink: #8fd09c;
    --on-success: #10200f;
    --error: #f08b7f;
    --studio: #eee9e1;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.page { max-width: 55rem; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; overflow-wrap: anywhere; }
a { color: var(--primary); text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover { text-decoration-thickness: 2px; }
a:focus-visible, summary:focus-visible, .pill-button:focus-visible > .pill {
  outline: 2px solid color-mix(in srgb, var(--primary) 70%, transparent);
  outline-offset: 2px;
  border-radius: 10px;
}
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.muted { color: var(--muted); }
.top { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding-bottom: 1rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
.top .name { font-weight: 600; font-size: 1rem; }
.top-links { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.25rem; }
.hero { display: flex; flex-direction: column; gap: 1.5rem; padding: 3.5rem 0 3rem; }
.eyebrow { margin: 0; color: var(--muted); font-size: 0.875rem; }
.about { max-width: 60ch; }
.scope { max-width: 60ch; margin-top: -0.75rem; }
h1 { margin: 0; max-width: 18ch; font-size: clamp(2.1rem, 6vw, 3.25rem); line-height: 1.08; letter-spacing: -0.025em; }
h1 .result { color: var(--success-ink); }
.strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(1.75rem, 1fr)); gap: 0.375rem; max-width: 32.5rem; }
.pills { display: flex; flex-wrap: wrap; align-items: center; gap: 0 0.75rem; margin-top: -0.75rem; }
.hint { color: var(--muted); font-size: 0.875rem; }
.idea { margin: 0; max-width: 52ch; font-size: 1.2rem; line-height: 1.5; }
.go { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
.button { display: inline-flex; align-items: center; min-height: 44px; padding: 0.75rem 1.1rem; border-radius: 10px; background: var(--primary); color: var(--on-primary); font-weight: 600; text-decoration: none; }
.fresh { color: var(--muted); font-size: 0.875rem; }
.cell { display: flex; align-items: center; justify-content: center; font-weight: 700; border-radius: 8px; color: var(--muted); border: 1.5px solid var(--border); }
.cell-large { height: 2.25rem; }
.cell-small { width: 1.625rem; height: 1.625rem; border-radius: 6px; font-size: 0.8rem; }
.cell-Proven { background: var(--success); border-color: var(--success); color: var(--on-success); }
.cell-Broken { border-color: var(--error); color: var(--error); }
.cell-Stale { border-color: var(--warning); color: var(--ink); }
.cell-Unproven { border-style: dashed; border-color: var(--muted); }
.pill-button { display: inline-flex; align-items: center; min-height: 44px; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; }
.pill { display: inline-block; padding: 0.1rem 0.625rem; border: 1px solid var(--border); border-radius: 999px; font-size: 0.875rem; font-weight: 600; white-space: nowrap; transition: background 120ms; }
.pill-button:hover > .pill { background: color-mix(in srgb, var(--ink) 5%, transparent); }
.pill-Proven { color: var(--success-ink); border-color: currentColor; }
.pill-Broken { color: var(--error); border-color: currentColor; }
.pill-Stale { border-color: var(--warning); }
.pill-Unproven { border-style: dashed; border-color: var(--muted); }
.pill-Unarmed { color: var(--muted); }
.pill-quiet { color: var(--muted); border-color: var(--border); border-style: solid; }
.meaning { margin: auto; padding: 0.5rem 0.75rem; border: 0; border-radius: 10px; background: var(--ink); color: var(--bg); font-size: 0.875rem; line-height: 1.45; max-width: 16rem; }
@supports (position-area: bottom) {
  .meaning { inset: auto; margin: 0.375rem 0; position-area: bottom span-right; position-try-fallbacks: flip-block, flip-inline; }
}
h2 { margin: 0; font-size: 1.25rem; }
.list-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.5rem 1rem; margin-bottom: 1rem; }
.areas { display: flex; flex-direction: column; gap: 0.75rem; }
summary { list-style: none; cursor: pointer; }
summary::-webkit-details-marker { display: none; }
.chevron { flex: none; width: 0.75rem; color: var(--muted); transition: transform 200ms cubic-bezier(0.2, 0.6, 0.2, 1); }
details[open] > summary .chevron { transform: rotate(90deg); }
.area { border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
.area > summary { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem 1.25rem; padding: 1.25rem; min-height: 4rem; }
.area-name { flex: 1 1 13rem; display: flex; align-items: center; gap: 0.75rem; }
.area-title { display: block; font-size: 1.25rem; font-weight: 600; line-height: 1.3; }
.area-count { display: block; color: var(--muted); font-size: 0.875rem; }
.cells { display: flex; flex-wrap: wrap; gap: 0.25rem; padding-left: 1.5rem; }
.area-body { padding: 0 0.75rem 0.75rem; }
.check { border-top: 1px solid var(--border); }
.check > summary { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 1rem; padding: 0.375rem 0.5rem 0.375rem 2rem; min-height: 3.5rem; }
.check-name { flex: 1 1 15rem; display: flex; align-items: center; gap: 0.625rem; font-weight: 600; line-height: 1.4; }
.check-state { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.75rem; padding-left: 1.25rem; font-size: 0.875rem; }
.check-body { margin: 0 0 1rem 2rem; padding: 1.25rem; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); display: flex; flex-direction: column; gap: 1rem; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr)); gap: 1rem 2rem; margin: 0; }
.facts dt, h4 { color: var(--muted); font-size: 0.875rem; }
.facts dd { margin: 0.125rem 0 0; }
h4 { margin: 0; font-weight: 600; }
.runs, .observations { list-style: none; margin: 0; padding: 0; }
.run, .observations li { padding: 0.875rem 0; border-top: 1px solid var(--border); }
.run-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.875rem; margin: 0 0 0.375rem; font-size: 0.875rem; }
.run-day { font-weight: 600; min-width: 5.25rem; display: inline-block; }
.proof { margin-left: auto; }
.outcome { font-weight: 600; }
.outcome-caught { color: var(--success-ink); }
.outcome-missed { color: var(--error); }
.pair { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.125rem 0.75rem; margin: 0; font-size: 0.95rem; }
.pair dt { color: var(--muted); }
.pair dd { margin: 0; }
.note { margin: 0.375rem 0 0; color: var(--muted); font-size: 0.875rem; }
.empty { margin: 0; padding-top: 0.75rem; border-top: 1px solid var(--border); color: var(--muted); }
.unsettled { margin: 0; padding: 0.6rem 0.75rem; border-left: 3px solid var(--warning); background: var(--surface); font-size: 0.9rem; }
.how { margin-top: 3.5rem; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); }
.how > summary { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; min-height: 3.5rem; font-weight: 600; }
.how-body { padding: 0 1.25rem 1.5rem 2.75rem; max-width: 68ch; font-size: 0.95rem; }
.how-body p { margin: 0 0 0.875rem; }
.how-body .pair { margin: 0 0 0.875rem; }
footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 1.5rem; color: var(--muted); font-size: 0.875rem; }
.foot-line { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem 1.5rem; }
.studio { display: flex; align-items: center; gap: 1rem; width: fit-content; min-height: 44px; color: var(--muted); text-decoration: none; }
.studio svg { display: block; height: 3rem; width: auto; color: var(--studio); }`;

/**
 * The file each language's page is written to, at the root of the site (#284).
 * The English page is the site's index and the Welsh page sits beside it, so
 * each has an address of its own to be linked, shared and indexed at.
 */
export const languagePageFilenames = {
  en: 'index.html',
  cy: 'index.cy.html',
} as const satisfies Record<PageLanguage, string>;

/**
 * Where the studio mark in the footer sends a reader: the studio's home page in
 * the page's own language, so a reader of the Welsh page lands on the Welsh
 * home rather than the English one. Held to every language the page is
 * published in, so a language added without a home fails to compile.
 */
export const studioHomes = {
  en: 'https://async-digital.com',
  cy: 'https://async-digital.com/index.cy.html?lang=cy',
} as const satisfies Record<PageLanguage, string>;

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

function addressOf(language: PageLanguage): string {
  return pageAddress(languagePageFilenames[language]);
}

/**
 * The links that pair the pages for a crawler: one per language, and a default
 * for a reader whose language is neither, which is the English page. Every
 * page carries all of them, its own included, which is what hreflang asks.
 */
function alternateLinks(): string {
  return [
    ...pageLanguages.map(
      (language) =>
        `<link rel="alternate" hreflang="${pageWords[language].tag}" href="${escapeHtml(addressOf(language))}">`,
    ),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(addressOf('en'))}">`,
  ].join('\n');
}

function otherLanguages(words: PageWords): readonly PageLanguage[] {
  return pageLanguages.filter((language) => language !== words.language);
}

/** The page's own locale for a link preview, and the others it is published in. */
function localeTags(words: PageWords): string {
  return [
    `<meta property="og:locale" content="${words.locale}">`,
    ...otherLanguages(words).map(
      (language) =>
        `<meta property="og:locale:alternate" content="${pageWords[language].locale}">`,
    ),
  ].join('\n');
}

/**
 * The way to each other page, in the header, named in its own language, so a
 * reader who cannot read this page can still find theirs. The English page is
 * linked as `./`, the root address it gives itself as canonical, rather than
 * by its filename.
 */
function languageSwitch(words: PageWords): string {
  return otherLanguages(words)
    .map((language) => {
      const theirs = pageWords[language];
      const href = language === 'en' ? './' : languagePageFilenames[language];
      return `<a href="${href}" hreflang="${theirs.tag}" lang="${theirs.tag}">${theirs.ownName}</a>`;
    })
    .join('');
}

/**
 * One page, in one language, as one string.
 *
 * Returned rather than written, so the build can hold it beside the export,
 * check the two agree, and only then put either of them on disk. A page written
 * first and checked afterwards is a page that has already been published when
 * the check fails.
 *
 * Every language's page is this one template with that language's words, so
 * the pages have the same parts in the same order and carry the same record.
 *
 * The record's own text comes from `recordWelsh` on the Welsh page. Given no
 * table, the English page prints every record as it is written, and the Welsh
 * page cannot be drawn at all: it throws on the first record text it meets.
 * The build never gets that far without a table that covers every text, because
 * it refuses first (see `welshRefusals` in record-text.ts).
 */
export function renderPage(
  ledger: PublishedLedger,
  language: PageLanguage,
  recordWelsh: RecordWelsh = new Map(),
): string {
  const words: Words = {
    ...pageWords[language],
    record: (text) => recordHtml(text, language, recordWelsh),
  };
  const address = escapeHtml(addressOf(language));
  const description = escapeHtml(words.description);
  const imageAlt = escapeHtml(words.previewImageAlt);
  const checkCount = ledger.checks.length;
  const proven = ledger.statusCounts.Proven;
  const ordered = [...ledger.checks].sort(byReadingOrder);
  const repository = repositoryHref(ledger);
  const grouped = areas(ledger);
  const areaNames = grouped.map((area) => area.name);
  const built = `${words.builtFromCommit} <a href="${escapeHtml(commitHref(ledger, ledger.builtFrom))}"><code>${escapeHtml(shortCommit(ledger.builtFrom))}</code></a>, ${words.readAsOf(dayOn(words, ledger.builtOn))}.`;
  const headline =
    checkCount === 0 ? words.headlineEmpty : words.headline(proven, checkCount);

  return `<!doctype html>
<html lang="${words.tag}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${words.title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${address}">
${alternateLinks()}
${iconLinks}
<meta property="og:type" content="website">
<meta property="og:title" content="Seen to Fail">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${address}">
${localeTags(words)}
<meta property="og:image" content="${escapeHtml(previewImageUrl)}">
<meta property="og:image:width" content="${String(previewImageWidth)}">
<meta property="og:image:height" content="${String(previewImageHeight)}">
<meta property="og:image:alt" content="${imageAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Seen to Fail">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${escapeHtml(previewImageUrl)}">
<meta name="twitter:image:alt" content="${imageAlt}">
<style>
${style}
</style>
</head>
<body>
<div class="page">
<header class="top">
<span class="name">Seen to Fail</span>
<span class="top-links">${languageSwitch(words)}<a href="${escapeHtml(repository)}">${escapeHtml(ledger.repository)} ↗</a></span>
</header>
<section class="hero">
<p class="eyebrow about">${words.about(escapeHtml(repository))}</p>
<h1>${headline}</h1>
${scopeLine(words, ledger, areaNames)}
<div class="strip" role="img" aria-label="${escapeHtml(cellsLabel(words, ordered))}">${cells(ordered, 'large')}</div>
<div class="pills">
${publishedStatusOrder.map((status) => statusPill(words, status, ledger.statusCounts[status])).join('\n')}
<span class="hint">${words.statusHint}</span>
</div>
${meanings(words, ledger)}
<p class="idea">${words.idea}</p>
<div class="go">
<a class="button" href="${escapeHtml(repository)}">${words.viewRepository}</a>
<span class="fresh">${built}</span>
</div>
</section>
<section aria-labelledby="checks">
<div class="list-head">
<h2 id="checks">${words.checksHeading(checkCount)}</h2>
<span class="hint">${words.checksHint}</span>
</div>
<div class="areas">
${grouped.map((area) => areaSection(words, ledger, area)).join('\n')}
</div>
</section>
<details class="how">
<summary><span class="chevron" aria-hidden="true">›</span>${words.howThisPageWorks}</summary>
<div class="how-body">
${words.howItWorks(ledger.staleAfterDays)}
</div>
</details>
<footer>
<div class="foot-line">
<span>${built}</span>
<a href="${escapeHtml(repository)}">${words.onGitHub(escapeHtml(ledger.repository))}</a>
</div>
<a class="studio" href="${escapeHtml(studioHomes[words.language])}"><span>${words.madeBy}</span>${studioMark}</a>
</footer>
</div>
</body>
</html>
`;
}

/**
 * Every language's page, from the one snapshot and the one table of the
 * records' Welsh. Written out as one entry per language rather than mapped, so
 * a language added to `pageLanguages` and not here fails to compile instead of
 * being left unbuilt.
 */
export function renderPages(
  ledger: PublishedLedger,
  recordWelsh: RecordWelsh,
): Readonly<Record<PageLanguage, string>> {
  return {
    en: renderPage(ledger, 'en', recordWelsh),
    cy: renderPage(ledger, 'cy', recordWelsh),
  };
}

/**
 * The page GitHub Pages serves for every address with nothing behind it
 * (#283), written beside the page by the build. Without it a mistyped link
 * shows GitHub's own page: English only, and with no way back here.
 */
export const notFoundFilename = '404.html';

/**
 * The not-found page, as one string.
 *
 * It is served at whatever address was missed, so every address on it starts
 * at the root. It is in English and then in Welsh, because a reader can arrive
 * from a page in either language and the address alone says nothing about
 * which. The two halves have the same parts, a label, a headline, a line under
 * it and the way home, held by the same rules in the page's own stylesheet, so
 * neither language is the lesser one. The ledger is published in both (#284),
 * so each half's way home goes to the page in its own language.
 *
 * The site shows no email address, so the way to report a broken link is the
 * repository the page already links. It asks search engines to leave it out,
 * which is what keeps it off the sitemap: the sitemap is drawn from
 * `pageFilenames`, and the published-output check skips a `noindex` page.
 */
export function renderNotFoundPage(ledger: PublishedLedger): string {
  const repository = repositoryHref(ledger);
  const issues = `${repository}/issues`;

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>Page not found · Methu dod o hyd i’r dudalen · Seen to Fail</title>
${iconLinksUnder('/')}
<style>
${style}
</style>
</head>
<body>
<div class="page">
<header class="top">
<a class="name" href="/">Seen to Fail</a>
<a href="${escapeHtml(repository)}">${escapeHtml(ledger.repository)} ↗</a>
</header>
<main>
<section class="hero">
<p class="eyebrow">Error 404</p>
<h1>Page not found</h1>
<p class="idea">The link may be broken, or the page may have moved.</p>
<p><a href="/">Go to the home page</a>, or if a link on our site brought you here, tell us on <a href="${escapeHtml(issues)}">GitHub</a>.</p>
</section>
<section class="hero" lang="cy">
<p class="eyebrow">Gwall 404</p>
<h1>Methu dod o hyd i’r dudalen</h1>
<p class="idea">Efallai fod y ddolen wedi torri, neu fod y dudalen wedi symud.</p>
<p><a href="/${languagePageFilenames.cy}">Ewch i’r hafan</a>, neu os daethoch chi yma o ddolen ar ein gwefan, rhowch wybod i ni ar <a href="${escapeHtml(issues)}">GitHub</a>.</p>
</section>
</main>
<footer>
<div class="foot-line">
<a href="${escapeHtml(repository)}">${escapeHtml(ledger.repository)} on GitHub ↗</a>
<a href="${escapeHtml(repository)}" lang="cy">${escapeHtml(ledger.repository)} ar GitHub ↗</a>
</div>
<a class="studio" href="https://async-digital.com"><span>Made by · <span lang="cy">Gwnaed gan</span></span>${studioMark}</a>
</footer>
</div>
</body>
</html>
`;
}

/** The export, as the file written beside the page. */
export function renderExport(ledger: PublishedLedger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}
