/**
 * The ratchet on the client bundle: what the production build measured,
 * against a baseline that is committed beside it and only ever comes down.
 *
 * Every metric is a count of bytes on disk. Bytes are the same on every run of
 * the same lockfile and source tree, on any machine, so a failure here is a
 * change in the code and never the runner having a slow day. Timing a page
 * load would say more about what a reader feels and would flake on a shared
 * runner, and a gate that flakes is a gate people learn to re-run.
 *
 * The tolerance is the slack a change may add before it fails. It is measured
 * from the baseline, never from the last run, so many small additions cannot
 * walk the ceiling upwards: together they hit the same limit one large one
 * would. Raising the baseline is a hand edit to the committed file, which puts
 * the growth and its reason in a diff somebody reviews. Lowering it is what
 * `pnpm bundle:ratchet` does, and the only thing it can do.
 */

/** The metrics, in the order they are reported. */
export const METRICS = ['javascriptBytes', 'cssBytes', 'totalBytes'] as const;

export type Metric = (typeof METRICS)[number];

export type Measurements = Record<Metric, number>;

/** What `packages/web/bundle-baseline.json` holds. */
export interface Baseline {
  readonly tolerancePercent: number;
  readonly metrics: Measurements;
}

/** How one metric compares with its baseline. */
export interface Comparison {
  readonly metric: Metric;
  readonly baseline: number;
  readonly measured: number;
  /** The most it may measure and still pass. */
  readonly limit: number;
  /**
   * `grew`: past the limit, and the run fails.
   * `within`: above the baseline but inside the tolerance.
   * `held`: exactly the baseline.
   * `shrank`: below the baseline, so the baseline can come down.
   */
  readonly verdict: 'grew' | 'within' | 'held' | 'shrank';
}

/** Reads a baseline file's contents, refusing anything it cannot trust. */
export function parseBaseline(text: string): Baseline {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null) {
    throw new Error('The baseline is not a JSON object.');
  }
  const { tolerancePercent, metrics } = value as Record<string, unknown>;
  if (
    typeof tolerancePercent !== 'number' ||
    !Number.isFinite(tolerancePercent) ||
    tolerancePercent < 0
  ) {
    throw new Error(
      'The baseline\'s "tolerancePercent" must be a number of zero or more.',
    );
  }
  if (typeof metrics !== 'object' || metrics === null) {
    throw new Error('The baseline has no "metrics" object.');
  }
  const named = metrics as Record<string, unknown>;
  const unknownNames = Object.keys(named).filter(
    (name) => !(METRICS as readonly string[]).includes(name),
  );
  if (unknownNames.length > 0) {
    throw new Error(
      `The baseline names metrics nothing measures: ${unknownNames.join(', ')}.`,
    );
  }
  const read = {} as Record<Metric, number>;
  for (const metric of METRICS) {
    const bytes = named[metric];
    if (
      typeof bytes !== 'number' ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0
    ) {
      throw new Error(
        `The baseline's "${metric}" must be a whole number of bytes.`,
      );
    }
    read[metric] = bytes;
  }
  return { tolerancePercent, metrics: read };
}

/** Each metric against its baseline, in the order of {@link METRICS}. */
export function compare(
  baseline: Baseline,
  measured: Measurements,
): Comparison[] {
  return METRICS.map((metric) => {
    const base = baseline.metrics[metric];
    const value = measured[metric];
    const limit = Math.floor(base * (1 + baseline.tolerancePercent / 100));
    const verdict =
      value > limit
        ? 'grew'
        : value > base
          ? 'within'
          : value === base
            ? 'held'
            : 'shrank';
    return { metric, baseline: base, measured: value, limit, verdict };
  });
}

/**
 * The baseline after a ratchet: each metric at whichever is lower, what it
 * was or what was measured. Nothing here can raise a value, which is the
 * whole of what makes it a ratchet.
 */
export function ratchet(baseline: Baseline, measured: Measurements): Baseline {
  const metrics = {} as Record<Metric, number>;
  for (const metric of METRICS) {
    metrics[metric] = Math.min(baseline.metrics[metric], measured[metric]);
  }
  return { tolerancePercent: baseline.tolerancePercent, metrics };
}

/** The file's contents for a baseline, formatted the way Prettier leaves it. */
export function formatBaseline(baseline: Baseline): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}

/** One line per metric, for a person reading a CI log. */
export function describe(comparisons: readonly Comparison[]): string {
  return comparisons
    .map(({ metric, baseline, measured, limit, verdict }) => {
      const change = measured - baseline;
      const signed = change > 0 ? `+${String(change)}` : String(change);
      const percent =
        baseline === 0 ? '' : ` (${((change / baseline) * 100).toFixed(2)}%)`;
      const head = `${metric}: ${String(measured)} bytes against a baseline of ${String(baseline)}, ${signed}${percent}`;
      switch (verdict) {
        case 'grew':
          return `${head}. Over the limit of ${String(limit)}.`;
        case 'within':
          return `${head}. Inside the limit of ${String(limit)}.`;
        case 'held':
          return `${head}. Unchanged.`;
        case 'shrank':
          return `${head}. Smaller, so the baseline can come down.`;
      }
    })
    .join('\n');
}
