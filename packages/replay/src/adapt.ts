import { repeated } from './plants.ts';
import type { PlantedChecks } from './plants.ts';
import { canfailVerdicts } from './report.ts';
import type { CanfailReport, CanfailVerdict, ReplayResult } from './report.ts';

/**
 * Turning what a replay tool said into runs this ledger can record.
 *
 * The whole of the judgment in this package sits in the table below, and the
 * table is #66's, copied rather than reasoned about. Every rule here exists so
 * that a verdict is never invented: an outcome this mapping does not recognise
 * stops the lot, and nothing at all is written.
 */

/**
 * What a run says it found, spelled the way the ledger spells it.
 *
 * Declared here rather than imported, because this package must not depend on
 * the server: the server depends on this one, exactly as it depends on the
 * filter package. The two spellings meet in one place, record-replay.ts, where
 * a typed function holds them together, so a widening on either side is a type
 * error rather than a record the recorder refuses at run time.
 */
export type ReplayOutcome = 'caught' | 'missed' | 'inconclusive';

/**
 * What the ledger records for each verdict, pinned on #66 and on nothing else.
 *
 * Read the two columns separately. The outcome is what the run says about the
 * check. The reason says where `inconclusiveReason` comes from, and `detail`
 * means canfail's own words, copied exactly as they arrived.
 *
 * Verbatim rather than a phrase of ours, for the reason the ledger's README
 * gives: `look` is four situations wearing one name, told apart only inside an
 * English sentence, and only one of them means the plant needs rewriting. A
 * category recovered by matching that prose would send a reader to rewrite a
 * plant that is fine. #66's table writes a fixed phrase against
 * `wrong-failure`, and canfail's own detail for that verdict says the same
 * thing and then names the pattern that was looked for and the line that came
 * back instead, so copying it keeps the evidence the phrase would discard.
 *
 * `satisfies` rather than a type annotation, so the table keeps its literal
 * types AND a missing verdict is a compile error. That is what makes this the
 * whole vocabulary rather than most of it.
 */
const pinnedVerdicts = {
  catches: { outcome: 'caught', reason: 'none' },
  blind: { outcome: 'missed', reason: 'none' },
  'wrong-failure': { outcome: 'inconclusive', reason: 'detail' },
  look: { outcome: 'inconclusive', reason: 'detail' },
} as const satisfies Record<
  CanfailVerdict,
  { outcome: ReplayOutcome; reason: 'none' | 'detail' }
>;

/**
 * The same table, keyed by any string at all.
 *
 * Built from the one above rather than written twice, so the exhaustiveness the
 * `satisfies` buys is not lost on the way to a lookup that has to answer for a
 * verdict nobody has heard of. A Map returns undefined for a key it lacks,
 * which is the answer this needs; indexing the object would need a cast that
 * asserts the very thing being asked.
 */
const verdictTable: ReadonlyMap<
  string,
  { readonly outcome: ReplayOutcome; readonly reason: 'none' | 'detail' }
> = new Map(Object.entries(pinnedVerdicts));

/** A run as this adapter proposes it, before the recorder judges it. */
export interface ReplayRun {
  readonly checkId: string;
  readonly runOn: string;
  readonly planted: string;
  readonly expected: string;
  readonly outcome: ReplayOutcome;
  readonly inconclusiveReason: string | null;
  readonly note: null;
  readonly source: 'replay';
  readonly sourceCommit: string;
  readonly sourceRunUrl: string;
}

/** What the job knew and the report did not. */
export interface ReplayProvenance {
  /** The day the replay ran, as the caller computed it. */
  readonly runOn: string;
  /** The commit the plants were applied to. */
  readonly sourceCommit: string;
  /** A link to the run that produced the report. */
  readonly sourceRunUrl: string;
}

export interface AdaptOptions {
  readonly report: CanfailReport;
  readonly checks: PlantedChecks;
  readonly provenance: ReplayProvenance;
}

/**
 * Every run a report means, or every reason none of them can be recorded.
 *
 * All or nothing, and that is the rule #67 states rather than an implementation
 * convenience. A report with one good outcome and one verdict nobody recognises
 * is a report produced by a tool this mapping no longer describes, so the good
 * one is no more trustworthy than the other. Refusing the batch is also what
 * makes the refusal observable: a caller that wrote the good one first would
 * leave a file behind, and the test #67 asks for is that nothing is written.
 *
 * Nothing here reads the process canfail exited with, and nothing here can:
 * that number is not in the report. It is the trap #66 pinned, and the two
 * halves of this story's own observation both exit 0, so the exit code cannot
 * even tell a caught plant from a baseline that was red before anything was
 * planted.
 */
