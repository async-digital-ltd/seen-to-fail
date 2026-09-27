import { describe, expect, it } from 'vitest';

import { runsFromReport } from './adapt.ts';
import type { ReplayProvenance } from './adapt.ts';
import { parsePlantedChecks } from './plants.ts';
import type { PlantedChecks } from './plants.ts';
import { parseCanfailReport } from './report.ts';
import type { CanfailReport } from './report.ts';

/**
 * The mapping, judged against the table #66 pinned.
 *
 * The reports below are the shapes canfail 0.2.1 really produced against this
 * repository, measured on this branch rather than imagined: two plants against
 * `pnpm typecheck` scoring `catches` on a clean tree, and the same two scoring
 * `look` on a tree that was already red. Both of those runs exited 0, which is
 * why nothing here or anywhere else in the adapter reads an exit code.
 */

/**
 * The character canfail puts between the two halves of a detail sentence.
 *
 * Built from its code point rather than typed into the source. The fixture it
 * appears in has to be canfail's words exactly, and a fixture that quietly
 * said something the tool never said would go on passing after the tool
 * changed, which is the shape of defect this repository exists to expose.
 */
const canfailDash = String.fromCodePoint(0x2014);

const provenance: ReplayProvenance = {
  runOn: '2026-09-19',
  sourceCommit: '31a56ad94b3dad9a5cb7ae285d734df2a8bd45eb',
  sourceRunUrl:
    'https://github.com/async-digital-ltd/seen-to-fail/actions/runs/1',
};

/** A declaration of the one check, carrying breaks with these names. */
function checks(breakNames: readonly string[]): PlantedChecks {
  const parsed = parsePlantedChecks({
    checks: [
      {
        name: 'Type check',
        checkId: 'ci-type-check',
        expected: 'The type check fails.',
        run: 'pnpm typecheck',
        breaks: breakNames.map((name) => ({
          name,
          file: 'a.ts',
          replace: 'a',
          with: 'b',
        })),
      },
    ],
  });
  if (!parsed.ok) {
    throw new Error(parsed.problems.join('\n'));
  }
  return parsed.value;
}

type Outcomes = readonly {
  check?: string;
  break_name?: string;
  verdict: string;
  detail?: string;
}[];

/**
 * The break an outcome is filed under when a test does not say, numbered so
 * that no two outcomes in one report share a name by accident.
 */
function breakNameOf(outcome: Outcomes[number], at: number): string {
  return outcome.break_name ?? `Plant ${String(at + 1)}.`;
}

function report(outcomes: Outcomes): CanfailReport {
  const parsed = parseCanfailReport({
    breaks: outcomes.length,
    catches: outcomes.filter((one) => one.verdict === 'catches').length,
    findings: outcomes.filter(
      (one) => one.verdict === 'blind' || one.verdict === 'wrong-failure',
    ).length,
    look: outcomes.filter((one) => one.verdict === 'look').length,
    outcomes: outcomes.map((one, at) => ({
      check: one.check ?? 'Type check',
      break_name: breakNameOf(one, at),
      verdict: one.verdict,
      detail: one.detail ?? 'Something the tool said.',
    })),
  });
  if (!parsed.ok) {
    throw new Error(parsed.problems.join('\n'));
  }
  return parsed.value;
}

/**
 * The report, read against a declaration.
 *
 * With no declaration given, the one check declares exactly the breaks the
 * report names, so the tests about the verdict mapping are not also tests of
 * the break guard. The guard has its own tests below, which always say what
 * was declared.
 */
function adapt(outcomes: Outcomes, declared?: readonly string[]) {
  return runsFromReport({
    report: report(outcomes),
    checks: checks(declared ?? [...new Set(outcomes.map(breakNameOf))]),
    provenance,
  });
}

