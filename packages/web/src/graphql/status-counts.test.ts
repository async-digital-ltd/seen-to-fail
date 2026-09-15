import type { ResultOf } from '@graphql-typed-document-node/core';
import { expectTypeOf, it } from 'vitest';

import { StatusCountsDocument } from './generated/graphql';

/**
 * What a client hands back for the StatusCounts query, read off the document
 * itself rather than off a type declared beside it.
 *
 * Both assertions below are checked by `pnpm typecheck` and do nothing when the
 * tests run, which is how expectTypeOf works. What they pin is that the
 * document carries a real type: if the generated result ever became `any`,
 * reading a field that is not there would stop being an error, and the
 * directive in the second test would then fail the type check for being unused.
 */
type StatusCounts = ResultOf<typeof StatusCountsDocument>['statusCounts'];

it('types the counts as the six numbers the schema serves', () => {
  expectTypeOf<StatusCounts>().toEqualTypeOf<{
    proven: number;
    unproven: number;
    stale: number;
    unarmed: number;
    broken: number;
    total: number;
  }>();
});

it('refuses a field the query does not select', () => {
  // @ts-expect-error: the schema has no such count, so neither does the result.
  expectTypeOf<StatusCounts>().toHaveProperty('notProven');
});
