import { describe, expect, it } from 'vitest';

import { ago, counted, daysAgo, formatDay, lastCaughtLine } from './days';

describe('daysAgo', () => {
  it.each([
    { day: '2026-09-15', today: '2026-09-15', days: 0 },
    { day: '2026-09-14', today: '2026-09-15', days: 1 },
    { day: '2026-08-31', today: '2026-09-15', days: 15 },
    { day: '2025-09-15', today: '2026-09-15', days: 365 },
    // Across a leap day.
    { day: '2028-02-28', today: '2028-03-01', days: 2 },
  ])('counts $days days from $day to $today', ({ day, today, days }) => {
    expect(daysAgo(day, today)).toBe(days);
  });

  it('counts a day after today as today', () => {
    expect(daysAgo('2026-09-16', '2026-09-15')).toBe(0);
  });
});

describe('ago', () => {
  it.each([
    { day: '2026-09-15', phrase: 'today' },
    { day: '2026-09-14', phrase: 'yesterday' },
    { day: '2026-09-13', phrase: '2 days ago' },
    { day: '2026-07-06', phrase: '71 days ago' },
  ])('says $phrase for $day', ({ day, phrase }) => {
    expect(ago(day, '2026-09-15')).toBe(phrase);
  });
});

describe('counted', () => {
  it('keeps one singular and makes every other count plural', () => {
    expect(counted(0, 'run')).toBe('0 runs');
    expect(counted(1, 'run')).toBe('1 run');
    expect(counted(4, 'run')).toBe('4 runs');
  });
});

describe('lastCaughtLine', () => {
  it('says how long ago the last catch was', () => {
    expect(lastCaughtLine('2026-09-06', '2026-09-15')).toBe(
      'Last caught 9 days ago',
    );
  });

  it('says so when nothing has ever been caught', () => {
    expect(lastCaughtLine(null, '2026-09-15')).toBe('Never caught a defect');
  });
});

describe('formatDay', () => {
  it.each([
    { day: '2026-07-05', text: '5 Jul 2026' },
    { day: '2026-09-15', text: '15 Sep 2026' },
    { day: '2027-01-31', text: '31 Jan 2027' },
    { day: '2026-12-01', text: '1 Dec 2026' },
  ])('writes $day as $text', ({ day, text }) => {
    expect(formatDay(day)).toBe(text);
  });
});
