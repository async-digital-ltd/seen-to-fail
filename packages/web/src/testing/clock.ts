import { vi } from 'vitest';

/**
 * Holds a test at one instant in one time zone, so that the reader's calendar
 * and the UTC one can be made to disagree on purpose.
 *
 * Only Date is faked, as in the other component tests, so the client's ticks
 * and user-event still run. The zone is set through TZ, which Node reads again
 * whenever it changes, and `vi.unstubAllEnvs()` puts the machine's zone back.
 *
 * It returns the day the zone's own calendar shows at that instant, so the
 * test can assert that the two calendars really are apart. Without that, a
 * runtime that ignored the zone would read one day on both, and a test meant
 * to hold them apart would pass while holding nothing apart.
 */
export function holdClockIn(zone: string, instant: string): string {
  vi.stubEnv('TZ', zone);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
  const now = new Date();
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
