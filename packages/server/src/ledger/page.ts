import type { Status } from '@seen-to-fail/filter';

import { outcomeSettlesSomething } from '../database/rows.ts';
import type { IsoDate, TestRunOutcome } from '../database/rows.ts';
import type {
  PublishedCheck,
  PublishedLedger,
  PublishedObservation,
  PublishedRun,
} from './snapshot.ts';

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
 * never appearing on a tile.
 */
export const publishedStatusOrder: readonly Status[] = [
  'Proven',
  'Broken',
  'Stale',
  'Unproven',
  'Unarmed',
];

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

/** The first seven characters of a commit, as git and GitHub abbreviate it. */
function shortCommit(commit: string): string {
  return commit.slice(0, 7);
}

/** A link to a commit on GitHub. */
function commitLink(ledger: PublishedLedger, commit: string): string {
  const href = `https://github.com/${encodeURI(ledger.repository)}/commit/${encodeURIComponent(commit)}`;
  return `<a href="${escapeHtml(href)}"><code>${escapeHtml(shortCommit(commit))}</code></a>`;
}

/** A link to a commit on GitHub, or a plain statement that there is none. */
function commitCell(ledger: PublishedLedger, commit: string | null): string {
  return commit === null
    ? '<span class="muted">not committed yet</span>'
    : commitLink(ledger, commit);
}

/**
 * Where a run came from, and for a replay the two things a reader needs to go
 * and check it for themselves.
 *
 * The commit named here is not the commit in the column beside it. That one is
 * the commit that added this record, which nothing knew until the record had
 * been committed; this one is the tree the plant was applied to, which the
 * replay knew and wrote down. Both are on the page and each says which it is,
 * because two abbreviated shas in one row are otherwise told apart by position
 * alone.
 *
 * A replay missing either is refused by the reader, by the database and by the
 * check the build runs before it publishes. Reaching here without them means
 * all three have stopped working, so this says so rather than rendering a row
 * that quietly drops the evidence.
 */
function sourceCell(ledger: PublishedLedger, run: PublishedRun): string {
  if (run.source === 'hand') {
    return 'By hand';
  }
  if (run.sourceCommit === null || run.sourceRunUrl === null) {
    throw new Error(
      `The replay recorded in ${run.sourceFile} is published without the ` +
        'commit it ran against or the run that produced it.',
    );
  }
  return `By replay<p class="note">against ${commitLink(ledger, run.sourceCommit)}, <a href="${escapeHtml(run.sourceRunUrl)}">the run</a></p>`;
}

/** A day, or a plain statement that there is none to show. */
function day(value: IsoDate | null): string {
  return value === null
    ? '<span class="muted">never</span>'
    : escapeHtml(value);
}

/** Text a person may not have written down, said either way. */
function written(text: string): string {
  return text === ''
    ? '<span class="muted">Nobody has written this down.</span>'
    : escapeHtml(text);
}

/**
 * What each outcome is called on the page.
 *
 * "settled nothing" rather than "inconclusive", because the word a reader needs
 * is the one that says the run tells them nothing about the check, and every
 * other sentence on the page about this outcome is worded the same way. Keyed
 * by the outcome, so an outcome added and not worded fails to compile rather
 * than printing its own label at a reader.
 */
const outcomeWords = {
  caught: 'caught',
  missed: 'missed',
  inconclusive: 'settled nothing',
} as const satisfies Record<TestRunOutcome, string>;

/**
 * What a run did, and for one that settled nothing the reason as it was
 * written.
 *
 * The reason is shown and not sorted into a category. Only one of the
 * situations that settle nothing means the plant needs rewriting, they are told
 * apart by a scoring tool inside an English sentence, and a category recovered
 * by matching that prose would send a reader to rewrite a plant that is fine.
 * So the sentence is handed over as it arrived and the reader decides.
 */
function outcomeCell(run: PublishedRun): string {
  const badge = `<span class="outcome outcome-${escapeHtml(run.outcome)}">${escapeHtml(outcomeWords[run.outcome])}</span>`;
  return run.inconclusiveReason === null
    ? badge
    : `${badge}<p class="note">${escapeHtml(run.inconclusiveReason)}</p>`;
}

function runRow(ledger: PublishedLedger, run: PublishedRun): string {
  const note =
    run.note === null ? '' : `<p class="note">${escapeHtml(run.note)}</p>`;
  return `<tr>
  <td>${escapeHtml(run.runOn)}</td>
  <td>${outcomeCell(run)}</td>
  <td>${escapeHtml(run.planted)}${note}</td>
  <td>${escapeHtml(run.expected)}</td>
  <td>${sourceCell(ledger, run)}</td>
  <td>${commitCell(ledger, run.recordedIn)}</td>
</tr>`;
}

