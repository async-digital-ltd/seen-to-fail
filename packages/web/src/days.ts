/**
 * Days as a reader sees them: how long ago, and which day.
 *
 * Every day in this product crosses the wire as YYYY-MM-DD text and is a day,
 * not an instant. So the arithmetic here is on calendar days alone: both sides
 * are read as midnight UTC, where no clock change can make a day 23 or 25
 * hours long, and the difference is a whole number.
 *
 * Nothing here reads the clock. Today is always passed in, from today.ts, so
 * every figure on a screen is computed from the data and one reading of the
 * calendar.
 */

const millisecondsInADay = 24 * 60 * 60 * 1000;

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** The year, month and day a YYYY-MM-DD day is written with. */
function partsOf(day: string): { year: number; month: number; date: number } {
  const [year, month, date] = day.split('-').map(Number);
  if (year === undefined || month === undefined || date === undefined) {
    throw new Error(`${day} is not a day written as YYYY-MM-DD.`);
  }
  return { year, month, date };
}

function utcMidnight(day: string): number {
  const { year, month, date } = partsOf(day);
  return Date.UTC(year, month - 1, date);
}

/**
 * How many whole days before today a day is.
 *
 * Never below zero. The API dates "today" by UTC and the reader's calendar may
 * already be a day behind it (issue #40), so a day the API accepted as today
 * can read as tomorrow here. Counting it as today says what the reader means.
 */
export function daysAgo(day: string, today: string): number {
  const difference = utcMidnight(today) - utcMidnight(day);
  return Math.max(0, Math.round(difference / millisecondsInADay));
}

/** A count and its noun, such as "1 run" or "4 runs". */
export function counted(count: number, singular: string): string {
  return `${String(count)} ${count === 1 ? singular : `${singular}s`}`;
}

/** How long ago a day was: "today", "yesterday" or "9 days ago". */
export function ago(day: string, today: string): string {
  const days = daysAgo(day, today);
  if (days === 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  return `${counted(days, 'day')} ago`;
}

/** When a check last caught its planted defect, as one line. */
export function lastCaughtLine(
  lastCaughtOn: string | null,
  today: string,
): string {
  return lastCaughtOn === null
    ? 'Never caught a defect'
    : `Last caught ${ago(lastCaughtOn, today)}`;
}

/**
 * A day as it is read in a sentence, such as "5 Jul 2026".
 *
 * Spelled from a fixed list rather than by Intl, whose short British month
 * for September has changed between releases and would make the same day
 * read differently in two browsers.
 */
export function formatDay(day: string): string {
  const { year, month, date } = partsOf(day);
  const name = monthNames[month - 1];
  if (name === undefined) {
    throw new Error(`${day} has no month ${String(month)}.`);
  }
  return `${String(date)} ${name} ${String(year)}`;
}
