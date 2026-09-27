import { execFile, spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { expect, it } from 'vitest';

import { repositoryRoot } from '../ledger/location.ts';

/**
 * The check CI runs on the published output, judged the way CI judges it: by
 * what it exits with.
 *
 * It is a script rather than lines in the workflow because the replay runs the
 * same check against the plant `canfail.json` declares for it, and two copies
 * of a check are two checks. These tests run that script as a process against
 * a directory of their own, holding a page that says what a real page says
 * about the commit, and take one thing away at a time. Each refusal is asserted
 * on the code and never on the wording, which is the number the workflow reads.
 */

const script = join(repositoryRoot, 'scripts', 'check-published-output.sh');
const run = promisify(execFile);

/** The commit this checkout is at, which is the one the page has to name. */
async function shortHead(): Promise<string> {
  const { stdout } = await run('git', [
    '-C',
    repositoryRoot,
    'rev-parse',
    'HEAD',
  ]);
  return stdout.trim().slice(0, 7);
}

/** What a page that passes looks like, as far as the script reads it. */
function aPageBuiltFrom(commit: string): string {
  return `<!doctype html>\n<html lang="en"><body><p>Built from commit <code>${commit}</code>, read as of 27 September 2026.</p></body></html>\n`;
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

it('passes a page naming the commit, with no script, beside its export, and exits 0', async () => {
  const directory = await anOutputWith({
    'index.html': aPageBuiltFrom(await shortHead()),
    'ledger.json': anExport,
  });

  expect(await exitCodeAgainst(directory)).toBe(0);
});

it('refuses an output with no page, and exits 1', async () => {
  const directory = await anOutputWith({ 'ledger.json': anExport });

  expect(await exitCodeAgainst(directory)).toBe(1);
});

it('refuses an output with no export, and exits 1', async () => {
  const directory = await anOutputWith({
    'index.html': aPageBuiltFrom(await shortHead()),
  });

  expect(await exitCodeAgainst(directory)).toBe(1);
});

it('refuses a page that does not name the commit the checkout is at, and exits 1', async () => {
  const directory = await anOutputWith({
    'index.html': aPageBuiltFrom('0000000'),
    'ledger.json': anExport,
  });

  expect(await exitCodeAgainst(directory)).toBe(1);
});

/**
 * Upper case, so the test is of the case-insensitive read rather than of the
 * exact spelling a plant happens to use. A `<SCRIPT>` tag runs exactly as a
 * `<script>` tag does.
 */
it('refuses a page carrying a script, whatever its case, and exits 1', async () => {
  const directory = await anOutputWith({
    'index.html': `${aPageBuiltFrom(await shortHead())}<SCRIPT></SCRIPT>\n`,
    'ledger.json': anExport,
  });

  expect(await exitCodeAgainst(directory)).toBe(1);
});
