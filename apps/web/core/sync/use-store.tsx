import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { useEffect } from 'react';

import { getProperties, getProperty } from '../io/v2/queries';
import { Property } from '../v2.types';
import { EntityQuery, WhereCondition } from './experimental_query-layer';
import { E } from './orm';
import { GeoStore } from './store';
import { GeoEventStream } from './stream';
import { useSyncEngine } from './use-sync-engine';

type QueryEntityOptions = {
  id?: string;
  spaceId?: string;
  enabled?: boolean;
};

export function useQueryEntity({ id, spaceId, enabled = true }: QueryEntityOptions) {
  const cache = useQueryClient();
  const { store, stream } = useSyncEngine();

  const { isFetched, data: entity } = useQuery({
    enabled: Boolean(id) && enabled,
    queryKey: GeoStore.queryKey(id),
    queryFn: async () => {
      // If the entity is in the store then it's already been synced and we can
      // skip this work
      if (!id) {
        return null;
      }

      /**
       * We explicitly don't query by space id here and let the sync
       * engine handle filtering it as the hook receives events
       */
      const merged = await E.findOne({ id, store, cache });

      if (merged) {
        stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: [merged] });
        return merged;
      }

      return null;
    },
  });

  useEffect(() => {
    if (!id || !enabled) {
      return;
    }

    // const trackedRelationIds = new Set(entity?.relations.map(r => r.id) ?? []);
    const trackedRelationToEntities = new Set(entity?.relations.map(r => r.toEntity.id) ?? []);

    const isEntityTracked = (id: string) => {
      return trackedRelationToEntities.has(id);
    };

    const onEntitySyncedSub = stream.on(GeoEventStream.ENTITIES_SYNCED, event => {
      if (event.entities.some(e => e.id === id)) {
        const entity = store.getEntity(id, { spaceId });
        cache.setQueryData(GeoStore.queryKey(id), entity);
      }
    });

    const onEntityDeletedSub = stream.on(GeoEventStream.ENTITY_DELETED, event => {
      if (event.entity.id === id) {
        cache.setQueryData(GeoStore.queryKey(id), null);
      }
    });

    const onRelationCreatedSub = stream.on(GeoEventStream.RELATION_CREATED, event => {
      if (event.relation.fromEntity.id === id) {
        cache.setQueryData(GeoStore.queryKey(id), store.getEntity(id, { spaceId }));
      }
    });

    const onRelationDeletedSub = stream.on(GeoEventStream.RELATION_DELETED, event => {
      if (event.relation.fromEntity.id === id) {
        cache.setQueryData(GeoStore.queryKey(id), store.getEntity(id, { spaceId }));
      }
    });

    const onTripleCreatedSub = stream.on(GeoEventStream.VALUES_CREATED, event => {
      let shouldUpdate = false;

      if (event.value.entity.id === id) {
        shouldUpdate = true;
      }

      /**
       * If the changed triple is for one of the relations of the subscribed entities
       * changed we need to re-pull the entity to get the latest state of its relation.
       *
       * e.g., if Byron has Works at -> Geo and we change Geo to Geo, PBC., we need to
       * re-pull Byron to get the latest name for Geo, PBC.
       */
      const maybeRelationToChanged = isEntityTracked(event.value.entity.id);

      if (maybeRelationToChanged) {
        shouldUpdate = true;
      }

      const maybeRelationEntityChanged = isEntityTracked(event.value.entity.id);

      if (maybeRelationEntityChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        cache.setQueryData(GeoStore.queryKey(id), store.getEntity(id, { spaceId }));
      }
    });

    const onTripleDeletedSub = stream.on(GeoEventStream.VALUES_DELETED, event => {
      let shouldUpdate = false;

      if (event.value.entity.id === id) {
        shouldUpdate = true;
      }

      /**
       * If the changed triple is for one of the relations of the subscribed entities
       * changed we need to re-pull the entity to get the latest state of its relation.
       *
       * e.g., if Byron has Works at -> Geo and we change Geo to Geo, PBC., we need to
       * re-pull Byron to get the latest name for Geo, PBC.
       */
      const maybeRelationToChanged = isEntityTracked(event.value.entity.id);

      if (maybeRelationToChanged) {
        shouldUpdate = true;
      }

      const maybeRelationEntityChanged = isEntityTracked(event.value.entity.id);

      if (maybeRelationEntityChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        cache.setQueryData(GeoStore.queryKey(id), store.getEntity(id, { spaceId }));
      }
    });

    return () => {
      onEntitySyncedSub();
      onEntityDeletedSub();
      onRelationCreatedSub();
      onRelationDeletedSub();
      onTripleCreatedSub();
      onTripleDeletedSub();
    };
  }, [id, store, stream, spaceId, enabled, cache, entity]);

  return {
    entity,
    isLoading: !isFetched && Boolean(id) && enabled,
  };
}

