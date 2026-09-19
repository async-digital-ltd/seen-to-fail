// pnpm ledger:record -- --check-id ci-lint --run-on 2026-09-18 \
//   --planted "..." --expected "..." --outcome caught --source hand \
//   [--note "..."]
//
// A replay says where it came from and brings its evidence with it:
//
// pnpm ledger:record -- ... --source replay \
//   --source-commit <the forty-character commit it ran against> \
//   --source-run-url https://github.com/<owner>/<repo>/actions/runs/<id>
//
// A run that settled nothing says why, in the words the replay reported:
//
// pnpm ledger:record -- ... --outcome inconclusive \
//   --inconclusive-reason "the anchor matches 0 times and must match once"
//
// Writes one run into the ledger, or refuses it and writes nothing. This is the
// step the recording workflow runs before it commits, which is what "refuses a
// malformed record before it lands" means: a record that is wrong never becomes
// a file, so it never becomes a commit.
//
// It exits 1 on a refusal and 0 on a record written, and says which file it
// wrote. A run that was already recorded, byte for byte, is reported as already
// there rather than written again, so a job that retries records one run.

import { parseArgs } from 'node:util';

import { ledgerDirectory } from '../ledger/location.ts';
import { recordRun } from '../ledger/record.ts';
import { forwardedArguments } from './arguments.ts';

const { values } = parseArgs({
  args: forwardedArguments(),
  options: {
    'check-id': { type: 'string' },
    'run-on': { type: 'string' },
    planted: { type: 'string' },
    expected: { type: 'string' },
    outcome: { type: 'string' },
    'inconclusive-reason': { type: 'string' },
    note: { type: 'string' },
    source: { type: 'string' },
    'source-commit': { type: 'string' },
    'source-run-url': { type: 'string' },
    // A ledger other than this repository's own, which is how the tests run
    // this over a temporary one without touching the real record.
    directory: { type: 'string' },
  },
});

/**
 * The arguments are handed over as they arrived, with nothing filled in and
 * nothing coerced.
 *
 * An absent argument stays absent rather than becoming an empty string, so the
 * reader in records.ts says "a run needs an outcome" rather than "caught or
 * missed, and got ''". The one field with a default is the note, because a run
 * with nothing written about it is the ordinary case.
 *
 * `--source` is passed on absent as well, rather than being filled in here as
 * hand. The default belongs to the reader, where it is there to keep the
 * records written before sources existed valid, and a second copy of it in the
 * writer would be a place for the two to drift.
 */
const result = await recordRun({
  directory: values.directory ?? ledgerDirectory,
  input: {
    checkId: values['check-id'],
    runOn: values['run-on'],
    planted: values.planted,
    expected: values.expected,
    outcome: values.outcome,
    // Passed on absent, like the source, so the reader decides whether this
    // run needed one. A default here would be a second reading of the rule
    // that says which runs have a reason to give.
    inconclusiveReason: values['inconclusive-reason'] ?? null,
    note: values.note ?? null,
    source: values.source,
    sourceCommit: values['source-commit'] ?? null,
    sourceRunUrl: values['source-run-url'] ?? null,
  },
});

if (!result.ok) {
  for (const issue of result.errors) {
    console.error(`${issue.path}: ${issue.message}`);
  }
  console.error('\nNothing was recorded.');
  process.exitCode = 1;
} else if (result.created) {
  console.log(`Recorded ${result.file}.`);
} else {
  console.log(`${result.file} already records this run. Nothing changed.`);
}
