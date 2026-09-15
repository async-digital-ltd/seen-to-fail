/**
 * Turning many small asks into one.
 *
 * A list of checks asking each check for its runs is the same field resolved
 * once per row. Each of those is a perfectly reasonable question and together
 * they are a query per row, which is the shape that looks fine against a seeded
 * workspace of eight and falls over against a real one. A loader sits in front
 * of the read: callers ask by key and get a promise each, and one call goes to
 * the database with every key that was asked for.
 *
 * A loader is built per request and thrown away with it. That is deliberate and
 * it is the difference between batching and caching. A loader that outlived a
 * request would start answering from what an earlier request saw, and a status
 * derived as of today would be reported from rows read yesterday. Nothing here
 * remembers anything between requests.
 *
 * Small enough to read in one sitting on purpose. The batching is the load
 * bearing part of the file, and a test plants the failure it exists to prevent
 * by dispatching each key on its own and watching the query count go up.
 */

/** Fetches every key at once, returning what it found, keyed the same way. */
export type BatchLoad<Key, Value> = (
  keys: readonly Key[],
) => Promise<ReadonlyMap<Key, Value>>;

export interface Loader<Key, Value> {
  /** The value for one key, once the batch it joins has been fetched. */
  load: (key: Key) => Promise<Value>;
}

interface Batch<Key, Value> {
  /** Keys asked for so far. Still being added to until the batch is sent. */
  readonly keys: Key[];
  readonly found: Promise<ReadonlyMap<Key, Value>>;
}

/**
 * A promise that settles after everything the current turn has queued.
 *
 * Both halves are needed and neither is enough. A microtask alone settles while
 * promises chained in the same turn are still adding keys, so the batch would
 * go early and a second one would follow it. process.nextTick alone runs before
 * those microtasks, so it has the same problem from the other side. Draining
 * the microtask queue and then taking the next tick lands after both.
 */
function afterThisTurn(): Promise<void> {
  return new Promise<void>((settle) => {
    void Promise.resolve().then(() => {
      process.nextTick(settle);
    });
  });
}

/**
 * A loader over one batched read.
 *
 * `whenAbsent` builds the value for a key the read returned nothing for, which
 * for every caller here means an empty list. It is a function rather than a
 * value so that each caller gets its own array and one of them cannot change
 * what another sees.
 */
export function createLoader<Key, Value>(
  batchLoad: BatchLoad<Key, Value>,
  whenAbsent: () => Value,
): Loader<Key, Value> {
  let batch: Batch<Key, Value> | undefined;

  function startBatch(): Batch<Key, Value> {
    const keys: Key[] = [];
    const found = afterThisTurn().then(async () => {
      // Cleared before the read goes out, so a key asked for afterwards starts
      // a batch of its own rather than joining one that has already left.
      batch = undefined;
      // Deduplicated here rather than as keys arrive, because two fields on the
      // same check are two perfectly good asks and only the database needs to
      // be told once.
      return batchLoad([...new Set(keys)]);
    });
    return { keys, found };
  }

  return {
    load(key: Key): Promise<Value> {
      batch ??= startBatch();
      const joined = batch;
      joined.keys.push(key);
      return joined.found.then((found) => found.get(key) ?? whenAbsent());
    },
  };
}

/**
 * Rows fetched for many checks at once, put back under the check they belong
 * to, in the order the query returned them.
 *
 * Grouping happens here and nowhere else. The queries return one flat list on
 * purpose, so the order they were written in is the order every check sees.
 */
export function groupByCheck<Row extends { readonly checkId: string }>(
  rows: readonly Row[],
): ReadonlyMap<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const existing = grouped.get(row.checkId);
    if (existing === undefined) {
      grouped.set(row.checkId, [row]);
    } else {
      existing.push(row);
    }
  }
  return grouped;
}
