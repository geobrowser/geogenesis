import { SystemIds } from '@geoprotocol/geo-sdk';
import { QueryClient } from '@tanstack/react-query';

import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllEntities, getBatchEntities } from '../io/queries';
import type { Entity, Value } from '../types';
import { E } from './orm';
import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from './store';
import { GeoEventStream } from './stream';

// Mock external dependencies to avoid circular imports
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

const mockStream = {
  on: vi.fn(),
  emit: vi.fn(),
} as unknown as GeoEventStream;

function makeNameValue(entityId: string, name: string): Value {
  return {
    id: `value-${entityId}`,
    entity: { id: entityId, name },
    property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
    value: name,
    spaceId: 'space-1',
    timestamp: '2026-01-01T00:00:00Z',
    isDeleted: false,
    isLocal: false,
    hasBeenPublished: true,
  };
}

function makeEntity(id: string, name: string): Entity {
  return {
    id,
    name,
    description: null,
    spaces: ['space-1'],
    types: [],
    relations: [],
    values: [makeNameValue(id, name)],
  };
}

describe('E.syncMany pagination', () => {
  let store: GeoStore;
  let cache: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    reactiveValues.set([]);
    reactiveRelations.set([]);
    syncedEntities.clear();
    store = new GeoStore(mockStream);
    cache = new QueryClient();
  });

  it('returns only the requested page when entities from other pages are in the local store (GEO-2181)', async () => {
    // Simulate page 1 having been viewed: its entities are synced into the store.
    const pageOne = [makeEntity('entity-a', 'Entity A'), makeEntity('entity-b', 'Entity B')];
    const syncCallback = (mockStream.on as ReturnType<typeof vi.fn>).mock.calls.find(
      call => call[0] === GeoEventStream.ENTITIES_SYNCED
    )?.[1];
    // Guard against the test silently passing if GeoStore stops registering the listener.
    expect(syncCallback).toBeTypeOf('function');
    syncCallback({ type: GeoEventStream.ENTITIES_SYNCED, entities: pageOne });
    // Store hydration is batched via queueMicrotask
    await Promise.resolve();

    const pageTwo = [makeEntity('entity-c', 'Entity C'), makeEntity('entity-d', 'Entity D')];
    vi.mocked(getAllEntities).mockReturnValue(
      Effect.succeed({ entities: pageTwo, endCursor: 'cursor-d', hasNextPage: false })
    );

    const result = await E.syncMany({ store, cache, where: {}, first: 9, after: 'cursor-b' });

    expect(result.merged.map(e => e.id)).toEqual(['entity-c', 'entity-d']);
    expect(result.endCursor).toBe('cursor-d');
    expect(result.hasNextPage).toBe(false);
  });

  it('dedupes entities repeated within a single remote page', async () => {
    const duplicated = makeEntity('entity-c', 'Entity C');
    vi.mocked(getAllEntities).mockReturnValue(
      Effect.succeed({ entities: [duplicated, duplicated], endCursor: null, hasNextPage: false })
    );

    const result = await E.syncMany({ store, cache, where: {}, first: 9 });

    expect(result.merged.map(e => e.id)).toEqual(['entity-c']);
  });

  it('hydrates large id.in queries in bounded batches while preserving requested order', async () => {
    const ids = Array.from({ length: 117 }, (_, index) => `entity-${index}`);
    vi.mocked(getBatchEntities).mockImplementation((batchIds: string[]) =>
      Effect.succeed(batchIds.map(id => makeEntity(id, `Entity ${id}`)))
    );

    const result = await E.syncMany({
      store,
      cache,
      where: { id: { in: ids } },
      first: ids.length,
    });

    expect(vi.mocked(getBatchEntities).mock.calls.map(call => call[0].length)).toEqual([50, 50, 17]);
    expect(result.merged.map(e => e.id)).toEqual(ids);
    expect(result.remote).toHaveLength(ids.length);
  });
});
