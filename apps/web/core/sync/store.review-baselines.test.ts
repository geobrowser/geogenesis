import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Entity, Relation, Value } from '~/core/types';

import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from './store';
import { GeoEventStream } from './stream';

vi.mock('./use-sync-engine', () => ({}));
vi.mock('./use-store', () => ({}));

const value: Value = {
  id: 'value',
  entity: { id: 'entity', name: null },
  property: { id: 'name', name: 'Name', dataType: 'TEXT' },
  value: 'Remote',
  spaceId: 'space',
  isLocal: false,
};
const entity: Entity = {
  id: 'entity',
  name: 'Remote',
  description: null,
  spaces: ['space'],
  types: [],
  values: [value],
  relations: [],
};
const relation: Relation = {
  id: 'relation',
  entityId: 'relation-entity',
  fromEntity: { id: 'entity', name: 'Remote' },
  toEntity: { id: 'target', name: null, value: '' },
  type: { id: 'type', name: null },
  renderableType: 'RELATION',
  spaceId: 'space',
  isLocal: false,
};
let stream: GeoEventStream;
let store: GeoStore;

beforeEach(() => {
  syncedEntities.clear();
  reactiveValues.set([]);
  reactiveRelations.set([]);
  stream = new GeoEventStream();
  store = new GeoStore(stream);
});

describe('review baseline knowledge and hydration', () => {
  it.each(['hydrateWith', 'seedFromServer', 'sync'] as const)(
    'a delayed absence result cannot overwrite a newer %s baseline',
    async writer => {
      if (writer === 'sync')
        stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: [entity], remoteEntities: [entity] });
      else store[writer]([entity]);
      await Promise.resolve();
      stream.emit({
        type: GeoEventStream.ENTITIES_SYNCED,
        entities: [],
        remoteEntities: [],
        confirmedAbsentEntityIds: ['entity'],
      });
      expect(syncedEntities.get('entity')).toEqual(entity);
    }
  );

  it.each(['values', 'relations'] as const)(
    'materializes %s from a later server seed after a filtered read',
    async kind => {
      const remote = {
        ...entity,
        values: kind === 'values' ? [value] : [],
        relations: kind === 'relations' ? [relation] : [],
      };
      stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: [], remoteEntities: [remote] });
      await Promise.resolve();
      expect(reactiveValues.get()).toEqual([]);
      expect(reactiveRelations.get()).toEqual([]);
      store.seedFromServer([remote]);
      expect(store.getEntity('entity')?.[kind]).toEqual(remote[kind]);
    }
  );

  it('does not replace local edits when seeding an unmaterialized baseline', async () => {
    reactiveValues.set([{ ...value, value: 'Local', isLocal: true, hasBeenPublished: false }]);
    stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: [], remoteEntities: [entity] });
    await Promise.resolve();
    store.seedFromServer([entity]);
    expect(store.getEntity('entity')?.values[0]?.value).toBe('Local');
  });
});
