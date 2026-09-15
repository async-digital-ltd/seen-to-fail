import { STATUSES } from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import type { StatusName } from './status';
import { statusFromName } from './status';

it.each(STATUSES)('reads %s back from the capitals the API sends', (status) => {
  const name = status.toUpperCase() as StatusName;

  expect(statusFromName(name)).toBe(status);
});
