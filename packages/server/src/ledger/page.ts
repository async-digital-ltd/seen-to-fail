import type { Status } from '@seen-to-fail/filter';

import type { IsoDate } from '../database/rows.ts';
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

/** A link to a commit on GitHub, or a plain statement that there is none. */
function commitCell(ledger: PublishedLedger, commit: string | null): string {
  if (commit === null) {
    return '<span class="muted">not committed yet</span>';
  }
  const href = `https://github.com/${encodeURI(ledger.repository)}/commit/${encodeURIComponent(commit)}`;
  return `<a href="${escapeHtml(href)}"><code>${escapeHtml(shortCommit(commit))}</code></a>`;
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

function runRow(ledger: PublishedLedger, run: PublishedRun): string {
  const note =
    run.note === null ? '' : `<p class="note">${escapeHtml(run.note)}</p>`;
  return `<tr>
  <td>${escapeHtml(run.runOn)}</td>
  <td><span class="outcome outcome-${escapeHtml(run.outcome)}">${escapeHtml(run.outcome)}</span></td>
  <td>${escapeHtml(run.planted)}${note}</td>
  <td>${escapeHtml(run.expected)}</td>
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
<thead><tr><th scope="col">Run on</th><th scope="col">Outcome</th><th scope="col">Planted</th><th scope="col">Expected</th><th scope="col">Recorded in</th></tr></thead>
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

function checkSection(ledger: PublishedLedger, check: PublishedCheck): string {
  const counts =
    check.runCount === 0
      ? 'no runs'
      : `${String(check.runCount)} ${check.runCount === 1 ? 'run' : 'runs'}, ` +
        `${String(check.caughtCount)} caught, ${String(check.missedCount)} missed`;

  return `<article class="check" id="${escapeHtml(check.id)}">
<h3>${escapeHtml(check.name)}</h3>
<p class="summary">
  <span class="status status-${escapeHtml(check.status)}">${escapeHtml(check.status)}</span>
  <span class="area">${escapeHtml(check.area)}</span>
  <span class="muted">${escapeHtml(counts)}</span>
</p>
<dl>
  <dt>Protects</dt><dd>${written(check.protects)}</dd>
  <dt>How you can tell it is on</dt><dd>${written(check.howToTellArmed)}</dd>
  <dt>Last caught</dt><dd>${day(check.lastCaughtOn)}</dd>
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
.status-Unproven, .status-Unarmed { color: var(--muted); }
.area { color: var(--muted); font-size: 0.9rem; }
.muted { color: var(--muted); }
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
<p>Every run above is a file in the repository, and the commit beside it is the commit that added that file. A run gets there by being committed, so a record that is wrong has an author, a diff and a revert.</p>
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
