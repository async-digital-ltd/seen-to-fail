// pnpm readme
//
// Rewrites the blocks in README.md that are written from the tree rather than
// by hand: the commands a contributor runs and CI's steps, both from
// .github/workflows/ci.yml, and the list of packages, from packages/ and each
// package's own description. Nothing outside those blocks is touched.
//
// A test in packages/server/src/readme fails while any block differs from what
// this would write, so this is the fix for that failure, in the way
// `pnpm codegen` is the fix for `pnpm codegen:check`.

import { readFileSync, writeFileSync } from 'node:fs';

import { generatedBlocks, rewriteReadme } from '../readme/generated.ts';
import { readmeFile } from '../readme/readme.ts';

const before = readFileSync(readmeFile, 'utf8');
const after = rewriteReadme(before, generatedBlocks());

if (after === before) {
  console.log('README.md is already what its sources write. Nothing changed.');
} else {
  writeFileSync(readmeFile, after, 'utf8');
  console.log('README.md rewritten from its sources.');
}
