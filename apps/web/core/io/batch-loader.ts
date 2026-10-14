/**
 * Coalesce per-key loads made in the same tick into batched fetches.
 *
 * Components ask for one key each (one card's follower count, one card's space type) so each can be
 * cached on its own React Query key; a list mounts many of them in one commit, so their loads all
 * land before the next microtask and go out as `fetchBatch` calls of at most `maxBatchSize` keys.
 *
 * `fetchBatch` resolves a value per key it knows. A key it leaves out resolves as `missing(key)`, or
 * rejects with what `missing` throws, without touching the rest of the batch. A rejected batch
 * rejects every load in it.
 */
export function createBatchLoader<V>({
  fetchBatch,
  missing,
  maxBatchSize,
}: {
  fetchBatch: (keys: string[]) => Promise<ReadonlyMap<string, V>>;
  missing: (key: string) => V;
  maxBatchSize: number;
}): (key: string) => Promise<V> {
  type Waiter = { resolve: (value: V) => void; reject: (error: unknown) => void };
  let queued: Map<string, Waiter[]> | null = null;

  const flush = () => {
    const batch = queued;
    queued = null;
    if (!batch) return;

    const keys = [...batch.keys()];
    for (let start = 0; start < keys.length; start += maxBatchSize) {
      const chunk = keys.slice(start, start + maxBatchSize);
      fetchBatch(chunk).then(
        values => {
          for (const key of chunk) {
            const waiters = batch.get(key) ?? [];
            let value: V;
            try {
              value = values.has(key) ? (values.get(key) as V) : missing(key);
            } catch (error) {
              for (const waiter of waiters) waiter.reject(error);
              continue;
            }
            for (const waiter of waiters) waiter.resolve(value);
          }
        },
        error => {
          for (const key of chunk) for (const waiter of batch.get(key) ?? []) waiter.reject(error);
        }
      );
    }
  };

  return key =>
    new Promise<V>((resolve, reject) => {
      if (!queued) {
        queued = new Map();
        queueMicrotask(flush);
      }
      queued.set(key, [...(queued.get(key) ?? []), { resolve, reject }]);
    });
}
