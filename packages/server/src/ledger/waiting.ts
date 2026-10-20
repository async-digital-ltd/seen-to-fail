import { z } from 'zod';

/**
 * Which recorded branches are still waiting to land, and which of them have
 * waited too long (#122).
 *
 * Both recording workflows end by pushing a branch, `replay/<run id>` or
 * `record/<run id>`, and naming it in their run summary for a person to open a
 * pull request from. Neither can open the pull request itself (#74). So a
 * record exists on the remote and not in the ledger until somebody acts, and
 * the only place that says so is the summary of one green run. Nothing made a
 * forgotten branch visible to anyone who was not already listing branches,
 * which is how three replay branches sat unlanded from 5 to 18 October 2026
 * while every proof drifted towards Stale, and how a branch that waits past the
 * next weekly replay makes that replay cover the same range again.
 *
 * This module is the judgment; the script beside the workflow gathers what git
 * knows and hands it here. Keeping the two apart is what lets the tests pin the
 * rules without a repository, and lets the exit-code tests pin the git reading
 * without restating the rules.
 */

/**
 * How many days a recorded branch may wait for a person before the check goes
 * red.
 *
 * The replay is weekly, and a branch that is still unlanded when the next one
 * runs has cost something: that replay is selected against a ledger that does
 * not yet hold the waiting runs, so it covers the same range again. The grace
 * therefore has to end, and the daily check has to have fired at least once
 * after it ends, before the next weekly replay. Three days does that with room
 * for a dropped scheduled run; the relationship is asserted in
 * waiting.test.ts against the replay workflow's own cron, not against a copy of
 * it.
 */
export const LANDING_GRACE_DAYS = 3;

/** The branch lanes the recording workflows push to. */
export const recordedBranchPrefixes = ['replay/', 'record/'] as const;

const fullCommit = z
  .string()
  .regex(/^[0-9a-f]{40}$/u, 'must be a full 40-character commit hash');

/**
 * One branch deliberately kept off `main`.
 *
 * The head is part of the entry, not decoration. An exclusion is a ruling
 * about the commits a person looked at, so a branch that moves after the
 * ruling is no longer the branch that was ruled on, and the entry stops
 * covering it rather than silently covering whatever was pushed later.
 */
const keptOffMainSchema = z.strictObject({
  branch: z
    .string()
    .refine(
      (name) =>
        recordedBranchPrefixes.some(
          (prefix) => name.startsWith(prefix) && name.length > prefix.length,
        ),
      `must start with one of ${recordedBranchPrefixes.join(', ')}`,
    ),
  head: fullCommit,
  issue: z.number().int().positive(),
  reason: z.string().trim().min(1, 'must say why the branch is kept off main'),
});

const keptOffMainFileSchema = z.strictObject({
  keptOffMain: z.array(keptOffMainSchema),
});

export type KeptOffMain = z.output<typeof keptOffMainSchema>;

/** The exclusions file, read, or every reason it does not read. */
export function parseKeptOffMain(
  input: unknown,
):
  | { readonly ok: true; readonly value: readonly KeptOffMain[] }
  | { readonly ok: false; readonly problems: readonly string[] } {
  const result = keptOffMainFileSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      problems: result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(file)'}: ${issue.message}`,
      ),
    };
  }
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const entry of result.data.keptOffMain) {
    if (seen.has(entry.branch)) {
      duplicates.push(`${entry.branch} is listed more than once`);
    }
    seen.add(entry.branch);
  }
  if (duplicates.length > 0) {
    return { ok: false, problems: duplicates };
  }
  return { ok: true, value: result.data.keptOffMain };
}

/** One recorded branch on the remote, as git describes it. */
export interface RecordedBranch {
  readonly branch: string;
  readonly head: string;
  /** When its tip was committed, which for these lanes is when it was pushed. */
  readonly committedAt: Date;
  /** The paths under `ledger/` it changed since it left `main`. */
  readonly ledgerPaths: readonly string[];
  /** Of those, the ones `main` does not hold byte for byte. */
  readonly unlandedPaths: readonly string[];
}

export type BranchVerdict =
  /** Every record it carries is on `main`; only the branch was left behind. */
  | { readonly kind: 'landed'; readonly branch: RecordedBranch }
  /** It changes nothing under `ledger/`, so it carries no record to land. */
  | { readonly kind: 'no-record'; readonly branch: RecordedBranch }
  /** Unlanded, and still inside the grace. */
  | {
      readonly kind: 'waiting';
      readonly branch: RecordedBranch;
      readonly days: number;
    }
  /** Unlanded, and past the grace. This is what turns the check red. */
  | {
      readonly kind: 'overdue';
      readonly branch: RecordedBranch;
      readonly days: number;
    }
  /** Unlanded, and covered by an exclusion whose head still matches. */
  | {
      readonly kind: 'kept-off-main';
      readonly branch: RecordedBranch;
      readonly entry: KeptOffMain;
    };

/** An exclusion that no longer describes the remote, which turns it red too. */
export interface StaleExclusion {
  readonly entry: KeptOffMain;
  readonly why: 'gone' | 'moved' | 'landed';
}

export interface WaitingReport {
  readonly verdicts: readonly BranchVerdict[];
  readonly staleExclusions: readonly StaleExclusion[];
  /** True when anything in the report needs a person. */
  readonly needsAPerson: boolean;
}

