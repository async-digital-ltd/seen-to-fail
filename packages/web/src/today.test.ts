import { expect, it } from 'vitest';

import { today } from './today';

it('writes the day as YYYY-MM-DD, padded', () => {
  expect(today(new Date(2026, 0, 5, 9, 0))).toBe('2026-01-05');
});

it("takes the reader's calendar day, not the UTC one", () => {
  // Half past midnight on the 16th in UTC is still the evening of the 15th to
  // a reader west of UTC. The test process may well run in UTC, so the local
  // reading is stood in for rather than left to the machine's zone.
  const eveningWestOfUtc = Object.assign(
    new Date(Date.UTC(2026, 8, 16, 0, 30)),
    { getFullYear: () => 2026, getMonth: () => 8, getDate: () => 15 },
  );

  expect(today(eveningWestOfUtc)).toBe('2026-09-15');
});