type QueryEntitiesOptions = {
  where: WhereCondition;
  enabled?: boolean;
  first?: number;
  skip?: number;
  placeholderData?: typeof keepPreviousData;
};

export function useQueryEntities({
  where,
  first = 9,
  skip = 0,
  enabled = true,
  placeholderData = undefined,
}: QueryEntitiesOptions) {
  const cache = useQueryClient();
  const { store, stream } = useSyncEngine();

  /**
   * What would a reactive approach to queried entities look like?
   * Currently we listen to the event stream and execute some heuristics
   * to see if we should update the existing state.
   *
   * There's a few approaches we could take
   * 1. Keep the heuristics, but instead of setting state, just update
   *    the cache by invalidating it. (how we used to do it)
   * 2. Keep the heuristics, but instead of settubg state, just set
   *    the cache state directly. (how we currently do it)
   * 3. Introduce some other reactive system that automatically updates
   *    when its dependencies are updated. This would require that its
   *    dependencies are themselves reactive. The filter could also be
   *    reactive, so when the filter changes it causes the reactive result
   *    to also update.
   *
   * Benefits of moving to the cache-based system is that we get "view sharing."
   * Different callers get the same data back as long as the parameters are
   * the same. Q: But what happens if one of them mutates? We might end up
   * with multiple cache updates simultaneously.
   */

  /**
   * This query runs behind the scenes to sync any remote entities that match
   * the filter condition and merge into the local store. It only runs once,
   * or if the filter changes.
   *
   * In the future we can decide that we want to sync more often, so we can
   * use RQ's refetch function or add a polling/refetch interval.
   *
   * The placeholderData parameter allows controlling what happens during a refetch:
   * - When set to keepPreviousData: previous data will be shown while new data is being
   *   fetched, preventing flickering and UI jumps
   * - When set to undefined (default): standard loading behavior applies
   *
   * To prevent flicker when adding new items to collections, callers should explicitly
   * pass keepPreviousData when they want to maintain the previous data during refetches.
   */
  const {
    isFetched,
    isLoading,
    data: localEntities,
  } = useQuery({
    enabled,
    placeholderData,
    queryKey: [...GeoStore.queryKeys(where), first, skip],
    queryFn: async () => {
      const entities = await E.findMany({ store, cache, where, first, skip });

      /**
       * @TODO
       * Do we need to actually sync the results since we're returning it?
       * One benefit of syncing is that all of the entities end up in the
       * store, so any components subscribed to the store can hook into
       * the new synced data as needed.
       */
      stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities });
      return entities;
    },
  });

  useEffect(() => {
    if (!enabled) return;

    const localEntitiesList = localEntities ?? [];

    const onEntitySyncedSub = stream.on(GeoEventStream.ENTITIES_SYNCED, event => {
      let shouldUpdate = false;
      const syncedEntitiesIds = event.entities.map(e => e.id);

      const latestQueriedEntities = new EntityQuery(store)
        .where(where)
        .limit(first)
        .offset(skip)
        .sortBy({ field: 'updatedAt', direction: 'desc' })
        .execute();
      const latestQueriedEntitiesIds = latestQueriedEntities.map(e => e.id);

      /**
       * If we end up with a filter that doesn't return any data then none of
       * the below "validation" checks will ever pass. So we check here if we
       * end up with an empty query result.
       */
      if (syncedEntitiesIds.length === 0 && latestQueriedEntitiesIds.length === 0) {
        cache.setQueryData([...GeoStore.queryKeys(where), first, skip], []);
        return;
      }

      /**
       * We only want to re-render consumers if the synced entities are relevant
       * to the query. This can happen in a few ways
       *
       * 1. The synced entity is included in the latest query result
       * 2. The sync entity was included in the _previous_ query result but not
       *    the new query result. (it was removed from the result list)
       * 3. The synced entity is one of the relations of an entity in the query
       *    result
       */
      if (syncedEntitiesIds.some(entityId => latestQueriedEntitiesIds.includes(entityId))) {
        shouldUpdate = true;
      }

      /**
       * This means the queried list has changed as a result of the deleted relation.
       *
       * This usually won't trigger since the triple/relation handlers likely already
       * updated local state. This happens because triple/relation events are optimistic
       * so run before syncing completes.
       */
      const previousListHasEntity = localEntitiesList.some(e => syncedEntitiesIds.includes(e.id));
      const newListDoesNotHaveEntity = !latestQueriedEntities.some(e => syncedEntitiesIds.includes(e.id));

      if (previousListHasEntity && newListDoesNotHaveEntity) {
        shouldUpdate = true;
      }

      /**
       * If any relations of the subscribed entities changes we need to re-pull
       * the entity to get the latest state of its relations. e.g., if Byron has
       * Works at -> Geo and we change Geo to Geo, PBC., we need to re-pull Byron
       * to get the latest name for Geo, PBC.
       */
      const maybeRelationChanged = latestQueriedEntities.some(e =>
        e.relations.some(r => syncedEntitiesIds.includes(r.toEntity.id))
      );

      if (maybeRelationChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        cache.setQueryData([...GeoStore.queryKeys(where), first, skip], latestQueriedEntities);
      }
    });

    const onRelationCreatedSub = stream.on(GeoEventStream.RELATION_CREATED, event => {
      const entities = new EntityQuery(store)
        .where(where)
        .limit(first)
        .offset(skip)
        .sortBy({ field: 'updatedAt', direction: 'desc' })
        .execute();
      const ids: string[] = entities.map(e => e.id);

      if (ids.includes(event.relation.fromEntity.id)) {
        cache.setQueryData([...GeoStore.queryKeys(where), first, skip], entities);
      }
    });

    const onRelationDeletedSub = stream.on(GeoEventStream.RELATION_DELETED, event => {
      const entities = new EntityQuery(store)
        .where(where)
        .limit(first)
        .offset(skip)
        .sortBy({ field: 'updatedAt', direction: 'desc' })
        .execute();

      const previousListHasFromEntity = localEntitiesList.some(e => e.id === event.relation.fromEntity.id);
      const newListDoesNotHaveFromEntity = !entities.some(e => e.id === event.relation.fromEntity.id);

      // This means the queried list has changed as a result of the deleted relation
      if (previousListHasFromEntity && newListDoesNotHaveFromEntity) {
        cache.setQueryData([...GeoStore.queryKeys(where), first, skip], entities);
      }
    });

    const onTripleCreatedSub = stream.on(GeoEventStream.VALUES_CREATED, event => {
      let shouldUpdate = false;

      const entities = new EntityQuery(store)
        .where(where)
        .limit(first)
        .offset(skip)
        .sortBy({ field: 'updatedAt', direction: 'desc' })
        .execute();
      const ids: string[] = entities.map(e => e.id);

      if (ids.includes(event.value.entity.id)) {
        shouldUpdate = true;
      }

      /**
       * If the changed triple is for one of the relations of the subscribed entities
       * changed we need to re-pull the entity to get the latest state of its relation.
       *
       * e.g., if Byron has Works at -> Geo and we change Geo to Geo, PBC., we need to
       * re-pull Byron to get the latest name for Geo, PBC.
       */
      const maybeRelationToChanged = entities.some(e => e.relations.some(r => r.toEntity.id === event.value.entity.id));

      if (maybeRelationToChanged) {
        shouldUpdate = true;
      }

      const maybeRelationEntityChanged = entities.some(e => e.relations.some(r => r.id === event.value.entity.id));

      if (maybeRelationEntityChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        cache.setQueryData([...GeoStore.queryKeys(where), first, skip], entities);
      }
    });

    const onTripleDeletedSub = stream.on(GeoEventStream.VALUES_DELETED, event => {
      // @TODO: We don't handle deletes correctly. If you delete something it may
      // cause the queried entities to change. How do we detect if we should update
      // the state based on whether the delete results in filter changes? We only
      // want to reset state if the change is relevant for the query.
      //
      // For now we just refetch and rerender every hook if _any_ deletes happen
      // in the app

      // If a triple is deleted and alters the result of this query then the triple's
      // entity won't show up in the query results.
      let shouldUpdate = false;
      const entities = new EntityQuery(store)
        .where(where)
        .limit(first)
        .offset(skip)
        .sortBy({ field: 'updatedAt', direction: 'desc' })
        .execute();

      const previousListHasChangedEntity = localEntitiesList.some(e => e.id === event.value.entity.id);
      const newListDoesNotHaveChangedEntity = !entities.some(e => e.id === event.value.entity.id);

      // This means the queried list has changed as a result of the deleted relation
      if (previousListHasChangedEntity && newListDoesNotHaveChangedEntity) {
        shouldUpdate = true;
      }

      /**
       * If the changed triple is for one of the relations of the subscribed entities
       * changed we need to re-pull the entity to get the latest state of its relation.
       *
       * e.g., if Byron has Works at -> Geo and we change Geo to Geo, PBC., we need to
       * re-pull Byron to get the latest name for Geo, PBC.
       */

      const maybeRelationChanged = entities.some(e => e.relations.some(r => r.toEntity.id === event.value.entity.id));

      if (maybeRelationChanged) {
        shouldUpdate = true;
      }

      const maybeRelationEntityChanged = entities.some(e => e.relations.some(r => r.id === event.value.entity.id));

      if (maybeRelationEntityChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        cache.setQueryData([...GeoStore.queryKeys(where), first, skip], entities);
      }
    });

    return () => {
      onEntitySyncedSub();
      onRelationCreatedSub();
      onRelationDeletedSub();
      onTripleCreatedSub();
      onTripleDeletedSub();
    };
  }, [where, stream, store, localEntities, enabled, first, skip, cache]);

  return {
    entities: localEntities ?? [],
    isLoading: !isFetched && enabled && isLoading,
  };
}

