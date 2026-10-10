// pnpm bundle:check [-- --directory <path> --baseline <path>]
// pnpm bundle:ratchet
//
// Measures the client's production build and holds it to the baseline in
// packages/web/bundle-baseline.json. Run `pnpm build:web` first: this reads
// what the build wrote and builds nothing itself.
//
// It exits 0 when every metric is inside its limit, 1 when any grew past it,
// and 2 when it could not measure at all: no build, an empty one, or a
// baseline it cannot read. The 2 is kept apart from the 1 so that a missing
// build never reads as a regression somebody should hunt for, and never as a
// pass either.
//
// With --ratchet it also rewrites the baseline, lowering each metric that
// measured smaller and leaving the rest. It cannot raise one. A change that
// needs the bundle to grow edits the baseline by hand, so the new number and
// the reason for it arrive in the same reviewed diff.
//
// --directory and --baseline point it at a build and a baseline other than
// the client's own, which is how the tests run it over planted builds without
// touching either.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { measureBundle } from '../bundle/measure.ts';
import {
  compare,
  describe,
  formatBaseline,
  parseBaseline,
  ratchet,
} from '../bundle/ratchet.ts';
import type { Baseline, Measurements } from '../bundle/ratchet.ts';

const packageRoot = fileURLToPath(new URL('../../', import.meta.url));

// pnpm passes the `--` that separates its own flags from the script's along
// as an argument, and parseArgs would read everything after it as positional.
const argv = process.argv.slice(2);
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    directory: { type: 'string' },
    baseline: { type: 'string' },
    ratchet: { type: 'boolean', default: false },
  },
});

const directory = values.directory ?? `${packageRoot}dist`;
const baselinePath = values.baseline ?? `${packageRoot}bundle-baseline.json`;
const annotate = process.env.GITHUB_ACTIONS === 'true';

let baseline: Baseline;
let measured: Measurements;
try {
  baseline = parseBaseline(await readFile(baselinePath, 'utf8'));
  measured = await measureBundle(directory);
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.error(`The bundle could not be measured: ${reason}`);
  process.exit(2);
}

const comparisons = compare(baseline, measured);
console.log(describe(comparisons));

const grew = comparisons.filter(({ verdict }) => verdict === 'grew');
const shrank = comparisons.filter(({ verdict }) => verdict === 'shrank');

if (values.ratchet && shrank.length > 0) {
  await writeFile(
    baselinePath,
    formatBaseline(ratchet(baseline, measured)),
    'utf8',
  );
  console.log(
    `\nLowered ${shrank.map(({ metric }) => metric).join(', ')} in ${baselinePath}. Commit it.`,
  );
} else if (shrank.length > 0) {
  const message =
    'The bundle is smaller than its baseline. Run `pnpm build:web && pnpm bundle:ratchet` and commit packages/web/bundle-baseline.json, so the room this change made cannot be quietly spent by the next one.';
  console.log(`\n${message}`);
  if (annotate) {
    console.log(`::notice title=Bundle baseline can come down::${message}`);
  }
}

if (grew.length > 0) {
  const message = `${grew.map(({ metric }) => metric).join(', ')} grew past the tolerance of ${String(baseline.tolerancePercent)}% over the baseline. Make it smaller, or, if the growth is wanted, raise the number in packages/web/bundle-baseline.json by hand in this change and say why in the commit.`;
  console.error(`\n${message}`);
  if (annotate) {
    console.log(`::error title=Bundle grew past its baseline::${message}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nThe bundle is inside its baseline.');
}
