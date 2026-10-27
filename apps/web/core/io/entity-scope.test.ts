import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getNetRelations, getNetValues } from '~/core/review/net-changes';
import { GeoStore, reactiveRelations, reactiveValues, syncedEntities } from '~/core/sync/store';
import { GeoEventStream } from '~/core/sync/stream';
import type { Relation, Value } from '~/core/types';

import {
  getAllEntities,
  getBatchEntities,
  getEntitiesOrderedByPropertyConnection,
  getEntity,
  getEntityPage,
  getRelation,
} from './queries';
import { SortOrder } from './sort-order';

const query = vi.hoisted(() => vi.fn());
vi.mock('./graphql-client', () => ({ graphql: (...args: unknown[]) => query(...args) }));
vi.mock('~/core/sync/use-sync-engine', () => ({}));
vi.mock('~/core/sync/use-store', () => ({}));

const id = '11111111111111111111111111111111';
const spaceA = '22222222222222222222222222222222';
const spaceB = '33333333333333333333333333333333';
const raw = {
  id,
  name: 'Entity',
  description: null,
  types: [],
  spaceIds: [spaceA, spaceB],
  valuesList: [],
  relationsList: [],
  relations: { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
};
const value: Value = {
  id: 'value',
  entity: { id, name: 'Entity' },
  property: { id, name: 'Property', dataType: 'TEXT' },
  value: 'Saved',
  spaceId: spaceB,
  isLocal: true,
  isDeleted: true,
  hasBeenPublished: false,
};
const relation: Relation = {
  id: 'relation',
  entityId: id,
  fromEntity: { id, name: 'Entity' },
  toEntity: { id, name: 'Target', value: '' },
  type: { id, name: 'Property' },
  renderableType: 'RELATION',
  spaceId: spaceB,
  isLocal: true,
  isDeleted: true,
  hasBeenPublished: false,
};

const readers = [
  ['batch', (spaceId?: string) => Effect.map(getBatchEntities([id], spaceId), entities => entities[0])],
  ['entity', (spaceId?: string) => getEntity(id, spaceId)],
  ['page', (spaceId?: string) => Effect.map(getEntityPage(id, spaceId), page => page?.entity)],
  ['relation entity', (spaceId?: string) => getRelation(id, spaceId)],
  ['connection', (spaceId?: string) => Effect.map(getAllEntities({ spaceId, limit: 1 }), page => page.entities[0])],
  [
    'sorted connection',
    (spaceId?: string) =>
      Effect.map(
        getEntitiesOrderedByPropertyConnection({ propertyId: id, sortDirection: SortOrder.Asc, spaceId, limit: 1 }),
        page => page.entities[0]
      ),
  ],
] as const;

beforeEach(() => {
  syncedEntities.clear();
  reactiveValues.set([]);
  reactiveRelations.set([]);
  query.mockImplementation(
    ({ decoder, variables }: { decoder: (data: unknown) => unknown; variables: { spaceId?: string } }) => {
      // The batch count is unscoped even when the operation lists are filtered.
      const entity = variables.spaceId ? { ...raw, relations: { ...raw.relations, totalCount: 2 } } : raw;
      const page = { nodes: [entity], pageInfo: { hasNextPage: false, endCursor: null } };
      return Effect.succeed(
        decoder({
          entity,
          entities: [entity],
          relation: { entity },
          relations: [],
          entitiesConnection: page,
          entitiesOrderedByPropertyConnection: page,
        })
      );
    }
  );
});

describe.each(readers)('%s response coverage', (_label, read) => {
  it.each(['values', 'relations'] as const)(
    'preserves %s deletions in another space while reconciling the queried space',
    async kind => {
      const remote = await Effect.runPromise(read(spaceA));
      expect(remote).toBeTruthy();
      const store = new GeoStore(new GeoEventStream());
      store.hydrateWith([remote!]);
      if (kind === 'values') {
        expect(getNetValues([value], syncedEntities)).toEqual([value]);
        expect(getNetValues([{ ...value, spaceId: spaceA }], syncedEntities)).toEqual([]);
      } else {
        expect(getNetRelations([relation], syncedEntities)).toEqual([relation]);
        expect(getNetRelations([{ ...relation, spaceId: spaceA }], syncedEntities)).toEqual([]);
      }
      const aliased = await Effect.runPromise(read('22222222-2222-2222-2222-222222222222'));
      store.hydrateWith([aliased!]);
      if (kind === 'values') expect(getNetValues([{ ...value, spaceId: spaceA }], syncedEntities)).toEqual([]);
      else expect(getNetRelations([{ ...relation, spaceId: spaceA }], syncedEntities)).toEqual([]);
      const unscoped = await Effect.runPromise(read());
      store.hydrateWith([unscoped!]);
      if (kind === 'values') expect(getNetValues([value], syncedEntities)).toEqual([]);
      else expect(getNetRelations([relation], syncedEntities)).toEqual([]);
    }
  );
});
