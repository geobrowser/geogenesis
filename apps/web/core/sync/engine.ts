import { QueryClient } from '@tanstack/react-query';

import { fetchEntitiesBatch } from '../io/subgraph/fetch-entities-batch';
import { E } from './orm';
import { GeoStore } from './store';
import { GeoEvent, GeoEventStream } from './stream';

export class SyncEngine {
  private stream: GeoEventStream;
  private cache: QueryClient;
  private store: GeoStore;

  private subs: (() => void)[] = [];
  private env = process.env.NODE_ENV;

  constructor(stream: GeoEventStream, cache: QueryClient, store: GeoStore) {
    this.stream = stream;
    this.cache = cache;
    this.store = store;

    const onEntityUpdated = this.stream.on(GeoEventStream.ENTITY_UPDATED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.ENTITY_UPDATED}`, event);
      }
      this.processSyncQueue(event);
    });

    const onTriplesUpdated = this.stream.on(GeoEventStream.TRIPLES_CREATED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.TRIPLES_CREATED}`, event);
      }
      this.processSyncQueue(event);
    });

    const onRelationsUpdated = this.stream.on(GeoEventStream.RELATION_CREATED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.RELATION_CREATED}`, event);
      }
      this.processSyncQueue(event);
    });

    const onEntityDeleted = this.stream.on(GeoEventStream.ENTITY_DELETED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.ENTITY_DELETED}`, event);
      }
      this.processSyncQueue(event);
    });

    const onTriplesDeleted = this.stream.on(GeoEventStream.TRIPLES_DELETED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.TRIPLES_DELETED}`, event);
      }
      this.processSyncQueue(event);
    });

    const onRelationsDeleted = this.stream.on(GeoEventStream.RELATION_DELETED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.RELATION_DELETED}`, event);
      }
      this.processSyncQueue(event);
    });

    const onEntitiesRevalidated = this.stream.on(GeoEventStream.CHANGES_CLEARED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.CHANGES_CLEARED}`, event);
      }
      this.processSyncQueue(event);
    });

    this.subs = [
      onEntityUpdated,
      onTriplesUpdated,
      onRelationsUpdated,
      onEntityDeleted,
      onTriplesDeleted,
      onRelationsDeleted,
      onEntitiesRevalidated,
    ];
  }

  public start() {
    // this.processSyncQueue();
  }

  public stop() {
    this.subs.forEach(unsub => unsub());
  }

  // @TODO This can eventually happen in a Worker so it can happen
  // in a separate thread that doesn't block UI ever
  private async processSyncQueue(event: GeoEvent) {
    const entityIds: string[] = [];

    switch (event.type) {
      case GeoEventStream.ENTITY_UPDATED:
      case GeoEventStream.ENTITY_DELETED:
        entityIds.push(event.entity.id);
        break;
      case GeoEventStream.TRIPLES_CREATED:
      case GeoEventStream.TRIPLES_DELETED: {
        entityIds.push(event.triple.entityId);

        // Update any entities in the store that reference the entity where the triple is
        // being added. This is so we can sync fields that derive from triples like name,
        // description, etc.
        const referencing = this.store.findReferencingEntities(event.triple.entityId);
        entityIds.push(...referencing);
        break;
      }
      case GeoEventStream.RELATION_CREATED:
      case GeoEventStream.RELATION_DELETED: {
        entityIds.push(event.relation.fromEntity.id);
        entityIds.push(event.relation.toEntity.id);
        entityIds.push(event.relation.typeOf.id);
        entityIds.push(event.relation.id);

        // Update any entities in the store that reference the entity where the relation is
        // being added. This is so we can sync fields that derive from relations like types,
        // spaces, etc.
        const referencing = this.store.findReferencingEntities(event.relation.fromEntity.id);
        entityIds.push(...referencing);
        break;
      }
      case GeoEventStream.CHANGES_CLEARED:
        entityIds.push(...event.entities.map(e => e.id));
        break;
      default:
        break;
    }

    if (entityIds.length === 0) {
      return;
    }

    const entities = await this.cache.fetchQuery({
      queryKey: ['entities-batch-sync', entityIds],
      queryFn: () => fetchEntitiesBatch({ entityIds }),
    });

    const merged = entityIds
      .map(e => E.merge({ id: e, store: this.store, mergeWith: entities.find(remoteEntity => remoteEntity.id === e) }))
      .filter(e => e !== null);

    if (merged.length > 0) {
      this.stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: merged });
    }
  }
}
