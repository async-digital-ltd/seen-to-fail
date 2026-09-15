import { expect, it } from 'vitest';

import { packageName } from './index';

it('exports its own name while the filter language is unwritten', () => {
  expect(packageName).toBe('@seen-to-fail/filter');
});
