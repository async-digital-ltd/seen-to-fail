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

/** The shape of a day, which is necessary and not sufficient. */
const dayShape = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The first day there is, as far as this product is concerned.
 *
 * ISO 8601 has a year 0000, which is the year before 0001, and JavaScript parses
 * it happily. PostgreSQL counts years with no year zero, as the calendar did,
 * and refuses the day outright, so a date column cannot hold one. It is refused
 * before it is sent, and nothing a check has ever caught happened then. Text in
 * this shape sorts as the days it names, so comparing the text is enough.
 */
const firstDay = '0001-01-01';

/**
 * Whether the text is a day that exists.
 *
 * The shape alone accepts 2026-02-30 and 2026-13-01, which are not days. The
 * round trip is what rejects them: parsing places the text at midnight UTC, and
 * a day that does not exist lands on a different one, so formatting the result
 * back gives different text. A month out of range does not parse at all.
 *
 * It lives here rather than beside the Date scalar because the scalar is no
 * longer the only way a day enters this system. A day written into a file in
 * the ledger reaches PostgreSQL without passing a GraphQL request, and a second
 * copy of this rule for that route is a second answer to the same question. The
 * ledger must not depend on the server, so the shared rule sits under neither.
 */
export function isRealDay(value: string): boolean {
  if (!dayShape.test(value) || value < firstDay) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return new Date(parsed).toISOString().slice(0, 10) === value;
}
