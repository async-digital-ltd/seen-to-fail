import { describe, expect, it } from 'vitest';

import { canfailVerdicts, parseCanfailReport } from './report.ts';

/**
 * The boundary between somebody else's program and this ledger.
 *
 * The document below is what canfail 0.2.1 really printed against this
 * repository on this branch, keys and all, rather than a shape written from its
 * README. A reader tested against an imagined document proves nothing about the
 * one that arrives.
 */

const measured = {
  breaks: 2,
  catches: 2,
  findings: 0,
  look: 0,
  outcomes: [
    {
      break_name: 'STATUSES loses its as const, so Status widens to string.',
      check: 'Type check',
      detail:
        'broke packages/filter/src/types.ts, the check went red as declared',
      verdict: 'catches',
    },
    {
      break_name:
        'STALE_AFTER_DAYS is written as a string rather than a number.',
      check: 'Type check',
      detail:
        'broke packages/server/src/staleness.ts, the check went red as declared',
      verdict: 'catches',
    },
  ],
};

describe('reading a replay tool report', () => {
  it('reads the document canfail 0.2.1 produced against this repository', () => {
    const result = parseCanfailReport(measured);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcomes).toHaveLength(2);
    expect(result.value.outcomes[0]?.verdict).toBe('catches');
  });

  /**
   * Strict, which is this repository's rule for every record it reads and is
   * worth more here than anywhere else. canfail is pinned at 0.2.1; a report
   * carrying a key that version does not emit came from a version this mapping
   * was not written against, and reading it anyway would publish records
   * missing whatever the new key carried.
   */
  it('refuses a report carrying a key this version does not emit', () => {
    const result = parseCanfailReport({ ...measured, severity: 'high' });
    expect(result.ok).toBe(false);
  });

  it('refuses an outcome carrying a key this version does not emit', () => {
    const result = parseCanfailReport({
      ...measured,
      outcomes: [{ ...measured.outcomes[0], mutant: 'x' }],
    });
    expect(result.ok).toBe(false);
  });

  it('refuses a document that is not a report at all', () => {
    expect(parseCanfailReport(null).ok).toBe(false);
    expect(parseCanfailReport([]).ok).toBe(false);
    expect(parseCanfailReport({ outcomes: [] }).ok).toBe(false);
  });

  /**
   * The verdict is read as text here so that the mapping can refuse an
   * unrecognised one by name. A schema that enumerated the four would refuse a
   * fifth as a malformed report, which reads as the tool being broken rather
   * than as this mapping being out of date.
   */
  it('reads a verdict it does not recognise rather than refusing it here', () => {
    const result = parseCanfailReport({
      ...measured,
      outcomes: [{ ...measured.outcomes[0], verdict: 'flagrant' }],
    });
    expect(result.ok).toBe(true);
  });

  it('pins the whole vocabulary of canfail 0.2.1', () => {
    expect(canfailVerdicts).toEqual([
      'catches',
      'blind',
      'wrong-failure',
      'look',
    ]);
  });
});
