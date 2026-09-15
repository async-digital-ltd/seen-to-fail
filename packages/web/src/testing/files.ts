import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every file under a directory, at any depth, as paths joined onto it. */
export function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}
