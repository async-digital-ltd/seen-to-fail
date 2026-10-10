import { readdir, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';

import type { Measurements } from './ratchet.ts';

/**
 * What a production build wrote, in bytes: the JavaScript, the CSS, and every
 * file in the directory together.
 *
 * The total is there for what the other two would miss. A font, an image or a
 * second HTML file added to the build is neither script nor stylesheet, and
 * it is still something a reader downloads.
 *
 * Every file under the directory is read, at any depth, so a chunk split into
 * a folder of its own is counted as surely as one at the top. A directory with
 * nothing in it is refused rather than measured as zero: a build that wrote
 * nothing would otherwise pass every limit and read as the best result yet.
 */
export async function measureBundle(directory: string): Promise<Measurements> {
  const files = await listFiles(directory);
  if (files.length === 0) {
    throw new Error(`${directory} holds no files. Build the client first.`);
  }
  let javascriptBytes = 0;
  let cssBytes = 0;
  let totalBytes = 0;
  for (const file of files) {
    const { size } = await stat(file);
    totalBytes += size;
    const extension = extname(file).toLowerCase();
    if (extension === '.js' || extension === '.mjs') {
      javascriptBytes += size;
    } else if (extension === '.css') {
      cssBytes += size;
    }
  }
  return { javascriptBytes, cssBytes, totalBytes };
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}