function observationRow(
  ledger: PublishedLedger,
  observation: PublishedObservation,
): string {
  const note =
    observation.note === null
      ? ''
      : `<p class="note">${escapeHtml(observation.note)}</p>`;
  return `<tr>
  <td>${escapeHtml(observation.observedOn)}</td>
  <td>${observation.armed ? 'on' : 'off'}${note}</td>
  <td>${commitCell(ledger, observation.recordedIn)}</td>
</tr>`;
}

function runsTable(ledger: PublishedLedger, check: PublishedCheck): string {
  if (check.runs.length === 0) {
    return '<p class="muted">No defect has ever been planted for this check.</p>';
  }
  return `<table>
<caption>Planted defects, newest first</caption>
<thead><tr><th scope="col">Run on</th><th scope="col">Outcome</th><th scope="col">Planted</th><th scope="col">Expected</th><th scope="col">Came from</th><th scope="col">Recorded in</th></tr></thead>
<tbody>
${check.runs.map((run) => runRow(ledger, run)).join('\n')}
</tbody>
</table>`;
}

function observationsTable(
  ledger: PublishedLedger,
  check: PublishedCheck,
): string {
  if (check.observations.length === 0) {
    return '<p class="muted">Nobody has recorded whether this check is switched on.</p>';
  }
  return `<table>
<caption>Arming observations, newest first</caption>
<thead><tr><th scope="col">Observed on</th><th scope="col">Switched</th><th scope="col">Recorded in</th></tr></thead>
<tbody>
${check.observations.map((observation) => observationRow(ledger, observation)).join('\n')}
</tbody>
</table>`;
}

/**
 * The counts under a check's name.
 *
 * The runs that settled nothing are named only when there are some. They are
 * safe to leave out at zero because the three counts add up to the run count
 * beside them, so a reader who can see that caught and missed already account
 * for every run can see that nothing is being held back.
 */
function countsLine(check: PublishedCheck): string {
  if (check.runCount === 0) {
    return 'no runs';
  }
  const settledNothing =
    check.inconclusiveCount === 0
      ? ''
      : `, ${String(check.inconclusiveCount)} settled nothing`;
  return (
    `${String(check.runCount)} ${check.runCount === 1 ? 'run' : 'runs'}, ` +
    `${String(check.caughtCount)} caught, ${String(check.missedCount)} missed` +
    settledNothing
  );
}

/**
 * The line that says the latest run told the reader nothing, when it did.
 *
 * It is the whole point of the third outcome being on this page. Without it, a
 * check whose replays have all stopped applying reads with the status its last
 * real run left it, and nothing on the page says that the runs since then were
 * not evidence. The status is not wrong; it is just older than the newest row
 * in the table makes it look, and this says how much older.
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
      : `Its status is read from ${escapeHtml(check.lastSettledOn)}, the last run that settled anything.`;
  return `<p class="unsettled">The latest run settled nothing: ${escapeHtml(latest.inconclusiveReason)} ${since} Read that reason and decide whether the plant needs rewriting.</p>`;
}

function checkSection(ledger: PublishedLedger, check: PublishedCheck): string {
  return `<article class="check" id="${escapeHtml(check.id)}">
<h3>${escapeHtml(check.name)}</h3>
<p class="summary">
  <span class="status status-${escapeHtml(check.status)}">${escapeHtml(check.status)}</span>
  <span class="area">${escapeHtml(check.area)}</span>
  <span class="muted">${escapeHtml(countsLine(check))}</span>
</p>
${unsettledNotice(check)}
<dl>
  <dt>Protects</dt><dd>${written(check.protects)}</dd>
  <dt>How you can tell it is on</dt><dd>${written(check.howToTellArmed)}</dd>
  <dt>Last caught</dt><dd>${day(check.lastCaughtOn)}</dd>
  <dt>Last settled</dt><dd>${day(check.lastSettledOn)}</dd>
  <dt>Last run</dt><dd>${day(check.lastRunOn)}</dd>
</dl>
${runsTable(ledger, check)}
${observationsTable(ledger, check)}
</article>`;
}

function statusTiles(ledger: PublishedLedger): string {
  const tiles = publishedStatusOrder
    .map((status) => {
      const count = ledger.statusCounts[status];
      return `<li class="tile tile-${escapeHtml(status)}"><span class="count">${String(count)}</span><span class="label">${escapeHtml(status)}</span></li>`;
    })
    .join('\n');
  return `<ul class="tiles">\n${tiles}\n</ul>`;
}

/**
 * The palette, the same custom properties the client's tokens file declares.
 *
 * Copied rather than imported, because the client's CSS is bundled by Vite and
 * this page is one file with no build behind it. The two are allowed to drift:
 * this is a published document and that is an application, and neither is the
 * other's source of truth.
 */
