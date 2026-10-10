// @vitest-environment node
import { describe as group, expect, it } from 'vitest';

import {
  compare,
  describe,
  formatBaseline,
  parseBaseline,
  ratchet,
} from './ratchet.ts';
import type { Baseline } from './ratchet.ts';

const baseline: Baseline = {
  tolerancePercent: 1,
  metrics: { javascriptBytes: 1000, cssBytes: 200, totalBytes: 1300 },
};

group('compare', () => {
  it('passes a build that measures exactly the baseline', () => {
    expect(
      compare(baseline, baseline.metrics).map(({ verdict }) => verdict),
    ).toEqual(['held', 'held', 'held']);
  });

  it('allows growth up to the tolerance and refuses one byte past it', () => {
    const [atLimit] = compare(baseline, {
      ...baseline.metrics,
      javascriptBytes: 1010,
    });
    const [pastLimit] = compare(baseline, {
      ...baseline.metrics,
      javascriptBytes: 1011,
    });

    expect(atLimit).toMatchObject({ limit: 1010, verdict: 'within' });
    expect(pastLimit).toMatchObject({ limit: 1010, verdict: 'grew' });
  });

  it('measures the limit from the baseline, so a zero tolerance allows nothing', () => {
    const [javascript] = compare(
      { ...baseline, tolerancePercent: 0 },
      { ...baseline.metrics, javascriptBytes: 1001 },
    );

    expect(javascript?.verdict).toBe('grew');
  });

  it('says when a metric shrank', () => {
    const verdicts = compare(baseline, {
      ...baseline.metrics,
      cssBytes: 150,
    }).map(({ verdict }) => verdict);

    expect(verdicts).toEqual(['held', 'shrank', 'held']);
  });
});

group('ratchet', () => {
  it('lowers each metric that shrank and keeps the rest', () => {
    expect(
      ratchet(baseline, {
        javascriptBytes: 900,
        cssBytes: 200,
        totalBytes: 1200,
      }).metrics,
    ).toEqual({ javascriptBytes: 900, cssBytes: 200, totalBytes: 1200 });
  });

  it('never raises a metric, however much it grew', () => {
    expect(
      ratchet(baseline, {
        javascriptBytes: 5000,
        cssBytes: 5000,
        totalBytes: 10000,
      }),
    ).toEqual(baseline);
  });
});

group('parseBaseline', () => {
  it('reads back what formatBaseline writes', () => {
    expect(parseBaseline(formatBaseline(baseline))).toEqual(baseline);
  });

  it('refuses a baseline missing a metric', () => {
    expect(() =>
      parseBaseline(
        JSON.stringify({
          tolerancePercent: 1,
          metrics: { javascriptBytes: 1, cssBytes: 1 },
        }),
      ),
    ).toThrow('"totalBytes"');
  });

  it('refuses a metric nothing measures, so a misspelt name is not ignored', () => {
    expect(() =>
      parseBaseline(
        JSON.stringify({
          tolerancePercent: 1,
          metrics: { ...baseline.metrics, javaScriptBytes: 1 },
        }),
      ),
    ).toThrow('javaScriptBytes');
  });

  it('refuses a negative tolerance and a fractional byte count', () => {
    expect(() =>
      parseBaseline(
        JSON.stringify({ tolerancePercent: -1, metrics: baseline.metrics }),
      ),
    ).toThrow('tolerancePercent');
    expect(() =>
      parseBaseline(
        JSON.stringify({
          tolerancePercent: 1,
          metrics: { ...baseline.metrics, cssBytes: 1.5 },
        }),
      ),
    ).toThrow('"cssBytes"');
  });
});

group('describe', () => {
  it('names the metric that grew and the limit it passed', () => {
    const text = describe(
      compare(baseline, { ...baseline.metrics, javascriptBytes: 1100 }),
    );

    expect(text).toContain(
      'javascriptBytes: 1100 bytes against a baseline of 1000, +100 (10.00%). Over the limit of 1010.',
    );
  });
});
