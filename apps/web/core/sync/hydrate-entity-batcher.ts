import { QueryClient } from '@tanstack/react-query';

import type { Entity } from '../types';
import { E } from './orm';
import { GeoStore } from './store';
import { GeoEventStream } from './stream';

/**
 * Coalesces `useHydrateEntity` into the batched read that already exists.
 *
 * `useHydrateEntity` hydrates one entity per call, and it is reached from ~48 call sites through
 * `useQueryEntity` — so a page that renders 42 rows issues 42 singular `Entity` requests. That was
 * 42 of 132 requests on an entity page and 66 of 206 on explore, all for data one `EntitiesBatch`
 * could return.
 *
 * `useHydrateEntities` is the plural sibling and already does the right thing via `syncMany`. The
 * problem was never a missing endpoint, only that the singular path never reached it.
 *
 * Collecting ids here rather than hoisting the work into each parent means every existing call site
 * keeps its per-entity interface, and rows that mount independently — virtualised lists, cards
 * added as a feed pages in — still share a request. Hoisting would have meant changing each parent
 * and would not have helped rows that mount late.
 */

/**
 * Mirrors `relationsList(first: 1000)` in `entitiesBatchQuery`. The batched read caps there and
 * does not paginate, while the singular `getEntity` drains its paginated `relations` connection to
 * completion — deliberately, so hydration is correct for entities with any number of relations.
 *
 * Batching without accounting for that would silently drop relations past the cap. An entity over
 * the cap is therefore topped up through the draining path, so the common case costs one request
 * and only genuinely large entities pay for themselves.
 *
 * Compared against `relationsTotalCount`, never against `relations.length`. The decoded array is
 * filtered — `hasRelationTarget` drops dangling relations — so a capped page containing a single
 * dangling one decodes to 999 and would read as complete. The count comes straight from the
 * server's own total and is not filtered.
 */
const BATCH_RELATIONS_CAP = 1000;

type Waiter = {
  resolve: (entity: Entity | null) => void;
  reject: (error: unknown) => void;
};

type PendingBatch = {
  waiters: Map<string, Waiter[]>;
  timer: ReturnType<typeof setTimeout> | null;
};

/**
 * Keyed on the QueryClient so batches can never mix two engines — the app has one, but tests build
 * their own and would otherwise resolve each other's ids.
 */
const pendingByCache = new WeakMap<QueryClient, PendingBatch>();

export type HydrateEntityArgs = {
  id: string;
  store: GeoStore;
  cache: QueryClient;
  stream: GeoEventStream;
};

export function hydrateEntityBatched({ id, store, cache, stream }: HydrateEntityArgs): Promise<Entity | null> {
  return new Promise<Entity | null>((resolve, reject) => {
    const batch = pendingByCache.get(cache) ?? { waiters: new Map(), timer: null };
    pendingByCache.set(cache, batch);

    const waiters = batch.waiters.get(id) ?? [];
    waiters.push({ resolve, reject });
    batch.waiters.set(id, waiters);

    if (batch.timer !== null) return;

    // A zero-delay macrotask, deliberately: it collects everything queued by the current render
    // commit and the microtasks after it, without adding a wait that would delay first paint. A
    // longer window would catch more stragglers at the cost of the thing this is meant to improve.
    batch.timer = setTimeout(() => flush(cache, store, stream), 0);
  });
}

async function flush(cache: QueryClient, store: GeoStore, stream: GeoEventStream) {
  const batch = pendingByCache.get(cache);
  if (!batch) return;

  pendingByCache.delete(cache);
  batch.timer = null;

  const ids = [...batch.waiters.keys()];
  if (ids.length === 0) return;

  let merged: Entity[];
  let remote: Entity[];

  try {
    /**
     * `spaceId` is deliberately omitted, matching the singular path this replaces: the sync engine
     * filters by space as it receives events, so hydrating space-scoped here would narrow what
     * lands in the store.
     */
    ({ merged, remote } = await E.syncMany({
      store,
      cache,
      where: { id: { in: ids } },
      first: ids.length,
    }));
  } catch (error) {
    // Batching makes failure shared where it used to be per entity. Each waiter is rejected
    // separately so react-query still handles them independently — one row's retry and error state
    // stay its own, rather than the batch failing as a single unit no caller can recover from.
    for (const waiters of batch.waiters.values()) {
      for (const waiter of waiters) waiter.reject(error);
    }
    return;
  }

  if (merged.length > 0) {
    // One event for the batch rather than one per entity. The store's listener already takes an
    // array, and `syncMany` returns the raw remotes alongside so the synced baseline stays clean.
    stream.emit({
      type: GeoEventStream.ENTITIES_SYNCED,
      entities: merged,
      remoteEntities: remote,
    });
  }

  const mergedById = new Map(merged.map(entity => [entity.id, entity]));

  // Anything at the cap may have had relations dropped and needs the draining singular read.
  const truncatedIds = new Set(
    remote.filter(entity => (entity.relationsTotalCount ?? 0) > BATCH_RELATIONS_CAP).map(entity => entity.id)
  );

  /**
   * Settled now, not after the top-ups.
   *
   * Awaiting every top-up before resolving anything would hold back ids that needed nothing — their
   * data has already arrived — so `useQueryEntity` would keep `isLoading` true on unrelated rows
   * until the slowest capped entity finished, and one stalled top-up would stall the whole batch.
   * The singular queries this replaced settled independently, and so do these.
   */
  for (const [entityId, waiters] of batch.waiters) {
    if (truncatedIds.has(entityId)) continue;
    const entity = mergedById.get(entityId) ?? null;
    for (const waiter of waiters) waiter.resolve(entity);
  }

  // Each capped entity then settles on its own, as its own top-up finishes.
  for (const entityId of truncatedIds) {
    const waiters = batch.waiters.get(entityId) ?? [];

    void E.syncOne({ id: entityId, store, cache })
      .then(result => {
        if (!result?.merged) {
          // Nothing better came back; the batch result is still the best answer available.
          for (const waiter of waiters) waiter.resolve(mergedById.get(entityId) ?? null);
          return;
        }

        /**
         * Emitted, not just returned. `syncOne` hands back the entity without writing it anywhere,
         * and the store is only ever updated by this event — `useQueryEntity` reads
         * `store.getEntity(...)` rather than the value this promise resolves with. Without the emit
         * the complete relation set would reach the caller and nothing else, leaving the store and
         * its synced baseline holding the truncated version emitted for the batch.
         */
        stream.emit({
          type: GeoEventStream.ENTITIES_SYNCED,
          entities: [result.merged],
          remoteEntities: result.remote ? [result.remote] : [],
        });

        for (const waiter of waiters) waiter.resolve(result.merged);
      })
      .catch(error => {
        /**
         * A failed top-up is a failure, not a degraded success. Resolving with the known-truncated
         * batch result would mark the query successful, and React Query does not retry a success —
         * the entity would stay incomplete for as long as the entry is cached, with nothing to
         * signal it. The singular path this replaced threw, and the row's own retry repaired it.
         *
         * Only this id is affected; the rest of the batch has already resolved above.
         */
        for (const waiter of waiters) waiter.reject(error);
      });
  }
}
