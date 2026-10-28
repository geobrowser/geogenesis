import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from '~/core/sync/store';
import { GeoEventStream } from '~/core/sync/stream';
import type { Relation, Value } from '~/core/types';

import { useNetChanges } from './use-net-changes';

// Match the store tests: avoid the provider's circular imports while exercising the real store.
vi.mock('~/core/sync/use-sync-engine', () => ({}));
vi.mock('~/core/sync/use-store', () => ({}));

const stream = new GeoEventStream();
const store = new GeoStore(stream);

afterEach(cleanup);

const value: Value = {
  id: 'personal-name',
  entity: { id: 'profile', name: null },
  property: { id: 'name', name: 'Name', dataType: 'TEXT' },
  value: 'Alice',
  spaceId: 'personal',
  isLocal: true,
  hasBeenPublished: false,
};

const relation: Relation = {
  id: 'personal-type',
  entityId: 'personal-type-entity',
  type: { id: 'types', name: 'Types' },
  fromEntity: { id: 'profile', name: null },
  toEntity: { id: 'person', name: null, value: '' },
  renderableType: 'RELATION',
  spaceId: 'personal',
  isLocal: true,
  hasBeenPublished: false,
};

function hydrateBaseline(values: Value[], relations: Relation[]) {
  store.hydrateWith([
    {
      id: 'profile',
      name: null,
      description: null,
      types: [],
      spaces: ['personal'],
      values,
      relations,
    },
  ]);
}

beforeEach(() => {
  syncedEntities.clear();
  reactiveValues.set([]);
  reactiveRelations.set([]);
});

describe('useNetChanges', () => {
  it('updates both review surfaces when remote hydration proves personal edits unchanged', () => {
    const publicEdit = { ...value, id: 'public-name', spaceId: 'public' };
    reactiveValues.set([value, publicEdit]);
    reactiveRelations.set([relation]);
    const flowBar = renderHook(useNetChanges);
    const review = renderHook(useNetChanges);
    expect(review.result.current.values).toEqual([value, publicEdit]);

    act(() => hydrateBaseline([{ ...value, isLocal: false }], [{ ...relation, isLocal: false }]));

    expect(review.result.current).toEqual({ values: [publicEdit], relations: [], spaceIds: ['public'] });
    expect(flowBar.result.current).toBe(review.result.current);
  });

  it('retains persisted deletions before hydration and removes only confirmed canceled creations', () => {
    const deletedValue = { ...value, isDeleted: true };
    const deletedRelation = { ...relation, isDeleted: true };
    reactiveValues.set([deletedValue]);
    reactiveRelations.set([deletedRelation]);
    const { result } = renderHook(useNetChanges);
    expect(result.current).toEqual({ values: [deletedValue], relations: [deletedRelation], spaceIds: ['personal'] });

    act(() => hydrateBaseline([{ ...value, isLocal: false }], [{ ...relation, isLocal: false }]));
    expect(result.current).toEqual({ values: [deletedValue], relations: [deletedRelation], spaceIds: ['personal'] });

    act(() =>
      hydrateBaseline(
        [{ ...value, id: 'description', property: { ...value.property, id: 'description' }, isLocal: false }],
        []
      )
    );
    expect(result.current).toEqual({ values: [], relations: [], spaceIds: [] });
  });

  it('excludes remote and already published operations from review', () => {
    reactiveValues.set([
      value,
      { ...value, id: 'remote', isLocal: false },
      { ...value, id: 'published', hasBeenPublished: true },
    ]);
    reactiveRelations.set([
      relation,
      { ...relation, id: 'remote', isLocal: false },
      { ...relation, id: 'published', hasBeenPublished: true },
    ]);
    const { result } = renderHook(useNetChanges);
    expect(result.current).toEqual({ values: [value], relations: [relation], spaceIds: ['personal'] });
  });

  it.each(['values', 'relations'] as const)(
    'keeps a space reviewable when its only deletion is outside partial %s',
    kind => {
      const deletedValue = { ...value, isDeleted: true };
      const deletedRelation = { ...relation, isDeleted: true };
      if (kind === 'values') reactiveValues.set([deletedValue]);
      else reactiveRelations.set([deletedRelation]);
      const { result } = renderHook(useNetChanges);
      const baseline = {
        id: 'profile',
        name: null,
        description: null,
        types: [],
        spaces: ['personal'],
        values: [],
        relations: [],
      };

      act(() => store.hydrateWith([{ ...baseline, valuesComplete: false, relationsComplete: false }]));
      expect(result.current.spaceIds).toEqual(['personal']);
      expect(result.current[kind]).toEqual([kind === 'values' ? deletedValue : deletedRelation]);

      act(() => store.hydrateWith([{ ...baseline, valuesComplete: true, relationsComplete: true }]));
      expect(result.current.spaceIds).toEqual([]);
    }
  );

  it('removes canceled creations when sync supplies an empty remote baseline', async () => {
    const deletedValue = { ...value, isDeleted: true };
    const deletedRelation = { ...relation, isDeleted: true };
    reactiveValues.set([deletedValue]);
    reactiveRelations.set([deletedRelation]);
    const { result } = renderHook(useNetChanges);
    expect(result.current.spaceIds).toEqual(['personal']);

    const entity = {
      id: 'profile',
      name: null,
      description: null,
      types: [],
      spaces: ['personal'],
      values: [deletedValue],
      relations: [deletedRelation],
    };
    await act(async () => {
      stream.emit({
        type: GeoEventStream.ENTITIES_SYNCED,
        entities: [entity],
        remoteEntities: [{ ...entity, values: [], relations: [] }],
      });
    });
    expect(result.current).toEqual({ values: [], relations: [], spaceIds: [] });
  });

  it.each(['hydrateWith', 'sync'] as const)(
    'observes an empty baseline from %s with no incoming operations',
    async source => {
      reactiveValues.set([{ ...value, isDeleted: true }]);
      reactiveRelations.set([{ ...relation, isDeleted: true }]);
      const { result } = renderHook(useNetChanges);
      expect(result.current.spaceIds).toEqual(['personal']);
      const empty = { id: 'profile', name: null, description: null, types: [], spaces: [], values: [], relations: [] };
      await act(async () => {
        if (source === 'hydrateWith') store.hydrateWith([empty]);
        else stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: [empty], remoteEntities: [empty] });
      });
      expect(result.current).toEqual({ values: [], relations: [], spaceIds: [] });
    }
  );

  it('observes confirmed absence without inventing a materialized entity', async () => {
    reactiveValues.set([{ ...value, isDeleted: true }]);
    reactiveRelations.set([{ ...relation, isDeleted: true }]);
    const { result } = renderHook(useNetChanges);
    expect(result.current.spaceIds).toEqual(['personal']);
    await act(async () => {
      stream.emit({
        type: GeoEventStream.ENTITIES_SYNCED,
        entities: [],
        remoteEntities: [],
        confirmedAbsentEntityIds: ['profile'],
      });
    });
    expect(result.current).toEqual({ values: [], relations: [], spaceIds: [] });
    expect(store.getEntity('profile')).toBeUndefined();
  });
});
