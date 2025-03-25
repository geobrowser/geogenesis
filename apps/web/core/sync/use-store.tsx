import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useEffect, useRef, useState } from 'react';

import { Entity } from '../io/dto/entities';
import { EntityQuery, WhereCondition } from './experimental_query-layer';
import { E } from './orm';
import { GeoStore } from './store';
import { GeoEventStream } from './stream';
import { useSyncEngine } from './use-sync-engine';

type QueryEntityOptions = {
  id: string;
  spaceId?: string;
};

// @TODO need to filter data here optionally by space id as well
export function useQueryEntity({ id }: QueryEntityOptions) {
  const cache = useQueryClient();
  const { store, stream } = useSyncEngine();
  const [entity, setEntity] = useState<Entity | undefined>(store.getEntity(id));

  const { isFetched } = useQuery({
    queryKey: [...GeoStore.queryKey(id), entity],
    queryFn: async () => {
      // If the entity is in the store then it's already been synced and we can
      // skip this work
      if (!entity) {
        const merged = await E.findOne({ id, store, cache });

        if (merged) {
          stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: [merged] });
          return merged;
        }
      }

      return entity;
    },
  });

  useEffect(() => {
    const onEntitySyncedSub = stream.on(GeoEventStream.ENTITIES_SYNCED, event => {
      if (event.entities.some(e => e.id === id)) {
        const entity = event.entities.find(e => e.id === id);
        entity && setEntity(entity);
      }
    });

    const onEntityUpdatedSub = stream.on(GeoEventStream.ENTITY_UPDATED, event => {
      if (event.entity.id === id) {
        setEntity(event.entity);
      }
    });

    const onEntityDeletedSub = stream.on(GeoEventStream.ENTITY_DELETED, event => {
      if (event.entity.id === id) {
        setEntity(undefined);
      }
    });

    const onRelationCreatedSub = stream.on(GeoEventStream.RELATION_CREATED, event => {
      if (event.relation.fromEntity.id === id) {
        setEntity(store.getEntity(id));
      }
    });

    const onRelationDeletedSub = stream.on(GeoEventStream.RELATION_DELETED, event => {
      if (event.relation.fromEntity.id === id) {
        setEntity(store.getEntity(id));
      }
    });

    const onTripleCreatedSub = stream.on(GeoEventStream.TRIPLES_CREATED, event => {
      if (event.triple.entityId === id) {
        const entity = store.getEntity(id);
        setEntity(entity);
      }
    });

    const onTripleDeletedSub = stream.on(GeoEventStream.TRIPLES_DELETED, event => {
      if (event.triple.entityId === id) {
        setEntity(store.getEntity(id));
      }
    });

    return () => {
      onEntitySyncedSub();
      onEntityUpdatedSub();
      onEntityDeletedSub();
      onRelationCreatedSub();
      onRelationDeletedSub();
      onTripleCreatedSub();
      onTripleDeletedSub();
    };
  }, [id, store, stream]);

  return {
    entity,
    isLoading: !isFetched,
  };
}

type QueryEntitiesOptions = {
  where: WhereCondition;
};

