// Code to sync remote and local
// Queue for entities to sync
import { QueryClient } from '@tanstack/react-query';

import { fetchEntitiesBatch } from '../io/subgraph/fetch-entities-batch';
import { E } from './orm';
import { GeoStore } from './store';
import { GeoEvent, GeoEventStream } from './stream';

export class SyncEngine {
  private stream: GeoEventStream;
  private cache: QueryClient;
  private store: GeoStore;

  // @TODO: Can use a better queue implementation like Effect/Queue
  private queue = new AsyncQueue<GeoEvent>();
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
      // this.queue.enqueue(event);
      this.processSyncQueue(event);
    });

    const onTriplesUpdated = this.stream.on(GeoEventStream.TRIPLES_CREATED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.TRIPLES_CREATED}`, event);
      }
      // this.queue.enqueue(event);
      this.processSyncQueue(event);
    });

    const onRelationsUpdated = this.stream.on(GeoEventStream.RELATION_CREATED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.RELATION_CREATED}`, event);
      }
      // this.queue.enqueue(event);
      this.processSyncQueue(event);
    });

    const onEntityDeleted = this.stream.on(GeoEventStream.ENTITY_DELETED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.ENTITY_DELETED}`, event);
      }
      // this.queue.enqueue(event);
      this.processSyncQueue(event);
    });

    const onTriplesDeleted = this.stream.on(GeoEventStream.TRIPLES_DELETED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.TRIPLES_DELETED}`, event);
      }
      // this.queue.enqueue(event);
      this.processSyncQueue(event);
    });

    const onRelationsDeleted = this.stream.on(GeoEventStream.RELATION_DELETED, event => {
      if (this.env === 'development') {
        console.log(`queueing sync after ${GeoEventStream.RELATION_DELETED}`, event);
      }
      // this.queue.enqueue(event);
      this.processSyncQueue(event);
    });

    this.subs = [
      onEntityUpdated,
      onTriplesUpdated,
      onRelationsUpdated,
      onEntityDeleted,
      onTriplesDeleted,
      onRelationsDeleted,
    ];
  }

  /**
   * @TODO
   * 1. When we change any data we also need to check if any relations pointing
   *    to the changed entity needs to be updated.
   * 2. When we change an entity that's also a relation we need to check if any
   *    other entities that consume the relation need to be updated.
   */
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
      case 'entity:updated':
      case 'entity:deleted':
        entityIds.push(event.entity.id);
        break;
      case 'triples:updated':
      case 'triples:deleted':
        entityIds.push(event.triple.entityId);
        break;
      case 'relations:created':
      case 'relations:deleted':
        entityIds.push(event.relation.fromEntity.id);
        // entityIds.push(event.relation.toEntity.id);
        // entityIds.push(event.relation.typeOf.id);
        // entityIds.push(event.relation.id);
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

    const merged = entities.map(e => E.merge({ id: e.id, store: this.store, mergeWith: e })).filter(e => e !== null);

    if (merged.length > 0) {
      this.stream.emit({ type: GeoEventStream.ENTITIES_SYNCED, entities: merged });
    }
  }
  // }
}

type QueueItem<T> = {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  promise: Promise<T>;
};

class AsyncQueue<T> {
  private queue: QueueItem<T>[] = [];
  private waiting: QueueItem<T>[] = [];

  enqueue(item: T): void {
    if (this.waiting.length > 0) {
      const waiter = this.waiting.shift();
      if (waiter) {
        waiter.resolve(item);
      }
    } else {
      let resolve: (value: T | PromiseLike<T>) => void;
      let reject: (reason?: any) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      this.queue.push({ resolve: resolve!, reject: reject!, promise });
    }
  }

  async dequeue(): Promise<T | undefined> {
    if (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        return item.promise;
      }
    } else {
      let resolve: (value: T | PromiseLike<T>) => void;
      let reject: (reason?: any) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      this.waiting.push({ resolve: resolve!, reject: reject!, promise });
      return promise;
    }
  }

  get length(): number {
    return this.queue.length;
  }
}
