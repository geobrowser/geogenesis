/**
 * A small per-instance cache of in-flight and settled promises, for server reads that are
 * expensive and identical across visitors.
 *
 * - Concurrent callers of one key share one load, so a burst of visitors runs the query once.
 * - A settled result is reused until `ttlMs` has passed since the load started.
 * - A rejected load is dropped, so a failure is never served to the next caller.
 * - At most `maxEntries` keys are held, least recently used evicted first.
 *
 * Per server instance and therefore best-effort on serverless. Never hand `load` a single
 * request's abort signal: the promise is shared, and one caller going away would reject it for
 * everybody waiting on it.
 */
export function createPromiseTtlCache<T>({ ttlMs, maxEntries }: { ttlMs: number; maxEntries: number }) {
  const entries = new Map<string, { expiresAtMs: number; promise: Promise<T> }>();

  return {
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const cached = entries.get(key);
      if (cached && cached.expiresAtMs > now) {
        // Refresh insertion order so the size bound evicts the least recently used key.
        entries.delete(key);
        entries.set(key, cached);
        return cached.promise;
      }
      if (cached) entries.delete(key);

      for (const [cachedKey, entry] of entries) {
        if (entry.expiresAtMs <= now) entries.delete(cachedKey);
      }

      const promise = load();
      entries.set(key, { expiresAtMs: now + ttlMs, promise });
      while (entries.size > maxEntries) {
        const oldestKey = entries.keys().next().value;
        if (typeof oldestKey !== 'string') break;
        entries.delete(oldestKey);
      }

      try {
        return await promise;
      } catch (error) {
        if (entries.get(key)?.promise === promise) entries.delete(key);
        throw error;
      }
    },
    clear() {
      entries.clear();
    },
  };
}
