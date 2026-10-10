// @vitest-environment node
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'vitest';

/**
 * The script CI runs, judged the way CI judges it: by the code it exits with.
 *
 * Run as a real process rather than imported, because a script that prints a
 * refusal and exits 0 looks the same as a correct one from inside the same
 * process, and exiting 0 on a bundle that grew is the failure that matters.
 */

const script = fileURLToPath(new URL('check-bundle.ts', import.meta.url));

const made: string[] = [];

afterEach(async () => {
  await Promise.all(
    made.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

interface Planted {
  readonly directory: string;
  readonly baseline: string;
}

/** A build of the given sizes and a baseline beside it, in a fresh folder. */
async function plant(
  sizes: { js: number; css: number },
  metrics: { javascriptBytes: number; cssBytes: number; totalBytes: number },
): Promise<Planted> {
  const root = await mkdtemp(join(tmpdir(), 'bundle-check-'));
  made.push(root);
  const directory = join(root, 'dist');
  await mkdir(join(directory, 'assets'), { recursive: true });
  await writeFile(join(directory, 'assets', 'index.js'), 'x'.repeat(sizes.js));
  await writeFile(
    join(directory, 'assets', 'index.css'),
    'x'.repeat(sizes.css),
  );
  const baseline = join(root, 'bundle-baseline.json');
  await writeFile(
    baseline,
    `${JSON.stringify({ tolerancePercent: 1, metrics }, null, 2)}\n`,
  );
  return { directory, baseline };
}

async function exitCodeOf(args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: 'ignore',
      env: { ...process.env, GITHUB_ACTIONS: '' },
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === null) {
        reject(new Error('check-bundle.ts was killed rather than exiting.'));
        return;
      }
      resolve(code);
    });
  });
}

function argsFor({ directory, baseline }: Planted, ...extra: string[]) {
  return ['--directory', directory, '--baseline', baseline, ...extra];
}

const atBaseline = { javascriptBytes: 1000, cssBytes: 100, totalBytes: 1100 };

it('exits 0 on a build that matches its baseline', async () => {
  const planted = await plant({ js: 1000, css: 100 }, atBaseline);

  expect(await exitCodeOf(argsFor(planted))).toBe(0);
});

it('exits 0 on growth inside the tolerance', async () => {
  const planted = await plant({ js: 1010, css: 100 }, atBaseline);

  expect(await exitCodeOf(argsFor(planted))).toBe(0);
});

it('exits 1 when a metric grows past the tolerance', async () => {
  const planted = await plant({ js: 1100, css: 100 }, atBaseline);

  expect(await exitCodeOf(argsFor(planted))).toBe(1);
});

it('exits 2 when there is no build to measure', async () => {
  const planted = await plant({ js: 1000, css: 100 }, atBaseline);
  await rm(planted.directory, { recursive: true });

  expect(await exitCodeOf(argsFor(planted))).toBe(2);
});

it('exits 2 when the baseline cannot be read', async () => {
  const planted = await plant({ js: 1000, css: 100 }, atBaseline);
  await writeFile(planted.baseline, '{ "metrics": {} }');

  expect(await exitCodeOf(argsFor(planted))).toBe(2);
});

it('lowers the baseline on --ratchet when the build shrank', async () => {
  const planted = await plant({ js: 900, css: 100 }, atBaseline);

  expect(await exitCodeOf(argsFor(planted, '--ratchet'))).toBe(0);
  const written = JSON.parse(await readFile(planted.baseline, 'utf8')) as {
    metrics: unknown;
  };
  expect(written.metrics).toEqual({
    javascriptBytes: 900,
    cssBytes: 100,
    totalBytes: 1000,
  });
});

it('leaves the baseline alone on --ratchet when the build grew, and still fails', async () => {
  const planted = await plant({ js: 1100, css: 100 }, atBaseline);
  const before = await readFile(planted.baseline, 'utf8');

  expect(await exitCodeOf(argsFor(planted, '--ratchet'))).toBe(1);
  expect(await readFile(planted.baseline, 'utf8')).toBe(before);
});
