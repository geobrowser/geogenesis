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
const ROOT = 'a19c345ab9866679b001d7d2138d88a1';
const CRYPTO = 'c9f267dcb0d270718c2a3c45a64afd32';

function value(propertyId: string, spaceId: string, text: string): Value {
  return {
    id: `value-${propertyId}-${spaceId}`,
    entity: { id: ENTITY_ID, name: null },
    property: { id: propertyId, name: null, dataType: 'TEXT' },
    value: text,
    spaceId,
    isDeleted: false,
    isLocal: false,
    hasBeenPublished: true,
  } as unknown as Value;
}

const named = (spaceId: string, text: string) => value(SystemIds.NAME_PROPERTY, spaceId, text);
const described = (spaceId: string, text: string) => value(SystemIds.DESCRIPTION_PROPERTY, spaceId, text);

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: ENTITY_ID,
    name: 'Aggregate name',
    description: 'Aggregate description',
    spaces: [ROOT],
    types: [],
    relations: [],
    values: [],
    ...overrides,
  };
}

/**
 * GEO-2778. `E.merge` is the other way a scoped read reaches a caller, and it had three separate
 * routes for the wrong space's wording to arrive by.
 */
describe('E.merge scopes name and description to the requested space', () => {
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
    expect(syncCallback).toBeTypeOf('function');
    syncCallback({ type: GeoEventStream.ENTITIES_SYNCED, entities: [seeded] });
    return Promise.resolve();
  }

  // The cold-store branch returned the remote entity untouched, and `EntityDtoLive` copies the
  // API's aggregate description — the graph's prose, not this space's.
  it('does not hand back the aggregate description when nothing is in the store yet', () => {
    const merged = E.merge({
      id: ENTITY_ID,
      spaceId: CRYPTO,
      store,
      mergeWith: entity({ values: [described(ROOT, 'Root description')] }),
    });

    expect(merged?.description).toBeNull();
  });

  it('still returns the aggregate name on a cold store, since a name may be borrowed', () => {
    const merged = E.merge({ id: ENTITY_ID, spaceId: CRYPTO, store, mergeWith: entity({ values: [] }) });

    expect(merged?.name).toBe('Aggregate name');
  });

  it('leaves an unscoped cold read alone', () => {
    const remote = entity({ values: [described(ROOT, 'Root description')] });
    const merged = E.merge({ id: ENTITY_ID, store, mergeWith: remote });

    expect(merged?.description).toBe('Aggregate description');
  });

  // The local entity was read *scoped*, so the merged pool held only the requested space and the
  // cross-space fallback had nothing to fall back to.
  it('borrows a name from another locally-loaded space', async () => {
    await seedStore(entity({ name: null, description: null, values: [named(ROOT, 'Root wording')] }));

    const merged = E.merge({
      id: ENTITY_ID,
      spaceId: CRYPTO,
      store,
      mergeWith: entity({ name: null, description: null, values: [] }),
    });

    expect(merged?.name).toBe('Root wording');
  });

  it('never borrows a description that way', async () => {
    await seedStore(entity({ name: null, description: null, values: [described(ROOT, 'Root description')] }));

    const merged = E.merge({
      id: ENTITY_ID,
      spaceId: CRYPTO,
      store,
      mergeWith: entity({ name: null, description: null, values: [] }),
    });

    expect(merged?.description).toBeNull();
  });

  // A space-scoped response carries no other space's name triples, so when those were never
  // hydrated locally the aggregate is the only fallback left.
  it('falls back to the remote aggregate name when no triples survive the scope', async () => {
    await seedStore(entity({ name: null, description: null, values: [] }));

    const merged = E.merge({
      id: ENTITY_ID,
      spaceId: CRYPTO,
      store,
      mergeWith: entity({ values: [] }),
    });

    expect(merged?.name).toBe('Aggregate name');
  });

  // `localEntity` is read with tombstones so a pending local deletion masks the remote value. The
  // aggregate fallback must not undo that: the reader deleted the name, and handing back the
  // server's pre-deletion one would reverse their edit in front of them.
  it('does not resurrect a name the reader deleted locally', async () => {
    const deleted = { ...named(CRYPTO, 'Crypto wording'), isDeleted: true } as unknown as Value;
    await seedStore(entity({ name: null, description: null, values: [deleted] }));

    const merged = E.merge({
      id: ENTITY_ID,
      spaceId: CRYPTO,
      store,
      mergeWith: entity({ values: [named(CRYPTO, 'Crypto wording')] }),
    });

    expect(merged?.name).toBeNull();
  });

  it('prefers the requested space over both', async () => {
    await seedStore(entity({ name: null, description: null, values: [named(CRYPTO, 'Crypto wording')] }));

    const merged = E.merge({
      id: ENTITY_ID,
      spaceId: CRYPTO,
      store,
      mergeWith: entity({ values: [named(ROOT, 'Root wording')] }),
    });

    expect(merged?.name).toBe('Crypto wording');
  });
});