const style = `:root {
  --bg: #fdfbf7;
  --surface: #f8f5ee;
  --border: #e8e4dc;
  --ink: #1f1c18;
  --muted: #6b6560;
  --primary: #8b3a2a;
  --success: #3e7a4a;
  --warning: #c48b2c;
  --error: #cc2222;
}
* { box-sizing: border-box; }
body {
  margin: 0 auto;
  padding: 2rem 1rem 4rem;
  max-width: 60rem;
  background: var(--bg);
  color: var(--ink);
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
h1 { margin: 0 0 0.25rem; font-size: 1.75rem; }
h2 { margin: 2.5rem 0 0.75rem; font-size: 1.25rem; }
h3 { margin: 0 0 0.5rem; font-size: 1.05rem; }
a { color: var(--primary); }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
.lead { margin: 0 0 1.5rem; color: var(--muted); }
.tiles { display: flex; flex-wrap: wrap; gap: 0.75rem; list-style: none; margin: 0 0 2rem; padding: 0; }
.tile {
  flex: 1 1 7rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
}
.tile .count { display: block; font-size: 1.5rem; font-weight: 600; }
.tile .label { display: block; color: var(--muted); font-size: 0.85rem; }
.check {
  margin: 0 0 1.5rem;
  padding: 1.25rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
}
.summary { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin: 0 0 1rem; }
.status, .outcome {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--bg);
  font-size: 0.85rem;
  font-weight: 600;
}
.status-Proven, .outcome-caught { color: var(--success); border-color: var(--success); }
.status-Broken, .outcome-missed { color: var(--error); border-color: var(--error); }
.status-Stale { color: var(--warning); border-color: var(--warning); }
/* Amber measures 2.9:1 on this page's ground, which is under the floor for
   text, so this pill takes the colour on its edge and says its word in ink. */
.outcome-inconclusive { color: var(--ink); border-color: var(--warning); }
.status-Unproven, .status-Unarmed { color: var(--muted); }
.area { color: var(--muted); font-size: 0.9rem; }
.muted { color: var(--muted); }
.unsettled {
  margin: 0 0 1rem;
  padding: 0.6rem 0.75rem;
  border-left: 3px solid var(--warning);
  background: var(--bg);
  font-size: 0.9rem;
}
dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0 0 1.25rem; }
dt { color: var(--muted); font-size: 0.85rem; }
dd { margin: 0; }
table { width: 100%; border-collapse: collapse; margin: 0 0 1rem; font-size: 0.9rem; }
caption { text-align: left; color: var(--muted); font-size: 0.8rem; padding-bottom: 0.35rem; }
th, td { text-align: left; vertical-align: top; padding: 0.4rem 0.5rem 0.4rem 0; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 600; font-size: 0.8rem; }
.note { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.85rem; }
footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: 0.9rem; }`;

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
  const runCount = ledger.checks.reduce(
    (total, check) => total + check.runs.length,
    0,
  );
  const commitHref = `https://github.com/${encodeURI(ledger.repository)}/commit/${encodeURIComponent(ledger.builtFrom)}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Seen to Fail: the ledger</title>
<style>
${style}
</style>
</head>
<body>
<header>
<h1>Seen to Fail</h1>
<p class="lead">Whether each of these checks has ever been seen to catch the defect it exists for. A status is read from the record below it, never from anyone's opinion of the check.</p>
</header>
${statusTiles(ledger)}
<h2>Checks</h2>
${
  checkCount === 0
    ? '<p class="muted">Nothing has been recorded yet.</p>'
    : ledger.checks.map((check) => checkSection(ledger, check)).join('\n')
}
<footer>
<p>Built from commit <a href="${escapeHtml(commitHref)}"><code>${escapeHtml(shortCommit(ledger.builtFrom))}</code></a>, read as of ${escapeHtml(ledger.builtOn)}, with a catch counted stale after ${String(ledger.staleAfterDays)} days. ${String(checkCount)} ${checkCount === 1 ? 'check' : 'checks'}, ${String(runCount)} recorded ${runCount === 1 ? 'run' : 'runs'}.</p>
<p>Every run above is a file in the repository, and the commit under "Recorded in" is the commit that added that file. A run gets there by being committed, so a record that is wrong has an author, a diff and a revert.</p>
<p>A run that <strong>settled nothing</strong> is neither a catch nor a miss, and no status rule reads one. The plant may no longer apply to code that has moved on, the check may have been red before anything was planted, or it may never have run at all. Each of those calls for something different, so the reason is shown as whoever recorded it wrote it rather than sorted into a category here. "Last settled" is the day of the newest run that did settle something, which is the day the status above it was read from.</p>
<p>"Came from" is a different fact, and it is the one that says whether a proof keeps itself. A run by hand is one somebody planted, watched and typed in. A run by replay was planted and scored by a job, and names the commit it ran against, which is the state of the code it was applied to rather than the commit that recorded it afterwards.</p>
<p>This page is the record and nothing else: it is read-only, it has no filter bar, and there is no server behind it. The filter language, which compiles a filter to SQL, needs a database to compile against, so it is what you get when you run the app locally rather than something this page can offer.</p>
<p>The same ledger is published beside this page as <a href="ledger.json"><code>ledger.json</code></a>.</p>
</footer>
</body>
</html>
`;
}

/** The export, as the file written beside the page. */
export function renderExport(ledger: PublishedLedger): string {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}
