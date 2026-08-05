import { describe, expect, it, vi } from 'vitest';

import { createValueId } from '../id/create-id';
import { Relation, Value } from '../types';
import { GeoStore, reactiveRelations, reactiveValues } from './store';
import { GeoEventStream } from './stream';

// Mock external dependencies to avoid circular imports (mirrors store.test.ts).
vi.mock('./use-sync-engine.tsx', () => ({}));
vi.mock('./use-store.tsx', () => ({}));

const PENDING = 'pending:topic-1';
const REAL = 'real-space-1';

function pendingValue(): Value {
  return {
    id: createValueId({ entityId: 'topic-1', propertyId: 'name', spaceId: PENDING }),
    entity: { id: 'topic-1', name: null },
    property: { id: 'name', name: 'Name', dataType: 'TEXT' },
    value: 'Ada',
    spaceId: PENDING,
    timestamp: '2023-01-01T00:00:00Z',
    isDeleted: false,
    isLocal: true,
    hasBeenPublished: false,
  };
}

function pendingRelation(): Relation {
  return {
    id: 'relation-uuid-1',
    entityId: 'topic-1',
    type: { id: 'types', name: 'Types' },
    fromEntity: { id: 'topic-1', name: null },
    toEntity: { id: 'person', name: 'Person', value: 'person' },
    renderableType: 'RELATION',
    position: '1',
    verified: false,
    spaceId: PENDING,
    timestamp: '2023-01-01T00:00:00Z',
    isDeleted: false,
    isLocal: true,
    hasBeenPublished: false,
  };
}

describe('GeoStore.remapSpaceId', () => {
  it('rewrites value id + spaceId, swaps relation spaceId (id unchanged), and drops the old value id', () => {
    reactiveValues.set(() => [pendingValue()]);
    reactiveRelations.set(() => [pendingRelation()]);

    const store = new GeoStore(new GeoEventStream());
    store.remapSpaceId(PENDING, REAL);

    const values = reactiveValues.get();
    expect(values).toHaveLength(1);
    expect(values[0].spaceId).toBe(REAL);
    expect(values[0].id).toBe(createValueId({ entityId: 'topic-1', propertyId: 'name', spaceId: REAL }));
    // Old id (and any lingering pending: spaceId) is gone.
    expect(values.some(v => v.spaceId === PENDING)).toBe(false);
    expect(
      values.some(v => v.id === createValueId({ entityId: 'topic-1', propertyId: 'name', spaceId: PENDING }))
    ).toBe(false);

    const relations = reactiveRelations.get();
    expect(relations).toHaveLength(1);
    expect(relations[0].id).toBe('relation-uuid-1'); // uuid, unchanged
    expect(relations[0].spaceId).toBe(REAL);
  });

  it('leaves values/relations from other spaces untouched', () => {
    const other: Value = { ...pendingValue(), id: 'other', spaceId: 'some-other-space' };
    reactiveValues.set(() => [pendingValue(), other]);
    reactiveRelations.set(() => []);

    const store = new GeoStore(new GeoEventStream());
    store.remapSpaceId(PENDING, REAL);

    const values = reactiveValues.get();
    expect(values.find(v => v.id === 'other')?.spaceId).toBe('some-other-space');
    expect(values.some(v => v.spaceId === REAL)).toBe(true);
  });
});
