import { expect, it } from 'vitest';

import { createLoader, groupByCheck } from './loader.ts';

/**
 * What the loader promises, without a database behind it.
 *
 * The batching is checked against a real query count elsewhere, through the
 * schema, because that is the claim worth making: the API issues two queries
 * and not nine. These tests are about the loader on its own, and they cover the
 * parts that query count would not tell apart. A loader that batched correctly
 * but handed a caller the wrong key's value, or that shared one array between
 * callers, would pass a query count and be broken.
 */

interface Recorded {
  /** The keys each call was given, in the order the calls happened. */
  readonly calls: string[][];
}

/** A batch read that records what it was asked for and answers from a map. */
function recording(
  answers: ReadonlyMap<string, string>,
): [
  Recorded,
  (keys: readonly string[]) => Promise<ReadonlyMap<string, string>>,
] {
  const recorded: Recorded = { calls: [] };
  return [
    recorded,
    (keys) => {
      recorded.calls.push([...keys]);
      const found = new Map<string, string>();
      for (const key of keys) {
        const answer = answers.get(key);
        if (answer !== undefined) {
          found.set(key, answer);
        }
      }
      return Promise.resolve(found);
    },
  ];
}

it('fetches keys asked for in the same turn in one call', async () => {
  const [recorded, batchLoad] = recording(
    new Map([
      ['a', 'first'],
      ['b', 'second'],
      ['c', 'third'],
    ]),
  );
  const loader = createLoader(batchLoad, () => 'nothing');

  const values = await Promise.all([
    loader.load('a'),
    loader.load('b'),
    loader.load('c'),
  ]);

  expect(values).toStrictEqual(['first', 'second', 'third']);
  expect(recorded.calls).toStrictEqual([['a', 'b', 'c']]);
});

it('asks for a key once however many callers want it', async () => {
  const [recorded, batchLoad] = recording(new Map([['a', 'first']]));
  const loader = createLoader(batchLoad, () => 'nothing');

  const values = await Promise.all([
    loader.load('a'),
    loader.load('a'),
    loader.load('a'),
  ]);

  expect(values).toStrictEqual(['first', 'first', 'first']);
  expect(recorded.calls).toStrictEqual([['a']]);
});

it('starts a new batch for a key asked for after the first one left', async () => {
  const [recorded, batchLoad] = recording(
    new Map([
      ['a', 'first'],
      ['b', 'second'],
    ]),
  );
  const loader = createLoader(batchLoad, () => 'nothing');

  expect(await loader.load('a')).toBe('first');
  expect(await loader.load('b')).toBe('second');

  expect(recorded.calls).toStrictEqual([['a'], ['b']]);
});

it('gathers keys asked for from inside an already settled promise', async () => {
  const [recorded, batchLoad] = recording(
    new Map([
      ['a', 'first'],
      ['b', 'second'],
    ]),
  );
  const loader = createLoader(batchLoad, () => 'nothing');

  // The second key is asked for from a promise chained in the same turn, which
  // is the shape a resolver takes when it awaits something before asking. A
  // loader that dispatched on a plain microtask would have sent the first batch
  // already and would make two calls here.
  const values = await Promise.all([
    loader.load('a'),
    Promise.resolve().then(() => loader.load('b')),
  ]);

  expect(values).toStrictEqual(['first', 'second']);
  expect(recorded.calls).toStrictEqual([['a', 'b']]);
});

it('builds a fresh value for a key the read found nothing for', async () => {
  const loader = createLoader<string, string[]>(
    () => Promise.resolve(new Map<string, string[]>()),
    () => [],
  );

  const [first, second] = await Promise.all([
    loader.load('a'),
    loader.load('b'),
  ]);

  expect(first).toStrictEqual([]);
  expect(second).toStrictEqual([]);
  // One caller changing what it was given must not change what another sees,
  // which is why the fallback is built per key rather than shared.
  expect(first).not.toBe(second);
});

it('gives a failed read to every caller in the batch', async () => {
  const loader = createLoader<string, string>(
    () => Promise.reject(new Error('the read failed')),
    () => 'nothing',
  );

  const first = loader.load('a');
  const second = loader.load('b');

  await expect(first).rejects.toThrow('the read failed');
  await expect(second).rejects.toThrow('the read failed');
});

it('groups rows under the check they belong to, in order', () => {
  const grouped = groupByCheck([
    { checkId: 'one', runOn: '2026-03-01' },
    { checkId: 'two', runOn: '2026-02-01' },
    { checkId: 'one', runOn: '2026-01-01' },
  ]);

  expect([...grouped.keys()]).toStrictEqual(['one', 'two']);
  expect(grouped.get('one')?.map((row) => row.runOn)).toStrictEqual([
    '2026-03-01',
    '2026-01-01',
  ]);
  expect(grouped.get('two')?.map((row) => row.runOn)).toStrictEqual([
    '2026-02-01',
  ]);
});
