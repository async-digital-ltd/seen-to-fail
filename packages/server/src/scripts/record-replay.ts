// node packages/server/src/scripts/record-replay.ts \
//   --report <the JSON canfail printed> --config <canfail.json> \
//   --source-commit <the forty-character commit it ran against> \
//   --source-run-url https://github.com/<owner>/<repo>/actions/runs/<id>
//
// The adapter's entry point: reads a replay tool's report and writes one run
// into the ledger per declared break, through the same recorder a person's run
// goes through. It is the replay half of `pnpm ledger:record`, and everything
// it writes carries `source: replay` with the commit and the run link that
// makes a replay checkable.
//
// It exits 1 and writes nothing when the report means something this mapping
// does not recognise, or when its breaks are not the breaks the declaration
// holds for the checks it names (#128). That ordering is the point rather than
// a detail: every refusal this adapter owns is decided over the whole report
// before the first file is written, so a verdict nobody has heard of, or an
// outcome for a plant nobody declared, leaves the ledger exactly as it was. A refusal from the recorder itself stops the script too, and the
// workflow's commit step never runs, which is the same gate `record-run.yml`
// relies on: a record that is refused never becomes a commit.
//
// Nothing here reads what canfail exited with. That number cannot carry the
// per-break verdicts and is not in the report at all: `blind` and
// `wrong-failure` both exit 1, `catches` and `look` both exit 0, so the two
// halves this story exists to observe are indistinguishable by it. Ruled on
// #66 and measured again on this branch.

import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

import {
  parseCanfailReport,
  parsePlantedChecks,
  runsFromReport,
} from '@seen-to-fail/replay';
import type { ReplayOutcome, ReplayRun } from '@seen-to-fail/replay';

import type { TestRunOutcome } from '../database/rows.ts';
import { todayInUtc } from '../day.ts';
import { ledgerDirectory } from '../ledger/location.ts';
import { recordRun } from '../ledger/record.ts';
import { forwardedArguments } from './arguments.ts';

const { values } = parseArgs({
  args: forwardedArguments(),
  options: {
    report: { type: 'string' },
    config: { type: 'string' },
    'source-commit': { type: 'string' },
    'source-run-url': { type: 'string' },
    // A ledger other than this repository's own, which is how the tests run
    // this over a temporary one without touching the real record.
    directory: { type: 'string' },
  },
});

/**
 * Where the adapter's vocabulary and the ledger's meet.
 *
 * The replay package declares its own three outcomes because it must not
 * depend on the server, and two declarations of one vocabulary are two things
 * that can drift. This function is the join: if either side ever widens, it
 * stops compiling, and it stops compiling under `pnpm typecheck`, which is the
 * check this whole story plants defects against.
 *
 * A function rather than an unused type assertion, because the recorder takes
 * its input as `unknown` and would accept a widened outcome silently. This is
 * on the path every record travels, so it cannot be skipped.
 */
function ledgerOutcome(outcome: ReplayOutcome): TestRunOutcome {
  return outcome;
}

/** A run as the recorder takes it, with the outcome carried across. */
function asLedgerInput(run: ReplayRun): Record<string, unknown> {
  return { ...run, outcome: ledgerOutcome(run.outcome) };
}

function refuse(problems: readonly string[]): never {
  for (const problem of problems) {
    console.error(problem);
  }
  console.error('\nNothing was recorded.');
  process.exit(1);
}

function required(value: string | undefined, flag: string): string {
  if (value === undefined) {
    refuse([`${flag} is required.`]);
  }
  return value;
}

/** A JSON document, or a refusal naming the file that was not one. */
async function readJson(path: string, flag: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause);
    return refuse([`${flag} could not be read: ${why}`]);
  }
  try {
    return JSON.parse(text);
  } catch (cause) {
    const why = cause instanceof Error ? cause.message : String(cause);
    return refuse([`${flag} is not JSON: ${why}`]);
  }
}

const reportPath = required(values.report, '--report');
const configPath = required(values.config, '--config');
const sourceCommit = required(values['source-commit'], '--source-commit');
const sourceRunUrl = required(values['source-run-url'], '--source-run-url');

const report = parseCanfailReport(await readJson(reportPath, '--report'));
if (!report.ok) {
  refuse(report.problems);
}

const checks = parsePlantedChecks(await readJson(configPath, '--config'));
if (!checks.ok) {
  refuse(checks.problems);
}

// In UTC, the same reading of today the recorder judges the run against. A day
// taken from the runner's own zone could date a run after the recorder's today
// and be refused for being in the future (#40), on the runners that sit east of
// it and for part of each day only.
const runs = runsFromReport({
  report: report.value,
  checks: checks.value,
  provenance: { runOn: todayInUtc(), sourceCommit, sourceRunUrl },
});
if (!runs.ok) {
  refuse(runs.problems);
}

const directory = values.directory ?? ledgerDirectory;
let created = 0;
let alreadyThere = 0;

for (const run of runs.value) {
  const result = await recordRun({ directory, input: asLedgerInput(run) });
  if (!result.ok) {
    refuse(result.errors.map((issue) => `${issue.path}: ${issue.message}`));
  }
  if (result.created) {
    created += 1;
    console.log(`Recorded ${result.file}.`);
  } else {
    alreadyThere += 1;
    console.log(`${result.file} already records this run. Nothing changed.`);
  }
}

console.log(
  `\n${String(runs.value.length)} outcome(s): ${String(created)} recorded, ${String(alreadyThere)} already there.`,
);
