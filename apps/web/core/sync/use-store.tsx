import { SystemIds } from '@graphprotocol/grc-20';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useEffect, useRef, useState } from 'react';

import { Entity } from '../io/dto/entities';
import { WhereCondition } from './experimental_query-layer';
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

// @TODO: Filters/query language for syncing entities
export function useQueryEntities({ where }: QueryEntitiesOptions) {
  const cache = useQueryClient();
  const { store, stream, query: queryInternal } = useSyncEngine();
  const [hasRun, setHasRun] = useState(false);
  const [entities, setEntities] = useState<Record<string, Entity>>(
    /**
     * We set any local-store entities in state by default in order
     * to render _something_ optimistically. In the useQuery below
     * we check for any remote results of the filter condition and
     * update the store asynchronously.
     */
    Object.fromEntries(
      queryInternal
        .query()
        .where(where)
        .execute()
        .map(e => [e.id, e])
    )
  );

  const prevWhere = useRef(where);

  useEffect(() => {
    // @TODO: We could hash this instead, but stringify works for now
    if (JSON.stringify(prevWhere.current) !== JSON.stringify(where)) {
      prevWhere.current = where;
    }
  }, [where]);

  /**
   * This query runs behind the scenes to sync any remote entities that match
   * the filter condition and merge into the local store.
   */
  const { isFetched } = useQuery({
    queryKey: [...GeoStore.queryKeys(where.id?.in ?? []), hasRun, prevWhere.current],
    queryFn: async () => {
      if (!hasRun || JSON.stringify(prevWhere.current) !== JSON.stringify(where)) {
        const entities = await E.findMany(store, cache, where);
        stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities });
        setHasRun(true);
        return entities;
      }

      return [];
    },
  });

  useEffect(() => {
    const ids = where.id?.in;

    const onEntitySyncedSub = stream.on(GeoEventStream.ENTITIES_SYNCED, event => {
      const entitiesToUpdate = event.entities.filter(e => ids?.includes(e.id));
      const changedEntities = event.entities.map(e => e.id);

      const maybeRelationChanged = Object.values(entities).filter(e =>
        e.relationsOut.some(r => changedEntities.includes(r.toEntity.id))
      );

      if (maybeRelationChanged.length > 0) {
        const entities = maybeRelationChanged.map(e => store.getEntity(e.id)).filter(e => e !== undefined);
        entitiesToUpdate.push(...entities);
      }

      if (entitiesToUpdate.length > 0) {
        setEntities(prev => {
          /**
           * If there is a new query, we don't want to include already-stored
           * entities in the new state unless they're valid for the new query
           */
          const validPrevEntities = Object.values(prev).filter(e => ids?.includes(e.id));

          return {
            ...Object.fromEntries(validPrevEntities.map(p => [p.id, p])),
            ...Object.fromEntries(entitiesToUpdate.map(e => [e.id, e])),
          };
        });
      }
    });

    const onEntityDeletedSub = stream.on(GeoEventStream.ENTITY_DELETED, event => {
      if (ids?.includes(event.entity.id)) {
        setEntities(prev => {
          const next = prev;
          delete next[event.entity.id];
          return next;
        });
      }
    });

    const onRelationCreatedSub = stream.on(GeoEventStream.RELATION_CREATED, event => {
      if (ids?.includes(event.relation.fromEntity.id)) {
        const entity = store.getEntity(event.relation.fromEntity.id);

        if (entity) {
          setEntities(prev => ({
            ...prev,
            [event.relation.fromEntity.id]: entity,
          }));
        }
      }
    });

    const onRelationDeletedSub = stream.on(GeoEventStream.RELATION_DELETED, event => {
      if (ids?.includes(event.relation.fromEntity.id)) {
        const entity = store.getEntity(event.relation.fromEntity.id);
        console.log(
          'event',
          entity?.relationsOut.filter(r => r.typeOf.id === SystemIds.TYPES_PROPERTY)
        );

        if (entity) {
          setEntities(prev => ({
            ...prev,
            [event.relation.fromEntity.id]: entity,
          }));
        }
      }
    });

    const onTripleCreatedSub = stream.on(GeoEventStream.TRIPLES_CREATED, event => {
      const entitiesToUpdate: Entity[] = [];

      if (ids?.includes(event.triple.entityId)) {
        const entity = store.getEntity(event.triple.entityId);

        if (entity) {
          entitiesToUpdate.push(entity);
        }
      }

      const maybeRelationChanged = Object.values(entities).filter(e =>
        e.relationsOut.some(r => r.toEntity.id === event.triple.entityId)
      );

      if (maybeRelationChanged.length > 0) {
        const entities = maybeRelationChanged.map(e => store.getEntity(e.id)).filter(e => e !== undefined);
        entitiesToUpdate.push(...entities);
      }

      if (entitiesToUpdate.length > 0) {
        setEntities(prev => ({
          ...prev,
          ...Object.fromEntries(entitiesToUpdate.map(e => [e.id, e])),
        }));
      }
    });

    const onTripleDeletedSub = stream.on(GeoEventStream.TRIPLES_DELETED, event => {
      const entitiesToUpdate: Entity[] = [];

      if (event.triple.id && ids?.includes(event.triple.id)) {
        const entity = store.getEntity(event.triple.entityId);

        if (entity) {
          entitiesToUpdate.push(entity);
        }
      }

      const maybeRelationChanged = Object.values(entities).filter(e =>
        e.relationsOut.some(r => r.toEntity.id === event.triple.entityId)
      );

      if (maybeRelationChanged.length > 0) {
        const entities = maybeRelationChanged.map(e => store.getEntity(e.id)).filter(e => e !== undefined);
        entitiesToUpdate.push(...entities);
      }

      if (entitiesToUpdate.length > 0) {
        setEntities(prev => ({
          ...prev,
          ...Object.fromEntries(entitiesToUpdate.map(e => [e.id, e])),
        }));
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
  }, [where, stream, store, entities]);

  return {
    entities: Object.values(entities),
    isLoading: !isFetched,
  };
}
