// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { measureBundle } from './measure.ts';

const made: string[] = [];

afterEach(async () => {
  await Promise.all(
    made.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function build(files: Record<string, number>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'bundle-measure-'));
  made.push(directory);
  for (const [name, size] of Object.entries(files)) {
    const path = join(directory, name);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, 'x'.repeat(size));
  }
  return directory;
}

it('sums scripts, stylesheets and everything together, at any depth', async () => {
  const directory = await build({
    'index.html': 10,
    'assets/index.js': 100,
    'assets/chunks/route.mjs': 50,
    'assets/index.css': 20,
    'assets/fonts/body.woff2': 7,
  });

  expect(await measureBundle(directory)).toEqual({
    javascriptBytes: 150,
    cssBytes: 20,
    totalBytes: 187,
  });
});

it('refuses an empty build rather than measuring it as zero', async () => {
  const directory = await build({});

  await expect(measureBundle(directory)).rejects.toThrow('holds no files');
});

it('refuses a build that is not there', async () => {
  await expect(
    measureBundle(join(tmpdir(), 'no-such-bundle-directory')),
  ).rejects.toThrow();
});
