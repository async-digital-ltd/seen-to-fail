/**
 * Today, as the reader's calendar has it, written YYYY-MM-DD.
 *
 * The forms default their date to this and refuse a day after it. It is the
 * local day rather than UTC because a person dates what they did by their own
 * calendar, and a UTC default would offer tomorrow to anybody west of
 * Greenwich in the evening.
 *
 * The API judges "not in the future" against the UTC day, so for part of the
 * day a reader east of UTC can be refused today's date. That refusal arrives
 * as a field error on the date like any other. Issue #40 holds the choice of
 * how to reconcile the two calendars, and this function is the one place the
 * client would change.
 */
export function today(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
