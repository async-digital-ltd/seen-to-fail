// pnpm ledger:validate [-- --directory <path>]
//
// Reads every file in the ledger and refuses the lot if any of them is wrong.
// It touches no database and needs no configuration, so it is the step a
// workflow can run before it commits anything.
//
// It exits 1 when the ledger is refused and 0 when it is sound. That is the
// part a workflow reads, and the part the tests assert on: a message can be
// reworded, and a step that goes green on a reworded message was never checking
// anything.
//
// --directory points it at a ledger other than this repository's own, which is
// how the tests run it over a planted record without touching the real one.

import { parseArgs } from 'node:util';

import { describeIssues, loadLedger } from '../ledger/load.ts';
import { ledgerDirectory, ledgerPath } from '../ledger/location.ts';
import { forwardedArguments } from './arguments.ts';

const { values } = parseArgs({
  args: forwardedArguments(),
  options: {
    directory: { type: 'string' },
  },
});

const directory = values.directory ?? ledgerDirectory;
const named = values.directory ?? ledgerPath;

const result = await loadLedger({ directory });

if (!result.ok) {
  console.error(describeIssues(result.issues));
  console.error(
    `\n${named}: ${String(result.issues.length)} ${result.issues.length === 1 ? 'problem' : 'problems'}. Nothing was recorded.`,
  );
  process.exitCode = 1;
} else {
  const { checks, runs, observations } = result.contents;
  console.log(
    `${named} is sound: ${String(checks.length)} checks, ` +
      `${String(runs.length)} runs, ` +
      `${String(observations.length)} arming observations.`,
  );
}
