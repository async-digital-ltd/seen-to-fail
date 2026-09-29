import { expect, it } from 'vitest';

import { today } from './today';

it('writes the day as YYYY-MM-DD, padded', () => {
  expect(today(new Date(Date.UTC(2026, 0, 5, 9, 0)))).toBe('2026-01-05');
});

// The two tests below stand in for the reader's own calendar rather than
// leave it to the machine's zone, which may well be UTC and then could not
// tell the two days apart.

it("takes the UTC day where the reader's day has already turned over", () => {
  // Half past eleven at night on the 15th in UTC is already the 16th to a
  // reader east of UTC.
  const afterMidnightEastOfUtc = Object.assign(
    new Date(Date.UTC(2026, 8, 15, 23, 30)),
    { getFullYear: () => 2026, getMonth: () => 8, getDate: () => 16 },
  );

  expect(today(afterMidnightEastOfUtc)).toBe('2026-09-15');
});

it("takes the UTC day where the reader's day has not turned over yet", () => {
  // Half past midnight on the 16th in UTC is still the evening of the 15th to
  // a reader west of UTC.
  const eveningWestOfUtc = Object.assign(
    new Date(Date.UTC(2026, 8, 16, 0, 30)),
    { getFullYear: () => 2026, getMonth: () => 8, getDate: () => 15 },
  );

  expect(today(eveningWestOfUtc)).toBe('2026-09-16');
});
