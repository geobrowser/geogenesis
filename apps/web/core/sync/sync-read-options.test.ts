import { QueryClient } from '@tanstack/react-query';

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllEntities, getBatchEntities } from '../io/queries';
import type { Entity } from '../types';
import { SyncEngine } from './engine';
import { E, syncFetchQuery } from './orm';
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
 * Two earlier versions of this file were vacuous, each in a way that looked covered:
 *
 * 1. They asserted the constant's value and that spreading it into `defaultQueryOptions` won —
 *    the behaviour of the thing written, not of the code using it. Deleting the spread from the
 *    production files left everything green.
 * 2. They then drove two real reads, which protected exactly those two. Six other spreads were
 *    still free to be dropped, and a *new* read added later would inherit the default by saying
 *    nothing at all.
 *
 * The opt-out is now a helper rather than a constant, so it cannot be dropped call site by call
 * site, and the last test below fails if a raw `fetchQuery` ever reappears in this layer.
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
    // A client configured the way the app configures it — what the sync layer must ignore.
    cache = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
  });

  it('ignores the client default, and a caller that tries to reintroduce it', async () => {
    const queryFn = vi.fn(async () => 'fresh');
    cache.setQueryData(['probe'], 'STALE');

    // `staleTime` is applied last inside the helper, so this override does not take.
    await syncFetchQuery(cache, { queryKey: ['probe'], queryFn, staleTime: 60_000 } as never);

    expect(queryFn).toHaveBeenCalled();
  });

  it('goes to the network for a batched id read even when the cache holds a fresh entry', async () => {
    const ids = ['entity-a', 'entity-b'];
    cache.setQueryData(['network', 'entities', ids, undefined], [makeEntity('entity-a', 'STALE')]);

    vi.mocked(getBatchEntities).mockImplementation((batchIds: string[]) =>
      Effect.succeed(batchIds.map(id => makeEntity(id, `FRESH ${id}`)))
    );

    const result = await E.syncMany({ store, cache, where: { id: { in: ids } }, first: ids.length });

    expect(getBatchEntities).toHaveBeenCalled();
    expect(result.merged.map(e => e.name)).toEqual(['FRESH entity-a', 'FRESH entity-b']);
  });

  it('goes to the network for an unfiltered page read even when the cache holds a fresh entry', async () => {
    vi.mocked(getAllEntities).mockReturnValue(
      Effect.succeed({ entities: [makeEntity('entity-c', 'FRESH')], endCursor: null, hasNextPage: false })
    );

    await E.syncMany({ store, cache, where: {}, first: 9 });
    const callsAfterFirst = vi.mocked(getAllEntities).mock.calls.length;
    await E.syncMany({ store, cache, where: {}, first: 9 });

    expect(vi.mocked(getAllEntities).mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('goes to the network for the engine batch sync even when the cache holds a fresh entry', async () => {
    // The engine's batch sync sits behind a private queue, so it is driven the way production
    // drives it: construct the engine, fire the event it subscribes to, let the batcher flush.
    const engineStream = { on: vi.fn(), emit: vi.fn() } as unknown as GeoEventStream;
    new SyncEngine(engineStream, cache, store);

    const hydrate = (engineStream.on as ReturnType<typeof vi.fn>).mock.calls.find(
      call => call[0] === GeoEventStream.HYDRATE
    )?.[1];
    // Guard against a silent pass if the engine stops subscribing.
    expect(hydrate).toBeTypeOf('function');

    cache.setQueryData(['entities-batch-sync', ['entity-a']], { 'entity-a': makeEntity('entity-a', 'STALE') });
    vi.mocked(getBatchEntities).mockImplementation((batchIds: string[]) =>
      Effect.succeed(batchIds.map(id => makeEntity(id, `FRESH ${id}`)))
    );

    hydrate({ type: GeoEventStream.HYDRATE, entities: ['entity-a'] });
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(getBatchEntities).toHaveBeenCalled();
  });

  it('leaves no read in the sync layer that could inherit the default', () => {
    // The one that covers the paths the tests above don't reach, and every path added later.
    // Driving each read individually protects only the reads someone thought to drive; this fails
    // the moment a raw `fetchQuery` appears anywhere in the layer, including in a new file.
    const dir = __dirname;
    const offences: string[] = [];

    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
      const contents = readFileSync(path.join(dir, entry.name), 'utf8');
      contents.split('\n').forEach((line, index) => {
        if (!/\.fetchQuery\(/.test(line)) return;
        // The single raw call inside the helper is the one that is meant to be there.
        if (/staleTime: 0/.test(line)) return;
        offences.push(`${entry.name}:${index + 1} — ${line.trim()}`);
      });
    }

    expect(offences).toEqual([]);
  });
});
