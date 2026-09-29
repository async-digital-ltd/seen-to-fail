import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

import { repositoryRoot } from '../ledger/location.ts';
import { renderPage } from '../ledger/page.ts';
import { fixtureSnapshot } from '../testing/ledger.ts';

/**
 * The check CI runs on the published output, judged the way CI judges it: by
 * what it exits with.
 *
 * It is a script rather than lines in the workflow because the replay runs the
 * same check against the plants `canfail.json` declares for it, and two copies
 * of a check are two checks. These tests run that script as a process against
 * a directory of their own, holding a page drawn by the page's own renderer,
 * and change one thing at a time. Each refusal is asserted on the code and
 * never on the wording, which is the number the workflow reads.
 *
 * The page is drawn rather than typed here so that what the script reads is the
 * markup a real page carries. A change to how the page states the commit it was
 * built from then fails here, in the pull request that makes it, rather than
 * on the first published page after it.
 */

const script = join(repositoryRoot, 'scripts', 'check-published-output.sh');
const run = promisify(execFile);

/** The commit this checkout is at, which is the one the page has to name. */
async function head(): Promise<string> {
  const { stdout } = await run('git', [
    '-C',
    repositoryRoot,
    'rev-parse',
    'HEAD',
  ]);
  return stdout.trim();
}

/** A commit that is not the checkout's, for a page to name in its place. */
const anotherCommit = '0123456789abcdef0123456789abcdef01234567';

/**
 * The fixture ledger's page, built from one commit, with every run on it
 * recorded in another. A run recorded in the checkout's own commit is the
 * normal state of a page built at a commit that added a run, and it puts that
 * commit on the page in the run's row whatever the "Built from" line says.
 */
function aPage(builtFrom: string, recordedIn: string): string {
  const ledger = fixtureSnapshot();
  return renderPage({
    ...ledger,
    builtFrom,
    checks: ledger.checks.map((check) => ({
      ...check,
      runs: check.runs.map((entry) => ({ ...entry, recordedIn })),
    })),
  });
}

/**
 * The part of a "Built from" line that names the commit, as the renderer
 * writes it: a link to the commit on GitHub, around its first seven
 * characters. The two are passed apart so a test can make them disagree.
 */
function stamp(linked: string, shown: string): string {
  return `Built from commit <a href="https://github.com/async-digital-ltd/seen-to-fail/commit/${linked}"><code>${shown.slice(0, 7)}</code></a>`;
}

/**
 * The page with every occurrence of one piece of text replaced. It throws when
 * there is nothing to replace, so a plant that no longer matches the page
 * fails as a plant rather than handing the script the page unchanged.
 */
function swapped(page: string, from: string, to: string): string {
  if (!page.includes(from)) {
    throw new Error(`The page does not hold the text to replace: ${from}`);
  }
  return page.replaceAll(from, to);
}

const anExport = '{\n  "checks": []\n}\n';

/** A directory holding exactly these files, under the system's temporary one. */
async function anOutputWith(
  files: Readonly<Record<string, string>>,
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'seen-to-fail-output-'));
  for (const [file, contents] of Object.entries(files)) {
    await writeFile(join(directory, file), contents, 'utf8');
  }
  return directory;
}

/**
 * Runs the script against a directory and answers with the code it exited on.
 *
 * From the repository root, because the script reads the commit from the
 * checkout it sits in and that is what the page is held to.
 */
async function exitCodeAgainst(directory: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [script, directory], {
      cwd: repositoryRoot,
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === null) {
        reject(new Error('The script was killed rather than exiting.'));
        return;
      }
      resolve(code);
    });
  });
}

/** The code the script exits on for a page beside a sound export. */
async function exitCodeFor(page: string): Promise<number> {
  return exitCodeAgainst(
    await anOutputWith({ 'index.html': page, 'ledger.json': anExport }),
  );
}

it('passes a page built from the commit, with no script, beside its export, and exits 0', async () => {
  const commit = await head();

  expect(await exitCodeFor(aPage(commit, commit))).toBe(0);
});

it('refuses an output with no page, and exits 1', async () => {
  const directory = await anOutputWith({ 'ledger.json': anExport });

  expect(await exitCodeAgainst(directory)).toBe(1);
});

it('refuses an output with no export, and exits 1', async () => {
  const commit = await head();
  const directory = await anOutputWith({
    'index.html': aPage(commit, commit),
  });

  expect(await exitCodeAgainst(directory)).toBe(1);
});

