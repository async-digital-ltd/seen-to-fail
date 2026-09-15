import { expect, it } from 'vitest';

import { describeServer } from './index.ts';

it('resolves the filter package through its workspace dependency', () => {
  expect(describeServer()).toBe(
    'server, using the filter language from @seen-to-fail/filter',
  );
});