export function useQueryEntities({ where }: QueryEntitiesOptions) {
  const cache = useQueryClient();
  const { store, stream, query } = useSyncEngine();
  const [hasRun, setHasRun] = useState(false);
  const [localEntities, setLocalEntities] = useState<Record<string, Entity>>(
    /**
     * We set any local-store entities in state by default in order
     * to render _something_ optimistically. In the useQuery below
     * we check for any remote results of the filter condition and
     * update the store asynchronously.
     */
    Object.fromEntries(
      query
        .where(where)
        .execute()
        .map(e => [e.id, e])
    )
  );

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
   */
  const { isFetched } = useQuery({
    queryKey: [...GeoStore.queryKeys(where), hasRun, prevWhere.current],
    queryFn: async () => {
      if (!hasRun || JSON.stringify(prevWhere.current) !== JSON.stringify(where)) {
        const entities = await E.findMany(store, cache, where);
        setHasRun(true);
        stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities });
        return entities;
      }

      return [];
    },
  });

  useEffect(() => {
    const onEntitySyncedSub = stream.on(GeoEventStream.ENTITIES_SYNCED, event => {
      let shouldUpdate = false;
      const syncedEntitiesIds = event.entities.map(e => e.id);
      const latestQueriedEntities = new EntityQuery(store).where(where).execute();
      const latestQueriedEntitiesIds = latestQueriedEntities.map(e => e.id);

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
      const localEntitiesList = Object.values(localEntities);
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
      const maybeRelationChanged = Object.values(latestQueriedEntities).some(e =>
        e.relationsOut.some(r => syncedEntitiesIds.includes(r.toEntity.id))
      );

      if (maybeRelationChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setLocalEntities(Object.fromEntries(latestQueriedEntities.map(e => [e.id, e])));
      }
    });

    const onRelationCreatedSub = stream.on(GeoEventStream.RELATION_CREATED, event => {
      const entities = new EntityQuery(store).where(where).execute();
      const ids: string[] = entities.map(e => e.id);

      if (ids.includes(event.relation.fromEntity.id)) {
        setLocalEntities(Object.fromEntries(entities.map(e => [e.id, e])));
      }
    });

    const onRelationDeletedSub = stream.on(GeoEventStream.RELATION_DELETED, event => {
      const entities = new EntityQuery(store).where(where).execute();
      const localEntitiesList = Object.values(localEntities);

      const previousListHasFromEntity = localEntitiesList.some(e => e.id === event.relation.fromEntity.id);
      const newListDoesNotHaveFromEntity = !entities.some(e => e.id === event.relation.fromEntity.id);

      // This means the queried list has changed as a result of the deleted relation
      if (previousListHasFromEntity && newListDoesNotHaveFromEntity) {
        setLocalEntities(Object.fromEntries(entities.map(e => [e.id, e])));
      }
    });

    const onTripleCreatedSub = stream.on(GeoEventStream.TRIPLES_CREATED, event => {
      let shouldUpdate = false;

      const entities = new EntityQuery(store).where(where).execute();
      const ids: string[] = entities.map(e => e.id);

      if (ids.includes(event.triple.entityId)) {
        shouldUpdate = true;
      }

      /**
       * If the changed triple is for one of the relations of the subscribed entities
       * changed we need to re-pull the entity to get the latest state of its relation.
       *
       * e.g., if Byron has Works at -> Geo and we change Geo to Geo, PBC., we need to
       * re-pull Byron to get the latest name for Geo, PBC.
       */
      const maybeRelationChanged = Object.values(entities).some(e =>
        e.relationsOut.some(r => r.toEntity.id === event.triple.entityId)
      );

      if (maybeRelationChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setLocalEntities(Object.fromEntries(entities.map(e => [e.id, e])));
      }
    });

    const onTripleDeletedSub = stream.on(GeoEventStream.TRIPLES_DELETED, event => {
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
      const entities = new EntityQuery(store).where(where).execute();
      const localEntitiesList = Object.values(localEntities);

      const previousListHasChangedEntity = localEntitiesList.some(e => e.id === event.triple.entityId);
      const newListDoesNotHaveChangedEntity = !entities.some(e => e.id === event.triple.entityId);

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

      const maybeRelationChanged = Object.values(entities).some(e =>
        e.relationsOut.some(r => r.toEntity.id === event.triple.entityId)
      );

      if (maybeRelationChanged) {
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        setLocalEntities(Object.fromEntries(entities.map(e => [e.id, e])));
      }
    });

    return () => {
      onEntitySyncedSub();
      onRelationCreatedSub();
      onRelationDeletedSub();
      onTripleCreatedSub();
      onTripleDeletedSub();
    };
  }, [where, stream, store, query, localEntities]);

  return {
    entities: Object.values(localEntities),
    isLoading: !isFetched,
  };
}
