import { SystemIds } from '@geoprotocol/geo-sdk';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Value } from '../types';
import { E } from './orm';
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
const ENTITY_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPACE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function nameValue(name: string): Value {
  return {
    id: `value-${ENTITY_ID}`,
    entity: { id: ENTITY_ID, name },
    property: { id: SystemIds.NAME_PROPERTY, name: 'Name', dataType: 'TEXT' },
    value: name,
    spaceId: SPACE_ID,
    timestamp: '2026-01-01T00:00:00Z',
    isDeleted: false,
    isLocal: false,
    hasBeenPublished: true,
  };
}

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: ENTITY_ID,
    name: 'Entity',
    description: null,
    spaces: [SPACE_ID],
    types: [],
    relations: [],
    values: [nameValue('Entity')],
    ...overrides,
  };
}

/**
 * `E.merge` rebuilds an entity from merged values and relations when it exists both locally and
 * remotely. Everything it returns is derived from those — except server metadata, which has no
 * local counterpart and is simply dropped unless carried explicitly.
 *
 * That matters because consumers read a missing timestamp as "not hydrated yet" and fall back to
 * their own per-row fetch, which is the N+1 batched hydration exists to remove. The fields being
 * selected by the query is not enough on its own: they have to survive the merge to reach the
 * store, and the only entities that take this branch are the ones already in it.
 */
describe('E.merge preserves server metadata', () => {
  let store: GeoStore;

  beforeEach(() => {
    vi.clearAllMocks();
    reactiveValues.set([]);
    reactiveRelations.set([]);
    syncedEntities.clear();
    store = new GeoStore(mockStream);
  });

  function seedStore(seeded: Entity) {
    const syncCallback = (mockStream.on as ReturnType<typeof vi.fn>).mock.calls.find(
      call => call[0] === GeoEventStream.ENTITIES_SYNCED
    )?.[1];
    // Guard against a silent pass if GeoStore stops registering the listener.
    expect(syncCallback).toBeTypeOf('function');
    syncCallback({ type: GeoEventStream.ENTITIES_SYNCED, entities: [seeded] });
    return Promise.resolve();
  }

  it('keeps the remote timestamps when the entity is already in the store', async () => {
    await seedStore(entity());

    const merged = E.merge({
      id: ENTITY_ID,
      store,
      mergeWith: entity({ createdAt: '1700000000', updatedAt: '1800000000' }),
    });

    expect(merged?.createdAt).toBe('1700000000');
    expect(merged?.updatedAt).toBe('1800000000');
  });

  it('falls back to the local copy when the remote has none', async () => {
    await seedStore(entity({ createdAt: '1600000000', updatedAt: '1650000000' }));

    const merged = E.merge({ id: ENTITY_ID, store, mergeWith: entity() });

    expect(merged?.createdAt).toBe('1600000000');
    expect(merged?.updatedAt).toBe('1650000000');
  });
});
