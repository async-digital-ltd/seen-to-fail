// pnpm readme
//
// Rewrites the blocks of the documentation that are written from the tree
// rather than by hand. In docs/tests.md, the README's Tests section: the
// commands a contributor runs and CI's steps, both from
// .github/workflows/ci.yml, and the list of packages, from packages/ and each
// package's own description. Nothing outside those blocks is touched.
//
// A test in packages/server/src/readme fails while any block differs from what
// this would write, so this is the fix for that failure, in the way
// `pnpm codegen` is the fix for `pnpm codegen:check`. A replay or a recorded
// run moves none of these blocks; the counts a replay moves are printed by
// `pnpm ledger:counts` instead of being committed (#270).

import { readFileSync, writeFileSync } from 'node:fs';

import { fileAt, generatedFiles, rewriteReadme } from '../readme/generated.ts';

for (const { path, blocks } of generatedFiles()) {
  const file = fileAt(path);
  const before = readFileSync(file, 'utf8');
  const after = rewriteReadme(before, blocks(), path);

  if (after === before) {
    console.log(`${path} is already what its sources write. Nothing changed.`);
  } else {
    writeFileSync(file, after, 'utf8');
    console.log(`${path} rewritten from its sources.`);
  }
}
