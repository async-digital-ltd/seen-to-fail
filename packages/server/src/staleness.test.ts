import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

import { REPLAY_AFTER_DAYS, STALE_AFTER_DAYS } from './staleness.ts';

/**
 * The two day thresholds, and the relationship between them that makes the
 * floor worth having.
 *
 * Both numbers are judgments, so neither is asserted to be what it is. What is
 * asserted is the property the floor was chosen for: that the weekly cadence
 * gets more than one attempt at refreshing a proof before the backstop takes it
 * Stale. That property is what the comment on `REPLAY_AFTER_DAYS` argues for,
 * and a comment cannot notice either number moving underneath it.
 */

/** Where the schedule that acts on the floor is written. */
const workflow = fileURLToPath(
  new URL('../../../.github/workflows/replay.yml', import.meta.url),
);

/**
 * How often the replay workflow fires, in days, read off its own cron rather
 * than written down here a second time.
 *
 * The cadence lives in a cron expression in YAML and the arithmetic that
 * depends on it lives in TypeScript, which is a propagation pair and would
 * otherwise drift in silence: somebody moving the schedule to daily would leave
 * a floor chosen against a weekly one, and nothing would say so. So the shape
 * of the expression is checked rather than assumed. A weekly schedule is one
 * that names a day of the week and leaves the day of the month and the month
 * alone; anything else is a cadence this arithmetic has not been done for, and
 * the assertion below is where that gets noticed.
 */
async function cadenceInDays(): Promise<number> {
  const text = await readFile(workflow, 'utf8');
  const crons = [...text.matchAll(/^\s*- cron: '([^']+)'$/gmu)].map(
    (match) => match[1],
  );

  expect(crons).toHaveLength(1);
  // minute, hour, day of month, month, day of week.
  expect(crons[0]).toMatch(/^\S+ \S+ \* \* [0-6]$/u);
  return 7;
}

it('leaves the weekly cadence two attempts before the backstop bites', async () => {
  const cadence = await cadenceInDays();

  // A check crosses the floor on this day, and the dispatch that can act on the
  // crossing is at most one whole cadence later. The second dispatch is the one
  // that matters, because GitHub drops scheduled runs, and it has to land while
  // the proof is still Proven.
  expect(REPLAY_AFTER_DAYS + 2 * cadence).toBeLessThanOrEqual(STALE_AFTER_DAYS);
});

/**
 * The floor is a floor and not a second backstop.
 *
 * A floor at or above the threshold would never select anything the threshold
 * had not already voided, which is the whole of what #68 left in place. The
 * assertion above already implies this while the cadence is positive; it is
 * stated separately because it is the property that would survive the cadence
 * being reconsidered, and the two would then be one assertion doing two jobs.
 */
it('sits below the staleness threshold', () => {
  expect(REPLAY_AFTER_DAYS).toBeLessThan(STALE_AFTER_DAYS);
});
