import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { useEffect, useRef, useState } from 'react';

import { Entity } from '../io/dto/entities';
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
  const [entity, setEntity] = useState<Entity | undefined>(id ? store.getEntity(id, { spaceId }) : undefined);

  const { isFetched } = useQuery({
    enabled: !!id && enabled,
    queryKey: [...GeoStore.queryKey(id)],
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

    const onEntitySyncedSub = stream.on(GeoEventStream.ENTITIES_SYNCED, event => {
      if (event.entities.some(e => e.id === id)) {
        const entity = store.getEntity(id, { spaceId });
        setEntity(entity);
      }
    });

    const onEntityDeletedSub = stream.on(GeoEventStream.ENTITY_DELETED, event => {
      if (event.entity.id === id) {
        setEntity(undefined);
      }
    });

    const onRelationCreatedSub = stream.on(GeoEventStream.RELATION_CREATED, event => {
      if (event.relation.fromEntity.id === id) {
        setEntity(store.getEntity(id, { spaceId }));
      }
    });

    const onRelationDeletedSub = stream.on(GeoEventStream.RELATION_DELETED, event => {
      if (event.relation.fromEntity.id === id) {
        setEntity(store.getEntity(id, { spaceId }));
      }
    });

    const onTripleCreatedSub = stream.on(GeoEventStream.VALUES_CREATED, event => {
      let shouldUpdate = false;

      if (event.value.entityId === id) {
        shouldUpdate = true;
      }

      /**
       * If the changed triple is for one of the relations of the subscribed entities
       * changed we need to re-pull the entity to get the latest state of its relation.
       *
       * e.g., if Byron has Works at -> Geo and we change Geo to Geo, PBC., we need to
       * re-pull Byron to get the latest name for Geo, PBC.
       */
      const maybeRelationToChanged = entity?.relationsOut.some(r => r.toEntity.id === event.value.entityId);

      if (maybeRelationToChanged) {
        shouldUpdate = true;
      }

      const maybeRelationEntityChanged = entity?.relationsOut.some(r => r.id === event.value.entityId);

      if (maybeRelationEntityChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setEntity(store.getEntity(id, { spaceId }));
      }
    });

    const onTripleDeletedSub = stream.on(GeoEventStream.VALUES_DELETED, event => {
      let shouldUpdate = false;

      if (event.value.entityId === id) {
        shouldUpdate = true;
      }

      /**
       * If the changed triple is for one of the relations of the subscribed entities
       * changed we need to re-pull the entity to get the latest state of its relation.
       *
       * e.g., if Byron has Works at -> Geo and we change Geo to Geo, PBC., we need to
       * re-pull Byron to get the latest name for Geo, PBC.
       */
      const maybeRelationToChanged = entity?.relationsOut.some(r => r.toEntity.id === event.value.entityId);

      if (maybeRelationToChanged) {
        shouldUpdate = true;
      }

      const maybeRelationEntityChanged = entity?.relationsOut.some(r => r.id === event.value.entityId);

      if (maybeRelationEntityChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setEntity(store.getEntity(id, { spaceId }));
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
  }, [id, store, stream, spaceId, enabled, entity]);

  return {
    entity,
    isLoading: !isFetched && !!id && enabled,
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
  const [localEntities, setLocalEntities] = useState<Entity[]>([]);

  const prevWhere = useRef(where);

  useEffect(() => {
    // We need to compare by hash since there's no guarantee that the
    // where clause is actually stable.
    // @TODO: We could hash this instead, but stringify works for now
    if (JSON.stringify(prevWhere.current) !== JSON.stringify(where)) {
      prevWhere.current = where;
    }
  }, [where]);

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
  const { isFetched, isLoading } = useQuery({
    enabled,
    placeholderData,
    queryKey: [...GeoStore.queryKeys(where), first, skip],
    queryFn: async () => {
      const entities = await E.findMany({ store, cache, where, first, skip });
      setLocalEntities(entities);
      stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities });
      return entities;
    },
  });

  useEffect(() => {
    if (!enabled) return;

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
        setLocalEntities([]);
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
      const localEntitiesList = localEntities;
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
        e.relationsOut.some(r => syncedEntitiesIds.includes(r.toEntity.id))
      );

      if (maybeRelationChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setLocalEntities(latestQueriedEntities);
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
        setLocalEntities(entities);
      }
    });

    const onRelationDeletedSub = stream.on(GeoEventStream.RELATION_DELETED, event => {
      const entities = new EntityQuery(store)
        .where(where)
        .limit(first)
        .offset(skip)
        .sortBy({ field: 'updatedAt', direction: 'desc' })
        .execute();
      const localEntitiesList = localEntities;

      const previousListHasFromEntity = localEntitiesList.some(e => e.id === event.relation.fromEntity.id);
      const newListDoesNotHaveFromEntity = !entities.some(e => e.id === event.relation.fromEntity.id);

      // This means the queried list has changed as a result of the deleted relation
      if (previousListHasFromEntity && newListDoesNotHaveFromEntity) {
        setLocalEntities(entities);
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

      if (ids.includes(event.value.entityId)) {
        shouldUpdate = true;
      }

      /**
       * If the changed triple is for one of the relations of the subscribed entities
       * changed we need to re-pull the entity to get the latest state of its relation.
       *
       * e.g., if Byron has Works at -> Geo and we change Geo to Geo, PBC., we need to
       * re-pull Byron to get the latest name for Geo, PBC.
       */
      const maybeRelationToChanged = entities.some(e =>
        e.relationsOut.some(r => r.toEntity.id === event.value.entityId)
      );

      if (maybeRelationToChanged) {
        shouldUpdate = true;
      }

      const maybeRelationEntityChanged = entities.some(e => e.relationsOut.some(r => r.id === event.value.entityId));

      if (maybeRelationEntityChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setLocalEntities(entities);
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
      const localEntitiesList = localEntities;

      const previousListHasChangedEntity = localEntitiesList.some(e => e.id === event.value.entityId);
      const newListDoesNotHaveChangedEntity = !entities.some(e => e.id === event.value.entityId);

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

      const maybeRelationChanged = entities.some(e => e.relationsOut.some(r => r.toEntity.id === event.value.entityId));

      if (maybeRelationChanged) {
        shouldUpdate = true;
      }

      const maybeRelationEntityChanged = entities.some(e => e.relationsOut.some(r => r.id === event.value.entityId));

      if (maybeRelationEntityChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setLocalEntities(entities);
      }
    });

    return () => {
      onEntitySyncedSub();
      onRelationCreatedSub();
      onRelationDeletedSub();
      onTripleCreatedSub();
      onTripleDeletedSub();
    };
  }, [where, stream, store, localEntities, enabled, first, skip]);

  return {
    entities: localEntities,
    isLoading: !isFetched && enabled && isLoading,
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