describe('the pinned verdict mapping', () => {
  it('records a catch as caught, with no reason', () => {
    const result = adapt([{ verdict: 'catches' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.outcome).toBe('caught');
    expect(result.value[0]?.inconclusiveReason).toBeNull();
  });

  it('records a blind guard as missed, with no reason', () => {
    const result = adapt([{ verdict: 'blind' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.outcome).toBe('missed');
    expect(result.value[0]?.inconclusiveReason).toBeNull();
  });

  it.each(['wrong-failure', 'look'])(
    'records %s as inconclusive, carrying the detail verbatim',
    (verdict) => {
      const detail = `it failed, but not with 'error TS[0-9]+' ${canfailDash} it said: <script>alert(1)</script> & "quoted"`;
      const result = adapt([{ verdict, detail }]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[0]?.outcome).toBe('inconclusive');
      // Verbatim: not trimmed, not reworded, not sorted into a category. The
      // ledger's README is explicit that the reason is the words whoever
      // recorded it wrote, and `look` is four situations told apart only
      // inside this sentence.
      expect(result.value[0]?.inconclusiveReason).toBe(detail);
    },
  );

  /**
   * The refusal #66 pinned and #67 inherits. Asserted on the result rather
   * than on a message, and on the runs being absent rather than on there being
   * fewer of them: a fifth verdict means the mapping no longer describes the
   * tool, so the outcomes it DID recognise are no more trustworthy than the
   * one it did not.
   */
  it('refuses a verdict outside the table, and proposes no runs at all', () => {
    const result = adapt([{ verdict: 'catches' }, { verdict: 'flagrant' }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('flagrant');
  });

  /**
   * The mapping is the whole vocabulary, so every verdict canfail 0.2.1 emits
   * has to reach a run. Written as one report carrying all four rather than as
   * four assertions, so a verdict quietly dropped from the table shows up as a
   * refusal here rather than as a test nobody wrote.
   */
  it('maps all four of canfail 0.2.1 verdicts and drops none', () => {
    const result = adapt([
      { verdict: 'catches' },
      { verdict: 'blind' },
      { verdict: 'wrong-failure' },
      { verdict: 'look' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((run) => run.outcome)).toEqual([
      'caught',
      'missed',
      'inconclusive',
      'inconclusive',
    ]);
  });
});

describe('what every run carries', () => {
  /**
   * The assertion #64's comment asked for, at the only place that can make it
   * true for every record: a source this adapter always sets rather than one
   * the recorder infers. The recorder's own refusal of a record without it is
   * asserted separately, against the real script.
   */
  it('sets the source to replay on every run, with its commit and its link', () => {
    const result = adapt([
      { verdict: 'catches' },
      { verdict: 'look' },
      { verdict: 'blind' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    for (const run of result.value) {
      expect(run.source).toBe('replay');
      expect(run.sourceCommit).toBe(provenance.sourceCommit);
      expect(run.sourceRunUrl).toBe(provenance.sourceRunUrl);
      expect(run.runOn).toBe(provenance.runOn);
      expect(run.note).toBeNull();
    }
  });

  it('records the break name as what was planted, and the declared expectation', () => {
    const result = adapt([
      { verdict: 'catches', break_name: 'STATUSES loses its as const.' },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.planted).toBe('STATUSES loses its as const.');
    expect(result.value[0]?.expected).toBe('The type check fails.');
  });

  /**
   * #71's sentence, arriving where a report meets a ledger: a check is reached
   * by its id and never by its name. The report here names a check the plant
   * declaration does not declare, so there is no id to record against, and the
   * refusal names it rather than inventing one.
   */
  it('refuses an outcome naming a check the declaration does not declare', () => {
    const result = adapt([{ verdict: 'catches', check: 'Lint' }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems[0]).toContain('Lint');
  });

  it('records against the ledger id rather than the name in the report', () => {
    const result = adapt([{ verdict: 'catches', check: 'Type check' }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.checkId).toBe('ci-type-check');
  });
});

describe('a report that settled nothing at all', () => {
  /**
   * canfail's own summary says a config that tried nothing is not a clean
   * result, it is no result. An adapter that recorded nothing and exited 0
   * would be indistinguishable from one that had nothing to record, which is
   * the failure shape this whole repository is about.
   */
  it('refuses a report with no outcomes rather than recording nothing quietly', () => {
    const result = runsFromReport({
      report: report([]),
      checks: checks(['A plant.']),
      provenance,
    });
    expect(result.ok).toBe(false);
  });
});

describe('a report held to the breaks the declaration holds', () => {
  const declared = [
    'STATUSES loses its as const, so Status widens to string.',
    'STALE_AFTER_DAYS is written as a string rather than a number.',
  ];
  const both = declared.map((name) => ({
    verdict: 'catches',
    break_name: name,
  }));
  const [first, second] = both;
  if (first === undefined || second === undefined) {
    throw new Error('Both declared breaks need an outcome.');
  }

  it('records a report carrying one outcome for each declared break', () => {
    const result = adapt(both, declared);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((run) => run.planted)).toEqual(declared);
  });

  /**
   * #128's own measurement: three outcomes against two declared breaks was
   * accepted and wrote three runs. The extra outcome is a run about a plant
   * the file does not hold, so the whole report is refused, the two declared
   * outcomes included, and the refusal names the break.
   */
  it('refuses an outcome for a break the declaration does not declare, and proposes no runs', () => {
    const result = adapt(
      [...both, { verdict: 'catches', break_name: 'A plant nobody declared.' }],
      declared,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('A plant nobody declared.');
    expect(result.problems[0]).toContain('does not declare');
  });

  it('refuses a report with no outcome for a declared break, and proposes no runs', () => {
    const result = adapt([first], declared);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain(second.break_name);
    expect(result.problems[0]).toContain('no outcome');
  });

  /**
   * As many outcomes as declared breaks, and the wrong breaks. A count of
   * outcomes held to a count of breaks would pass this, so the guard has to
   * compare the names, and it names both sides of the disagreement.
   */
  it('refuses a report whose count matches but whose breaks do not', () => {
    const result = adapt(
      [first, { verdict: 'catches', break_name: 'A plant nobody declared.' }],
      declared,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(2);
  });

  it('refuses two outcomes for one declared break', () => {
    const result = adapt([...both, second], declared);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain('more than one outcome');
  });

  /**
   * A replay runs the checks the selection found due, and the adapter reads
   * the whole declaration, so a declared check the report never mentions was
   * not selected. That is not a disagreement and is not refused.
   */
  it('asks nothing of a declared check the report does not name', () => {
    const parsed = parsePlantedChecks({
      checks: [
        {
          name: 'Type check',
          checkId: 'ci-type-check',
          expected: 'The type check fails.',
          breaks: declared.map((name) => ({ name })),
        },
        {
          name: 'Lint',
          checkId: 'ci-lint',
          expected: 'The lint fails.',
          breaks: [{ name: 'An unused import.' }],
        },
      ],
    });
    if (!parsed.ok) {
      throw new Error(parsed.problems.join('\n'));
    }
    const result = runsFromReport({
      report: report(both),
      checks: parsed.value,
      provenance,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });
});
