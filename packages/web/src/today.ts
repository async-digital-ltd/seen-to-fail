/**
 * Today, as the server has it: the UTC day, written YYYY-MM-DD.
 *
 * The forms default their date to this and refuse a day after it, and every
 * "days ago" on a screen is counted from it. The API judges "not in the future"
 * against the UTC day (`todayInUtc()` on the server), and this is the same
 * reading of the clock, so a form never offers a day the API will refuse.
 *
 * It was the reader's own calendar day until #40. East of UTC just after
 * midnight the reader's day has turned over and UTC's has not, so the form
 * offered, and defaulted to, a day the API refused as in the future. The owner
 * ruled on #40 to keep UTC as the one calendar: a run is often written by a job
 * with no clock of its own, and a record has to name the same day whoever
 * wrote it.
 *
 * The cost is a date that can look a day out on the reader's own clock. East
 * of UTC just after midnight the form offers what is still yesterday there,
 * and west of UTC in the evening what is already tomorrow there. The API
 * accepts both, which is the point.
 */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
