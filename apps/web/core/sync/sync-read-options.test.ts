import { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllEntities, getBatchEntities } from '../io/queries';
import type { Entity } from '../types';
import { SyncEngine } from './engine';
import { E, SYNC_READ_OPTIONS } from './orm';
import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from './store';
import { GeoEventStream } from './stream';

vi.mock('./use-sync-engine.tsx', () => ({}));
vi.mock('./use-store.tsx', () => ({}));
vi.mock('../database/entities', () => ({ readTypes: () => [] }));
vi.mock('../io/queries', () => ({
  ENTITY_ID_BATCH_SIZE: 50,
  getAllEntities: vi.fn(),
  getBatchEntities: vi.fn(),
  getBatchEntitySpaces: vi.fn(),
  getEntitiesOrderedByPropertyConnection: vi.fn(),
  getEntity: vi.fn(),
  getEntityNames: vi.fn(),
  getRelation: vi.fn(),
  getResultsPage: vi.fn(),
  getSpaces: vi.fn(),
  hasDefaultSearchExcludedType: vi.fn(),
}));

const mockStream = { on: vi.fn(), emit: vi.fn() } as unknown as GeoEventStream;

function makeEntity(id: string, name: string): Entity {
  return { id, name, description: null, spaces: ['space-1'], types: [], relations: [], values: [] };
}

/**
 * The app's `QueryClient` sets a global `staleTime`, which is right for `useQuery` — it decides
 * whether a mount or a focus refetches. The same setting also governs `fetchQuery`, where it
 * decides something different in kind: whether a deliberate read issues a request at all.
 *
 * The sync layer must not inherit it. A sync answered from cache is one that returns pre-write
 * data, and nothing renders differently when that happens.
 *
 * The first version of this file asserted the constant's value and that spreading it into
 * `defaultQueryOptions` won — which is testing the thing that was written rather than the thing
 * that matters. Deleting `...SYNC_READ_OPTIONS` from `orm.ts` or `engine.ts` left every one of
 * those tests green. These drive the real reads instead.
 */
describe('sync reads opt out of the global staleTime', () => {
  let store: GeoStore;
  let cache: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    reactiveValues.set([]);
    reactiveRelations.set([]);
    syncedEntities.clear();
    store = new GeoStore(mockStream);
    // A client configured the way the app configures it — this is what the sync layer must ignore.
    cache = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
  });

  it('goes to the network for a batched id read even when the cache holds a fresh entry', async () => {
    const ids = ['entity-a', 'entity-b'];
    // Seed the exact key the batched read uses, with data that must NOT be served.
    cache.setQueryData(['network', 'entities', ids, undefined], [makeEntity('entity-a', 'STALE')]);

    vi.mocked(getBatchEntities).mockImplementation((batchIds: string[]) =>
      Effect.succeed(batchIds.map(id => makeEntity(id, `FRESH ${id}`)))
    );

    const result = await E.syncMany({ store, cache, where: { id: { in: ids } }, first: ids.length });

    // The request happened at all — this is what a 30s window would have skipped.
    expect(getBatchEntities).toHaveBeenCalled();
    // And the fresh value is what came back, not the seeded one.
    expect(result.merged.map(e => e.name)).toEqual(['FRESH entity-a', 'FRESH entity-b']);
  });

  it('goes to the network for an unfiltered page read even when the cache holds a fresh entry', async () => {
    vi.mocked(getAllEntities).mockReturnValue(
      Effect.succeed({ entities: [makeEntity('entity-c', 'FRESH')], endCursor: null, hasNextPage: false })
    );

    // Two identical reads back to back. Under an inherited 30s window the second is served from
    // cache and never calls the network.
    await E.syncMany({ store, cache, where: {}, first: 9 });
    const callsAfterFirst = vi.mocked(getAllEntities).mock.calls.length;
    await E.syncMany({ store, cache, where: {}, first: 9 });

    expect(vi.mocked(getAllEntities).mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('passes staleTime 0 on every sync-layer fetchQuery', async () => {
    // Covers the reads that are awkward to drive end to end — notably the engine's batch sync,
    // which sits behind a private queue. Asserting on the options each call actually receives
    // fails the moment a `...SYNC_READ_OPTIONS` is dropped anywhere.
    const fetchQuerySpy = vi.spyOn(cache, 'fetchQuery');
    vi.mocked(getBatchEntities).mockImplementation((batchIds: string[]) =>
      Effect.succeed(batchIds.map(id => makeEntity(id, id)))
    );

    await E.syncMany({ store, cache, where: { id: { in: ['entity-a'] } }, first: 1 });

    expect(fetchQuerySpy).toHaveBeenCalled();
    for (const [options] of fetchQuerySpy.mock.calls) {
      expect(options.staleTime, `fetchQuery for ${JSON.stringify(options.queryKey)}`).toBe(0);
    }
  });


  it('goes to the network for the engine batch sync even when the cache holds a fresh entry', async () => {
    // The engine's batch sync sits behind a private queue, so it is driven the way production
    // drives it: construct the engine, fire the event it subscribes to, let the batcher flush.
    // Without this, dropping `...SYNC_READ_OPTIONS` from engine.ts leaves every other test green.
    const engineStream = { on: vi.fn(), emit: vi.fn() } as unknown as GeoEventStream;
    new SyncEngine(engineStream, cache, store);

    const hydrate = (engineStream.on as ReturnType<typeof vi.fn>).mock.calls.find(
      call => call[0] === GeoEventStream.HYDRATE
    )?.[1];
    // Guard against a silent pass if the engine stops subscribing.
    expect(hydrate).toBeTypeOf('function');

    // Seed the exact key the batch sync uses, with data that must NOT be served.
    cache.setQueryData(['entities-batch-sync', ['entity-a']], { 'entity-a': makeEntity('entity-a', 'STALE') });

    vi.mocked(getBatchEntities).mockImplementation((batchIds: string[]) =>
      Effect.succeed(batchIds.map(id => makeEntity(id, `FRESH ${id}`)))
    );

    hydrate({ type: GeoEventStream.HYDRATE, entities: ['entity-a'] });
    // The batcher waits 100ms before flushing.
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(getBatchEntities).toHaveBeenCalled();
  });

  it('exports the options the sync layer spreads', () => {
    expect(SYNC_READ_OPTIONS.staleTime).toBe(0);
  });
});
