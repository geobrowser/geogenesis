import { QueryClient } from '@tanstack/react-query';
import { Effect } from 'effect';

import { getBatchEntities } from '../io/v2/queries';
import { E } from './orm';
import { GeoStore } from './store';
import { GeoEvent, GeoEventStream } from './stream';

export class SyncEngine {
  private stream: GeoEventStream;
  private cache: QueryClient;
  private store: GeoStore;

  private syncedEntities: Set<string> = new Set();

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

    const onTriplesUpdated = this.stream.on(GeoEventStream.VALUES_CREATED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.VALUES_CREATED}`, event);
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

    const onTriplesDeleted = this.stream.on(GeoEventStream.VALUES_DELETED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.VALUES_DELETED}`, event);
      }
      this.processSyncQueue(event);
    });

    const onRelationsDeleted = this.stream.on(GeoEventStream.RELATION_DELETED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.RELATION_DELETED}`, event);
      }
      this.processSyncQueue(event);
    });

    const onEntitiesRevalidated = this.stream.on(GeoEventStream.HYDRATE, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.HYDRATE}`, event);
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
      case GeoEventStream.VALUES_CREATED:
      case GeoEventStream.VALUES_DELETED: {
        entityIds.push(event.value.entity.id);

        // Update any entities in the store that reference the entity where the triple is
        // being added. This is so we can sync fields that derive from triples like name,
        // description, etc.
        const referencing = this.store.findReferencingEntities(event.value.entity.id);
        entityIds.push(...referencing);
        break;
      }
      case GeoEventStream.RELATION_CREATED:
      case GeoEventStream.RELATION_DELETED: {
        entityIds.push(event.relation.fromEntity.id);
        entityIds.push(event.relation.toEntity.id);
        entityIds.push(event.relation.type.id);
        entityIds.push(event.relation.id);

        // Update any entities in the store that reference the entity where the relation is
        // being added. This is so we can sync fields that derive from relations like types,
        // spaces, etc.
        const referencing = this.store.findReferencingEntities(event.relation.fromEntity.id);
        entityIds.push(...referencing);
        break;
      }
      case GeoEventStream.HYDRATE:
        entityIds.push(...event.entities);
        break;
      default:
        break;
    }

    if (entityIds.length === 0) {
      return;
    }

    // Don't resync an entity if it already has been synced
    const uniqueEntityIds = [...new Set(entityIds.filter(e => !this.syncedEntities.has(e)))];

    const entities = await this.cache.fetchQuery({
      queryKey: ['entities-batch-sync', uniqueEntityIds],
      queryFn: async () => {
        const entities = await Effect.runPromise(getBatchEntities(uniqueEntityIds));
        return Object.fromEntries(entities.map(e => [e.id, e]));
      },
    });

    const merged = uniqueEntityIds
      .map(e => E.merge({ id: e, store: this.store, mergeWith: entities[e] }))
      .filter(e => e !== null);

    if (merged.length > 0) {
      /**
       * We track the synced entities that have actually been merged instead of
       * using the uniqueEntityIds we calculate above. This is to ensure that
       * we only track synced entities that have a valid state after merging.
       * Otherwise we can get in a state where an entity failed syncing in the past,
       * and now can no longer be synced in the future.
       */
      for (const entity of merged) {
        this.syncedEntities.add(entity.id);
      }

      this.stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: merged });
    }
  }
}
