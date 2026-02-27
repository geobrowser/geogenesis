import { AsyncBatcher } from '@tanstack/pacer';
import { QueryClient } from '@tanstack/react-query';
import { Duration, Effect } from 'effect';

import { getBatchEntities } from '../io/queries';
import { Entity } from '../types';
import { E } from './orm';
import { GeoStore } from './store';
import { GeoEvent, GeoEventStream } from './stream';

/** TTL for synced entities cache in milliseconds (5 minutes) */
const SYNC_TTL_MS = 5 * 60 * 1000;

export class SyncEngine {
  private stream: GeoEventStream;
  private cache: QueryClient;
  private store: GeoStore;

  /**
   * We track already-synced entities so we don't sync them
   * again unnecessarily. This gets reset with new user sessions.
   *
   * We could handle this through our caching layer, but since we
   * batch fetch entities for syncing it's not straight forward to
   * manage the cache for an array of entities to sync. It's simpler
   * to just manage them outside of the cache and avoid fetching
   * them at all.
   *
   * Uses a Map with timestamps to support TTL-based invalidation,
   * allowing entities to be re-synced after SYNC_TTL_MS to pick up
   * remote changes from other users.
   */
  private syncedEntities: Map<string, number> = new Map();

  private subs: (() => void)[] = [];
  private env = process.env.NODE_ENV;
  private batcher: AsyncBatcher<GeoEvent>;

  constructor(stream: GeoEventStream, cache: QueryClient, store: GeoStore) {
    this.stream = stream;
    this.cache = cache;
    this.store = store;

    const shouldLog = this.env === 'development' && process.env.NEXT_PUBLIC_ENGINE_LOGGING !== '0';

    /**
     * We often trigger many sync events in a short time frame, especially for
     * entities with many data blocks or when quickly navigating and preloading.
     * We batch requests to send them in one big request instead of many small
     * requests. This should reduce memory usage and performance for for slow
     * connections without affecting performance for fast connections.
     *
     * Not entirely sure the most optimal batch window yet, so will just have
     * to experiment with it.
     */
    this.batcher = new AsyncBatcher(this.processSyncQueue.bind(this), {
      wait: Duration.toMillis('100 millis'),
      started: true,
      onSuccess: (result: Entity[]) => {
        if (result.length > 0) {
          /**
           * We track the synced entities that have actually been merged instead of
           * using the uniqueEntityIds we calculate above. This is to ensure that
           * we only track synced entities that have a valid state after merging.
           * Otherwise we can get in a state where an entity failed syncing in the past,
           * and now can no longer be synced in the future.
           */
          const now = Date.now();
          for (const entity of result) {
            this.syncedEntities.set(entity.id, now);
          }

          this.stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: result });
        }
      },
    });

    const onEntityUpdated = this.stream.on(GeoEventStream.ENTITY_UPDATED, event => {
      if (shouldLog) {
        console.log(`queueing sync after ${GeoEventStream.ENTITY_UPDATED}`, event);
      }
      this.batcher.addItem(event);
    });

    const onTriplesUpdated = this.stream.on(GeoEventStream.VALUES_CREATED, event => {
      if (shouldLog) {
        console.log(`queueing sync after ${GeoEventStream.VALUES_CREATED}`, event);
      }
      this.batcher.addItem(event);
    });

    const onRelationsUpdated = this.stream.on(GeoEventStream.RELATION_CREATED, event => {
      if (shouldLog) {
        console.log(`queueing sync after ${GeoEventStream.RELATION_CREATED}`, event);
      }
      this.batcher.addItem(event);
    });

    const onEntityDeleted = this.stream.on(GeoEventStream.ENTITY_DELETED, event => {
      if (shouldLog) {
        console.log(`queueing sync after ${GeoEventStream.ENTITY_DELETED}`, event);
      }
      this.batcher.addItem(event);
    });

    const onTriplesDeleted = this.stream.on(GeoEventStream.VALUES_DELETED, event => {
      if (shouldLog) {
        console.log(`queueing sync after ${GeoEventStream.VALUES_DELETED}`, event);
      }
      this.batcher.addItem(event);
    });

    const onRelationsDeleted = this.stream.on(GeoEventStream.RELATION_DELETED, event => {
      if (shouldLog) {
        console.log(`queueing sync after ${GeoEventStream.RELATION_DELETED}`, event);
      }
      this.batcher.addItem(event);
    });

    const onEntitiesRevalidated = this.stream.on(GeoEventStream.HYDRATE, event => {
      if (shouldLog) {
        console.log(`queueing sync after ${GeoEventStream.HYDRATE}`, event);
      }
      this.batcher.addItem(event);
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

  public stop() {
    this.batcher.cancel();
    this.batcher.abort();
    this.subs.forEach(unsub => unsub());
  }

  // @TODO This can eventually happen in a Worker so it can happen
  // in a separate thread that doesn't block UI ever
  private async processSyncQueue(events: GeoEvent[]) {
    const entityIds: string[] = [];

    for (const event of events) {
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
    }

    if (entityIds.length === 0) {
      return [];
    }

    // Don't resync an entity if it was recently synced (within TTL).
    // Also skip empty string IDs which can appear when relation fields
    // (e.g. toEntity.id, type.id) are unset.
    const now = Date.now();
    const uniqueEntityIds = [
      ...new Set(
        entityIds.filter(id => {
          if (id === '') return false;
          const lastSynced = this.syncedEntities.get(id);
          // Sync if never synced or TTL has expired
          return lastSynced === undefined || now - lastSynced > SYNC_TTL_MS;
        })
      ),
    ];

    if (uniqueEntityIds.length === 0) {
      return [];
    }

    let entities: Record<string, Entity>;

    try {
      entities = await this.cache.fetchQuery({
        queryKey: ['entities-batch-sync', uniqueEntityIds],
        queryFn: async () => {
          const entities = await Effect.runPromise(getBatchEntities(uniqueEntityIds));
          return Object.fromEntries(entities.map(e => [e.id, e]));
        },
      });
    } catch (error) {
      // Log the error but don't throw - sync failures shouldn't crash the app.
      // Entities that failed to sync will be retried on the next sync cycle
      // (after TTL expires or on next relevant event).
      console.error('[SyncEngine] Failed to fetch entities for sync:', {
        entityIds: uniqueEntityIds,
        error: error instanceof Error ? error.message : error,
      });
      return [];
    }

    const merged = uniqueEntityIds
      .map(e => E.merge({ id: e, store: this.store, mergeWith: entities[e] }))
      .filter(e => e !== null);

    return merged;
  }
}
