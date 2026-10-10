// pnpm readme
//
// Rewrites the blocks in docs/tests.md, the README's Tests section, that are
// written from the tree rather than by hand: the commands a contributor runs
// and CI's steps, both from .github/workflows/ci.yml, and the list of
// packages, from packages/ and each package's own description. Nothing outside
// those blocks is touched.
//
// A test in packages/server/src/readme fails while any block differs from what
// this would write, so this is the fix for that failure, in the way
// `pnpm codegen` is the fix for `pnpm codegen:check`.

import { readFileSync, writeFileSync } from 'node:fs';

import {
  generatedBlocks,
  generatedFile,
  generatedPath,
  rewriteReadme,
} from '../readme/generated.ts';

const before = readFileSync(generatedFile, 'utf8');
const after = rewriteReadme(before, generatedBlocks());

if (after === before) {
  console.log(
    `${generatedPath} is already what its sources write. Nothing changed.`,
  );
} else {
  writeFileSync(generatedFile, after, 'utf8');
  console.log(`${generatedPath} rewritten from its sources.`);
}
