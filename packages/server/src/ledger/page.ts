import type { Status } from '@seen-to-fail/filter';

import { outcomeSettlesSomething } from '../database/rows.ts';
import type { IsoDate, TestRunOutcome } from '../database/rows.ts';
import type {
  PublishedCheck,
  PublishedLedger,
  PublishedObservation,
  PublishedRun,
} from './snapshot.ts';
import { studioMark } from './studio-mark.ts';

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
 * What each status means, in the line a reader gets when they tap it.
 *
 * Stale takes the threshold the statuses were read against, so the sentence
 * cannot name a number of days the build did not use.
 */
function statusMeaning(status: Status, staleAfterDays: number): string {
  const meanings = {
    Proven: 'Caught a planted defect.',
    Broken: 'Its latest run missed.',
    Stale: `Its last proof is older than ${String(staleAfterDays)} days.`,
    Unproven: 'Never seen to fail.',
    Unarmed: 'No evidence it is switched on.',
  } as const satisfies Record<Status, string>;
  return meanings[status];
}

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

const monthNames = [
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
] as const;

/**
 * A day as a reader says it, such as 18 Sep 2026.
 *
 * Worked out from the three parts of the ISO day rather than through Date, so
 * no time zone can move it to the day before.
 */
export function readableDay(value: IsoDate): string {
  const [year, month, dayOfMonth] = value.split('-');
  const name = monthNames[Number(month) - 1];
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
function commitCell(ledger: PublishedLedger, commit: string | null): string {
  return commit === null
    ? '<span class="muted">not committed yet</span>'
    : commitLink(ledger, commit);
}

/** Text a person may not have written down, said either way. */
function written(text: string): string {
  return text === ''
    ? '<span class="muted">Nobody has written this down.</span>'
    : escapeHtml(text);
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
function statusPill(status: Status, count?: number): string {
  const label =
    count === undefined
      ? `${statusMarks[status]} ${status}`
      : `${statusMarks[status]} ${status} ${String(count)}`;
  const quiet = count === 0 ? ' pill-quiet' : '';
  return `<button type="button" class="pill-button" popovertarget="${meaningId(status)}"><span class="pill pill-${status}${quiet}">${escapeHtml(label)}</span></button>`;
}

/**
 * The five explanations, one per status, each opened by every pill that shows
 * that status.
 */
function meanings(ledger: PublishedLedger): string {
  return publishedStatusOrder
    .map(
      (status) =>
        `<div popover id="${meaningId(status)}" class="meaning"><strong>${status}</strong>: ${escapeHtml(statusMeaning(status, ledger.staleAfterDays))}</div>`,
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
function cellsLabel(checks: readonly PublishedCheck[]): string {
  const parts = publishedStatusOrder
    .map((status) => ({
      status,
      count: checks.filter((check) => check.status === status).length,
    }))
    .filter((part) => part.count > 0)
    .map((part) => `${String(part.count)} ${part.status.toLowerCase()}`);
  return parts.join(', ');
}

function byReadingOrder(left: PublishedCheck, right: PublishedCheck): number {
  return (
    publishedStatusOrder.indexOf(left.status) -
    publishedStatusOrder.indexOf(right.status)
  );
}

/**
 * What each outcome is called on the page, and the mark it carries.
 *
 * "Settled nothing" rather than "inconclusive", because the word a reader needs
 * is the one that says the run tells them nothing about the check, and every
 * other sentence on the page about this outcome is worded the same way. Keyed
 * by the outcome, so an outcome added and not worded fails to compile rather
 * than printing its own label at a reader.
 */
const outcomeWords = {
  caught: '✓ Caught',
  missed: '✕ Missed',
  inconclusive: 'Settled nothing',
} as const satisfies Record<TestRunOutcome, string>;

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
  ledger: PublishedLedger,
  run: PublishedRun,
): { method: string; proof: string; detail: string } {
  const recorded = `Recorded in ${commitCell(ledger, run.recordedIn)}.`;
  if (run.source === 'hand') {
    const proof =
      run.recordedIn === null
        ? ''
        : `<a class="proof" href="${escapeHtml(commitHref(ledger, run.recordedIn))}">View proof</a>`;
    return { method: 'By hand', proof, detail: recorded };
  }
  if (run.sourceCommit === null || run.sourceRunUrl === null) {
    throw new Error(
      `The replay recorded in ${run.sourceFile} is published without the ` +
        'commit it ran against or the run that produced it.',
    );
  }
  return {
    method: 'By replay',
    proof: `<a class="proof" href="${escapeHtml(run.sourceRunUrl)}">View proof</a>`,
    detail: `Ran against ${commitLink(ledger, run.sourceCommit)}. ${recorded}`,
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
 * a reader to rewrite a plant that is fine.
 */
function runItem(ledger: PublishedLedger, run: PublishedRun): string {
  const { method, proof, detail } = provenance(ledger, run);
  const reason =
    run.inconclusiveReason === null
      ? ''
      : `<p class="note">${escapeHtml(run.inconclusiveReason)}</p>`;
  const note =
    run.note === null ? '' : `<p class="note">${escapeHtml(run.note)}</p>`;
  return `<li class="run">
<p class="run-head"><span class="run-day">${escapeHtml(readableDay(run.runOn))}</span><span class="outcome outcome-${run.outcome}">${outcomeWords[run.outcome]}</span><span class="muted">${method}</span>${proof}</p>
${reason}<dl class="pair"><dt>Planted</dt><dd>${escapeHtml(run.planted)}</dd><dt>Expected</dt><dd>${escapeHtml(run.expected)}</dd></dl>
${note}<p class="note">${detail}</p>
</li>`;
}

function runsList(ledger: PublishedLedger, check: PublishedCheck): string {
  if (check.runs.length === 0) {
    return `<h4>Planted defects</h4>
<p class="empty">None yet. Until a defect is planted and caught, this check has not been seen to fail.</p>`;
  }
  return `<h4>Planted defects, newest first</h4>
<ol class="runs">
${check.runs.map((run) => runItem(ledger, run)).join('\n')}
</ol>`;
}

function observationItem(
  ledger: PublishedLedger,
  observation: PublishedObservation,
): string {
  const note =
    observation.note === null
      ? ''
      : `<p class="note">${escapeHtml(observation.note)}</p>`;
  return `<li><span class="run-day">${escapeHtml(readableDay(observation.observedOn))}</span> Seen switched ${observation.armed ? 'on' : 'off'}. <span class="muted">Recorded in ${commitCell(ledger, observation.recordedIn)}.</span>${note}</li>`;
}

/** The last time anyone looked, or a plain statement that nobody has. */
function lastSeen(check: PublishedCheck): string {
  if (check.lastSeenArmedOn === null || check.lastArmed === null) {
    return '<span class="muted">Not yet observed.</span>';
  }
  return `Seen switched ${check.lastArmed ? 'on' : 'off'}, ${escapeHtml(readableDay(check.lastSeenArmedOn))}.`;
}

function observationsList(
  ledger: PublishedLedger,
  check: PublishedCheck,
): string {
  if (check.observations.length === 0) {
    return '';
  }
  return `<h4>Seen switched on or off, newest first</h4>
<ul class="observations">
${check.observations.map((observation) => observationItem(ledger, observation)).join('\n')}
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
function unsettledNotice(check: PublishedCheck): string {
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
      ? 'Nothing has ever settled anything for this check.'
      : `Its status is read from ${escapeHtml(readableDay(check.lastSettledOn))}, the last run that settled anything.`;
  return `<p class="unsettled">The latest run settled nothing: ${escapeHtml(latest.inconclusiveReason)} ${since}</p>`;
}

/**
 * The one fact beside a check's name when it is closed.
 *
 * The runs that settled nothing are named only when there are some, and the
 * misses are there to be read off: caught and the total are both shown, so a
 * reader can see nothing is being held back.
 */
function checkFact(check: PublishedCheck): string {
  if (check.runCount === 0) {
    return 'Never planted';
  }
  const settledNothing =
    check.inconclusiveCount === 0
      ? ''
      : `, ${String(check.inconclusiveCount)} settled nothing`;
  return `Caught ${String(check.caughtCount)} of ${String(check.runCount)}${settledNothing}`;
}

function checkSection(ledger: PublishedLedger, check: PublishedCheck): string {
  return `<details class="check" id="${escapeHtml(check.id)}">
<summary><span class="check-name"><span class="chevron" aria-hidden="true">›</span>${escapeHtml(check.name)}</span><span class="check-state">${statusPill(check.status)}<span class="fact">${escapeHtml(checkFact(check))}</span></span></summary>
<div class="check-body">
${unsettledNotice(check)}
<dl class="facts">
<div><dt>Protects against</dt><dd>${written(check.protects)}</dd></div>
<div><dt>How you can tell it is switched on</dt><dd>${written(check.howToTellArmed)}</dd></div>
<div><dt>Last seen</dt><dd>${lastSeen(check)}</dd></div>
</dl>
${runsList(ledger, check)}
${observationsList(ledger, check)}
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

function areaSection(ledger: PublishedLedger, area: Area): string {
  const total = area.checks.length;
  return `<details class="area">
<summary><span class="area-name"><span class="chevron" aria-hidden="true">›</span><span><span class="area-title">${escapeHtml(area.name)}</span><span class="area-count">${String(area.proven)} of ${String(total)} proven</span></span></span><span class="cells" role="img" aria-label="${escapeHtml(cellsLabel(area.checks))}">${cells(area.checks, 'small')}</span></summary>
<div class="area-body">
${area.checks.map((check) => checkSection(ledger, check)).join('\n')}
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
  outline: 2px solid color-mix(in srgb, var(--primary) 60%, transparent);
  outline-offset: 2px;
  border-radius: 10px;
}
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.muted { color: var(--muted); }
.top { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; padding-bottom: 1rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
.top .name { font-weight: 600; font-size: 1rem; }
.hero { display: flex; flex-direction: column; gap: 1.5rem; padding: 3.5rem 0 3rem; }
.eyebrow { margin: 0; color: var(--muted); font-size: 0.875rem; }
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
.pill-button:hover > .pill { background: color-mix(in srgb, var(--ink) 7%, transparent); }
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
.check-state { display: flex; align-items: center; gap: 0.75rem; padding-left: 1.25rem; font-size: 0.875rem; }
.fact { white-space: nowrap; }
.check-body { margin: 0 0 1rem 2rem; padding: 1.25rem; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); display: flex; flex-direction: column; gap: 1rem; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 1rem 2rem; margin: 0; }
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
 * The whole page, as one string.
 *
 * Returned rather than written, so the build can hold it beside the export,
 * check the two agree, and only then put either of them on disk. A page written
 * first and checked afterwards is a page that has already been published when
 * the check fails.
 */
export function renderPage(ledger: PublishedLedger): string {
  const checkCount = ledger.checks.length;
  const proven = ledger.statusCounts.Proven;
  const ordered = [...ledger.checks].sort(byReadingOrder);
  const repository = repositoryHref(ledger);
  const built = `Built from commit <a href="${escapeHtml(commitHref(ledger, ledger.builtFrom))}"><code>${escapeHtml(shortCommit(ledger.builtFrom))}</code></a>, read as of ${escapeHtml(readableDay(ledger.builtOn))}.`;
  const headline =
    checkCount === 0
      ? 'Nothing has been recorded yet'
      : `<span class="result">${String(proven)} of ${String(checkCount)}</span> ${checkCount === 1 ? 'check has' : 'checks have'} been seen to catch a planted defect`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex">
<title>Seen to Fail: the record of this repository's own checks</title>
<style>
${style}
</style>
</head>
<body>
<div class="page">
<header class="top">
<span class="name">Seen to Fail</span>
<a href="${escapeHtml(repository)}">${escapeHtml(ledger.repository)} ↗</a>
</header>
<section class="hero">
<p class="eyebrow">The record of this repository's own checks</p>
<h1>${headline}</h1>
<div class="strip" role="img" aria-label="${escapeHtml(cellsLabel(ordered))}">${cells(ordered, 'large')}</div>
<div class="pills">
${publishedStatusOrder.map((status) => statusPill(status, ledger.statusCounts[status])).join('\n')}
<span class="hint">Tap a status to see what it means.</span>
</div>
${meanings(ledger)}
<p class="idea">A check earns trust only after someone plants the defect it exists to catch, runs it, and watches it go red.</p>
<div class="go">
<a class="button" href="${escapeHtml(repository)}">View the repository on GitHub ↗</a>
<span class="fresh">${built}</span>
</div>
</section>
<section aria-labelledby="checks">
<div class="list-head">
<h2 id="checks">The ${String(checkCount)} ${checkCount === 1 ? 'check' : 'checks'}, by area</h2>
<span class="hint">Open an area, then a check, to see its proof.</span>
</div>
<div class="areas">
${areas(ledger)
  .map((area) => areaSection(ledger, area))
  .join('\n')}
</div>
</section>
<details class="how">
<summary><span class="chevron" aria-hidden="true">›</span>How this page works</summary>
<div class="how-body">
<p>The checks on this page are recorded in a ledger kept in this repository, and the page is built from it at the commit named below.</p>
<p>To prove a check, a defect it should catch is planted on purpose, the check is run, and the result is recorded as one of three outcomes.</p>
<dl class="pair"><dt>Caught</dt><dd>The check went red.</dd><dt>Missed</dt><dd>The check stayed green.</dd><dt>Settled nothing</dt><dd>The run told us nothing about the check, and the reason is shown as it was written. No status is read from it.</dd></dl>
<p>A run by hand is one somebody planted, watched and recorded. A replay was planted and scored by a job against newer code, so a check keeps being tested after its first proof. A proof older than ${String(ledger.staleAfterDays)} days turns Stale.</p>
<p>Every run is a file in the repository, added by a commit like any other change, so a record that is wrong has an author, a diff and a revert.</p>
<p>This page is read-only: it has no filter bar and no server behind it. The filter works when you run the app locally. The same ledger is published beside this page as <a href="ledger.json"><code>ledger.json</code></a>.</p>
</div>
</details>
<footer>
<div class="foot-line">
<span>${built}</span>
<a href="${escapeHtml(repository)}">${escapeHtml(ledger.repository)} on GitHub ↗</a>
</div>
<a class="studio" href="https://async-digital.com"><span>Made by</span>${studioMark}</a>
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
