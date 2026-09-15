import { expect, it } from 'vitest';

import { describeClient } from './index';

it('resolves the filter package through its workspace dependency', () => {
  expect(describeClient()).toBe(
    'web client, using the filter language from @seen-to-fail/filter',
  );
});
