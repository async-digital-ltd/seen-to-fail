import type { IsoDate } from './database/rows.ts';

/**
 * Today, as a day rather than an instant.
 *
 * In UTC, and not in the zone the process happens to be running in, because
 * every other day in this system is already UTC: the seed dates its workspace
 * back from a UTC day, and the column lists format stored days without
 * consulting a zone. A reading of "today" that came from somewhere else would
 * put the server and its own record on different calendars for part of each
 * day, and the only visible symptom would be a check reading Stale a day early.
 *
 * One function so that there is one answer. It was two before this file
 * existed, one of them private to the seed, which is exactly how two copies of
 * a rule end up disagreeing about a time zone.
 */
export function todayInUtc(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}
