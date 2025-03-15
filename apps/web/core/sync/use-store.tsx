import { useMemo, useState } from 'react';

import { Entity } from '../io/dto/entities';
import { GeoEventStream } from './stream';
import { useSyncEngine } from './use-sync-engine';

type Options = {
  id: string;
  spaceId?: string;
};

// @TODO need to filter data here by space id as well
export function useQueryEntity({ id }: Options) {
  const { store, stream } = useSyncEngine();
  const [entity, setEntity] = useState<Entity | undefined>(id ? store.getEntity(id) : undefined);

  useMemo(() => {
    const onEntitySyncedSub = stream.on(GeoEventStream.ENTITIES_SYNCED, event => {
      if (event.entities.some(e => e.id === id)) {
        setEntity(store.getEntity(id));
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
  }, [id, stream, store]);

  return {
    entity,
  };
}

export function useQueryEntities(ids?: string[]) {
  const { store, stream } = useSyncEngine();
  const [entities, setEntities] = useState<Record<string, Entity>>(
    ids
      ? Object.fromEntries(store.getEntities(ids).map(e => [e.id, e]))
      : Object.fromEntries(store.getEntities().map(e => [e.id, e]))
  );

  useMemo(() => {
    const onEntityUpdatedSub = stream.on(GeoEventStream.ENTITY_UPDATED, event => {
      if (ids?.includes(event.entity.id)) {
        setEntities(prev => ({
          ...prev,
          [event.entity.id]: event.entity,
        }));
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
          entity.relationsOut = [...entity.relationsOut, event.relation];

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

        if (entity) {
          entity.relationsOut = entity.relationsOut.filter(r => r.id !== event.relation.id);

          setEntities(prev => ({
            ...prev,
            [event.relation.fromEntity.id]: entity,
          }));
        }
      }
    });

    const onTripleCreatedSub = stream.on(GeoEventStream.TRIPLES_CREATED, event => {
      if (ids?.includes(event.triple.entityId)) {
        const entity = store.getEntity(event.triple.entityId);

        if (entity) {
          entity.triples = [...entity.triples, event.triple];
          setEntities(prev => ({
            ...prev,
            [event.triple.entityId]: entity,
          }));
        }
      }
    });

    const onTripleDeletedSub = stream.on(GeoEventStream.TRIPLES_DELETED, event => {
      if (event.triple.id && ids?.includes(event.triple.id)) {
        const entity = store.getEntity(event.triple.entityId);

        if (entity) {
          entity.triples = entity.triples.filter(t => t.id !== event.triple.id);
          setEntities(prev => ({
            ...prev,
            [event.triple.entityId]: entity,
          }));
        }
      }
    });

    return () => {
      onEntityUpdatedSub();
      onEntityDeletedSub();
      onRelationCreatedSub();
      onRelationDeletedSub();
      onTripleCreatedSub();
      onTripleDeletedSub();
    };
  }, [ids, stream, store]);

  return {
    entities,
  };
}