const day = 24 * 60 * 60 * 1000;

/**
 * Judge every recorded branch against `main` and the exclusions.
 *
 * An exclusion is stale in three ways, and each fails the check rather than
 * passing quietly, so the file cannot drift into a list of names that once
 * meant something:
 *
 *   - gone: the branch is no longer on the remote.
 *   - moved: the branch's head is not the one the ruling named. The branch is
 *     then judged as if the entry were not there.
 *   - landed: everything the branch carries is on `main` after all, so the
 *     reason it was kept off no longer holds.
 */
export function judgeRecordedBranches(
  branches: readonly RecordedBranch[],
  keptOffMain: readonly KeptOffMain[],
  now: Date,
): WaitingReport {
  const byName = new Map(branches.map((branch) => [branch.branch, branch]));
  const staleExclusions: StaleExclusion[] = [];
  const covering = new Map<string, KeptOffMain>();

  for (const entry of keptOffMain) {
    const branch = byName.get(entry.branch);
    if (branch === undefined) {
      staleExclusions.push({ entry, why: 'gone' });
    } else if (branch.head !== entry.head) {
      staleExclusions.push({ entry, why: 'moved' });
    } else if (branch.unlandedPaths.length === 0) {
      staleExclusions.push({ entry, why: 'landed' });
    } else {
      covering.set(entry.branch, entry);
    }
  }

  const verdicts = [...branches]
    .sort((a, b) => a.branch.localeCompare(b.branch))
    .map((branch): BranchVerdict => {
      if (branch.ledgerPaths.length === 0) {
        return { kind: 'no-record', branch };
      }
      if (branch.unlandedPaths.length === 0) {
        return { kind: 'landed', branch };
      }
      const entry = covering.get(branch.branch);
      if (entry !== undefined) {
        return { kind: 'kept-off-main', branch, entry };
      }
      const days = Math.floor(
        (now.getTime() - branch.committedAt.getTime()) / day,
      );
      return days > LANDING_GRACE_DAYS
        ? { kind: 'overdue', branch, days }
        : { kind: 'waiting', branch, days };
    });

  return {
    verdicts,
    staleExclusions,
    needsAPerson:
      staleExclusions.length > 0 ||
      verdicts.some((verdict) => verdict.kind === 'overdue'),
  };
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** The report as Markdown, for the run summary and for a person's terminal. */
export function describeWaitingReport(
  report: WaitingReport,
  keptOffMainFile: string,
): string {
  const lines: string[] = [];
  const of = <Kind extends BranchVerdict['kind']>(kind: Kind) =>
    report.verdicts.filter(
      (verdict): verdict is Extract<BranchVerdict, { kind: Kind }> =>
        verdict.kind === kind,
    );

  lines.push(
    report.needsAPerson
      ? '## A recorded branch needs a person'
      : '## No recorded branch is overdue',
    '',
    `Every \`${recordedBranchPrefixes.join('*` and `')}*\` branch on the remote, judged against \`main\`. A branch is landed when \`main\` holds every file it changed under \`ledger/\`, byte for byte, however it was merged. An unlanded one may wait ${plural(LANDING_GRACE_DAYS, 'day')} before this goes red.`,
    '',
  );

  for (const verdict of of('overdue')) {
    lines.push(
      `- **Overdue:** \`${verdict.branch.branch}\`, pushed ${plural(verdict.days, 'day')} ago, carries ${plural(verdict.branch.unlandedPaths.length, 'record')} \`main\` does not hold. Land it with the command its run summary printed, or record it in \`${keptOffMainFile}\` with the reason it stays off.`,
    );
  }
  for (const stale of report.staleExclusions) {
    const said = {
      gone: 'is no longer on the remote',
      moved: `has moved off the head the entry names, \`${stale.entry.head.slice(0, 7)}\`, so the entry no longer covers it`,
      landed: 'carries nothing `main` does not already hold',
    }[stale.why];
    lines.push(
      `- **Stale entry:** \`${stale.entry.branch}\` in \`${keptOffMainFile}\` ${said}. Remove or update the entry.`,
    );
  }
  for (const verdict of of('waiting')) {
    lines.push(
      `- Waiting: \`${verdict.branch.branch}\`, pushed ${plural(verdict.days, 'day')} ago, carries ${plural(verdict.branch.unlandedPaths.length, 'record')} \`main\` does not hold.`,
    );
  }
  for (const verdict of of('kept-off-main')) {
    lines.push(
      `- Kept off \`main\` on purpose (#${String(verdict.entry.issue)}): \`${verdict.branch.branch}\`. ${verdict.entry.reason}`,
    );
  }
  for (const verdict of of('landed')) {
    lines.push(
      `- Landed, branch left behind: \`${verdict.branch.branch}\`. It can be deleted.`,
    );
  }
  for (const verdict of of('no-record')) {
    lines.push(
      `- Carries no record: \`${verdict.branch.branch}\` changes nothing under \`ledger/\`.`,
    );
  }
  if (report.verdicts.length === 0 && report.staleExclusions.length === 0) {
    lines.push('- There are no recorded branches on the remote.');
  }

  return `${lines.join('\n')}\n`;
}