it('refuses a page built from another commit, with no run recorded in the checkout’s, and exits 1', async () => {
  expect(await exitCodeFor(aPage(anotherCommit, anotherCommit))).toBe(1);
});

/**
 * The defect #141 records. The step used to look for the commit anywhere on
 * the page, and a run row recorded in the checkout's own commit named it,
 * so a "Built from" line naming any other commit went through.
 */
it('refuses a "Built from" line naming another commit while a run row names the checkout’s, and passes it once the line is corrected', async () => {
  const commit = await head();
  const planted = aPage(anotherCommit, commit);
  expect(planted).toContain(`/commit/${commit}"`);

  expect(await exitCodeFor(planted)).toBe(1);

  const corrected = swapped(
    planted,
    stamp(anotherCommit, anotherCommit),
    stamp(commit, commit),
  );
  expect(await exitCodeFor(corrected)).toBe(0);
});

/**
 * The defect #170 records. A recorded catch of the plant that names the wrong
 * commit shows that plant's description on the page, and the description
 * speaks of "Built from" lines. The step used to read the words anywhere, so
 * the page that proved the plant was caught was refused, and the replay that
 * recorded it could never merge.
 *
 * The description is read from `canfail.json` rather than typed here, so a
 * rewording of the plant is tested as it is.
 */
it('passes a page whose run rows quote the wrong-commit plant’s description, and exits 0', async () => {
  const declared = JSON.parse(
    await readFile(join(repositoryRoot, 'canfail.json'), 'utf8'),
  ) as { checks: { breaks?: { name: string }[] }[] };
  const quoting = declared.checks
    .flatMap((check) => check.breaks ?? [])
    .map((entry) => entry.name)
    .filter((name) => name.includes('Built from'));
  expect(quoting.length).toBeGreaterThan(0);

  const commit = await head();
  const ledger = fixtureSnapshot();
  const page = renderPage({
    ...ledger,
    builtFrom: commit,
    checks: ledger.checks.map((check) => ({
      ...check,
      runs: check.runs.map((entry) => ({
        ...entry,
        recordedIn: commit,
        planted: quoting[0] ?? '',
      })),
    })),
  });
  expect(page).toContain('&quot;Built from&quot;');

  expect(await exitCodeFor(page)).toBe(0);
});

it('refuses a page with no "Built from" line while a run row names the checkout’s commit, and exits 1', async () => {
  const commit = await head();
  const page = swapped(aPage(commit, commit), stamp(commit, commit), '');
  expect(page).toContain(`/commit/${commit}"`);

  expect(await exitCodeFor(page)).toBe(1);
});

/**
 * The page states it twice, under the headline and in the footer. Each is a
 * claim a reader can see, so each is held to the commit, not only the first.
 */
it('refuses a page whose second "Built from" line names another commit, and exits 1', async () => {
  const commit = await head();
  const page = aPage(commit, commit);
  const right = stamp(commit, commit);
  const last = page.lastIndexOf(right);
  expect(last).toBeGreaterThan(page.indexOf(right));
  const planted =
    page.slice(0, last) +
    stamp(anotherCommit, anotherCommit) +
    page.slice(last + right.length);

  expect(await exitCodeFor(planted)).toBe(1);
});

it('refuses a "Built from" line linking the checkout’s commit while it shows another, and exits 1', async () => {
  const commit = await head();
  const page = swapped(
    aPage(commit, commit),
    stamp(commit, commit),
    stamp(commit, anotherCommit),
  );

  expect(await exitCodeFor(page)).toBe(1);
});

it('refuses a "Built from" line showing the checkout’s commit while it links another, and exits 1', async () => {
  const commit = await head();
  const page = swapped(
    aPage(commit, commit),
    stamp(commit, commit),
    stamp(anotherCommit, commit),
  );

  expect(await exitCodeFor(page)).toBe(1);
});

/**
 * Upper case, so the test is of the case-insensitive read rather than of the
 * exact spelling a plant happens to use. A `<SCRIPT>` tag runs exactly as a
 * `<script>` tag does.
 */
it('refuses a page carrying a script, whatever its case, and exits 1', async () => {
  const commit = await head();

  expect(await exitCodeFor(`${aPage(commit, commit)}<SCRIPT></SCRIPT>\n`)).toBe(
    1,
  );
});
