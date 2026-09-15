import type { Filter } from '@seen-to-fail/filter';
import type { ResultOf, VariablesOf } from '@graphql-typed-document-node/core';
import { expectTypeOf, it } from 'vitest';

import type { StatusName } from '../status';
import { ChecksDocument } from './generated/graphql';

/**
 * What the Checks query sends and gets back, read off the generated document.
 *
 * Checked by `pnpm typecheck`, as in status-counts.test.ts. The first pins the
 * schema's Status enum to the filter package's list, spelled in capitals, which
 * is what lets the screen turn one into the other without a cast: a status
 * added to one and not the other stops this compiling. The second pins the
 * filter argument to the filter package's own type.
 */
type ListedCheck = ResultOf<typeof ChecksDocument>['checks']['checks'][number];

it('types a check status as the filter vocabulary in capitals', () => {
  expectTypeOf<ListedCheck['status']>().toEqualTypeOf<StatusName>();
});

it('takes the filter as the filter package builds one', () => {
  expectTypeOf<VariablesOf<typeof ChecksDocument>['filter']>().toEqualTypeOf<
    Filter | null | undefined
  >();
});
