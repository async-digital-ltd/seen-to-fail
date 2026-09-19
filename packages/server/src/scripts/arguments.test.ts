import { expect, it } from 'vitest';

import { forwardedArguments } from './arguments.ts';

/**
 * The one thing the three scripts share about their arguments, held in one
 * place so that a script written later cannot forget it.
 */

it('takes the separator pnpm forwards off the front', () => {
  expect(forwardedArguments(['--', '--out', 'dist'])).toEqual([
    '--out',
    'dist',
  ]);
});

it('leaves arguments alone when nothing was forwarded', () => {
  expect(forwardedArguments(['--out', 'dist'])).toEqual(['--out', 'dist']);
});

it('leaves a separator that is not first where it is', () => {
  expect(forwardedArguments(['--note', '--'])).toEqual(['--note', '--']);
});

it('reads nothing as nothing', () => {
  expect(forwardedArguments([])).toEqual([]);
});