export function runsFromReport(
  options: AdaptOptions,
): ReplayResult<readonly ReplayRun[]> {
  const { report, checks, provenance } = options;
  const problems: string[] = [];
  const runs: ReplayRun[] = [];

  // A report that tried nothing is not a clean result, it is no result, and a
  // caller that recorded nothing and exited 0 would be indistinguishable from
  // one that had nothing to record. canfail says as much in its own summary
  // line; this is that sentence with a non-zero exit behind it.
  if (report.outcomes.length === 0) {
    return {
      ok: false,
      problems: [
        'The report declares no outcomes, so nothing was tried and there is no result to record.',
      ],
    };
  }

  for (const outcome of report.outcomes) {
    const mapped = verdictTable.get(outcome.verdict);
    if (mapped === undefined) {
      problems.push(
        `The verdict ${outcome.verdict} is not one this mapping knows. canfail 0.2.1 emits ${canfailVerdicts.join(', ')}, so a fifth means the mapping is out of date and the tool version pinned on #66 needs revisiting.`,
      );
      continue;
    }

    // The address, never the name. A report names a check the way the plant
    // declaration names it, and #71 ruled that a check is reached by its
    // ledger id and by nothing else. A name matching nothing is a refusal
    // naming it, never a check brought into being to receive the run.
    const planted = checks.get(outcome.check);
    if (planted === undefined) {
      problems.push(
        `The report names a check called ${outcome.check}, which the plant declaration does not declare, so there is no ledger id to record it against.`,
      );
      continue;
    }

    runs.push({
      checkId: planted.checkId,
      runOn: provenance.runOn,
      planted: outcome.break_name,
      expected: planted.expected,
      outcome: mapped.outcome,
      inconclusiveReason: mapped.reason === 'detail' ? outcome.detail : null,
      // Left empty on purpose. A note is what a person writes when there is
      // something the next reader should know, and a sentence this adapter
      // generated for every run would be a field nobody wrote.
      note: null,
      source: 'replay',
      sourceCommit: provenance.sourceCommit,
      sourceRunUrl: provenance.sourceRunUrl,
    });
  }

  problems.push(...breaksNotDeclared(report, checks));

  return problems.length > 0
    ? { ok: false, problems }
    : { ok: true, value: runs };
}

/**
 * Every way the report's breaks differ from the ones the declaration holds.
 *
 * A run records what a check did with a declared plant, so a report about a
 * check has to carry one outcome for each break declared for it and nothing
 * else (#128). The likeliest way the two part company is not malice: the
 * declaration is edited on one branch and the report comes from a job that ran
 * with another. An outcome for a break nobody declared would be a run about a
 * plant the file does not hold, and a declared break with no outcome would be
 * a report that quietly tried less than the file says.
 *
 * Held per check, and only for the checks the report names. A replay runs the
 * checks the selection found due, so a declared check the report does not
 * mention was not selected, which is not a disagreement. A check the report
 * names and the declaration does not declare is refused where the outcomes
 * are mapped, above.
 */
function breaksNotDeclared(
  report: CanfailReport,
  checks: PlantedChecks,
): string[] {
  const reported = new Map<string, string[]>();
  for (const outcome of report.outcomes) {
    const names = reported.get(outcome.check) ?? [];
    names.push(outcome.break_name);
    reported.set(outcome.check, names);
  }

  const problems: string[] = [];
  for (const [check, names] of reported) {
    const declared = checks.get(check)?.breaks;
    if (declared === undefined) {
      continue;
    }
    for (const name of new Set(names)) {
      if (!declared.includes(name)) {
        problems.push(
          `The report has an outcome for a break of ${check} called ${name}, which the plant declaration does not declare, so there is no declared plant for it to be about.`,
        );
      }
    }
    for (const name of repeated(names)) {
      if (declared.includes(name)) {
        problems.push(
          `The report has more than one outcome for the break of ${check} called ${name}, which the plant declaration declares once.`,
        );
      }
    }
    for (const name of declared) {
      if (!names.includes(name)) {
        problems.push(
          `The plant declaration declares a break of ${check} called ${name}, and the report has no outcome for it, so the report and the declaration it is recorded against disagree.`,
        );
      }
    }
  }
  return problems;
}