export function useQueryProperty({ id, spaceId, enabled = true }: QueryEntityOptions) {
  // const cache = useQueryClient();
  // const { store, stream } = useSyncEngine();

  const { data: property, isFetched } = useQuery({
    enabled: enabled && Boolean(id),
    queryKey: ['store', 'property', JSON.stringify({ id, spaceId, enabled })],
    queryFn: async (): Promise<Property | null> => {
      if (!id) {
        return null;
      }

      return await Effect.runPromise(getProperty(id));
    },
  });

  return {
    property,
    isLoading: !isFetched && Boolean(id) && enabled,
  };
}

type QueryPropertiesOptions = {
  ids: string[];
  enabled?: boolean;
};

export function useQueryProperties({ ids, enabled = true }: QueryPropertiesOptions) {
  // const cache = useQueryClient();
  // const { store, stream } = useSyncEngine();

  const { data: properties, isFetched } = useQuery({
    enabled: enabled,
    queryKey: ['store', 'properties', JSON.stringify({ ids, enabled })],
    queryFn: async (): Promise<Property[]> => {
      return await Effect.runPromise(getProperties(ids));
    },
  });

  return {
    properties: properties,
    isLoading: !isFetched && enabled,
  };
}

interface FindManyParameters {
  first?: number;
  skip?: number;
  where: WhereCondition;
}

export function useQueryEntitiesAsync() {
  const cache = useQueryClient();
  const { store } = useSyncEngine();

  return ({ where, first = 9, skip = 0 }: FindManyParameters) => E.findMany({ store, cache, where, first, skip });
}

export function useQueryEntityAsync() {
  const cache = useQueryClient();
  const { store } = useSyncEngine();

  return (id: string) => E.findOne({ store, cache, id });
}
