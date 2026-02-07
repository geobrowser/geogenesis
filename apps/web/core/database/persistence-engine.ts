import { Relation, Value } from '../types';
import { reactiveRelations, reactiveValues } from '../sync/store';
import { GeoEventStream } from '../sync/stream';
import { db } from './indexeddb';

const DEBOUNCE_MS = 300;

/**
 * PersistenceEngine subscribes to GeoEventStream events and persists
 * local (unpublished) changes to IndexedDB. It follows the same pattern
 * as SyncEngine: subscribe to stream events, perform side effects.
 *
 * All IndexedDB operations are wrapped in try-catch so failures log
 * warnings but never throw or break the app.
 */
export class PersistenceEngine {
  private pendingValues = new Map<string, Value>();
  private pendingRelations = new Map<string, Relation>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(stream: GeoEventStream) {
    stream.on(GeoEventStream.VALUES_CREATED, event => {
      this.enqueue('value', event.value);
    });

    stream.on(GeoEventStream.VALUES_DELETED, event => {
      this.enqueue('value', event.value);
    });

    stream.on(GeoEventStream.RELATION_CREATED, event => {
      this.enqueue('relation', event.relation);
    });

    stream.on(GeoEventStream.RELATION_DELETED, event => {
      this.enqueue('relation', event.relation);
    });

    stream.on(GeoEventStream.CHANGES_PUBLISHED, event => {
      this.onPublished(event.valueIds, event.relationIds);
    });

    stream.on(GeoEventStream.LOCAL_CHANGES_CLEARED, event => {
      this.onCleared(event.spaceId);
    });
  }

  private enqueue(kind: 'value', item: Value): void;
  private enqueue(kind: 'relation', item: Relation): void;
  private enqueue(kind: 'value' | 'relation', item: Value | Relation): void {
    if (!item.isLocal || item.hasBeenPublished) return;

    if (kind === 'value') {
      this.pendingValues.set(item.id, item as Value);
    } else {
      this.pendingRelations.set(item.id, item as Relation);
    }

    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, DEBOUNCE_MS);
  }

  private async flush() {
    const values = [...this.pendingValues.values()];
    const relations = [...this.pendingRelations.values()];
    this.pendingValues.clear();
    this.pendingRelations.clear();

    try {
      if (values.length > 0) {
        await db.values.bulkPut(values);
      }
      if (relations.length > 0) {
        await db.relations.bulkPut(relations);
      }
    } catch (err) {
      console.warn('[PersistenceEngine] flush failed:', err);
    }
  }

  private async onPublished(valueIds: string[], relationIds: string[]) {
    try {
      if (valueIds.length > 0) {
        await db.values.bulkDelete(valueIds);
      }
      if (relationIds.length > 0) {
        await db.relations.bulkDelete(relationIds);
      }
    } catch (err) {
      console.warn('[PersistenceEngine] onPublished cleanup failed:', err);
    }
  }

  private async onCleared(spaceId: string) {
    try {
      await db.values.where('spaceId').equals(spaceId).delete();
      await db.relations.where('spaceId').equals(spaceId).delete();
    } catch (err) {
      console.warn('[PersistenceEngine] onCleared cleanup failed:', err);
    }
  }

  /**
   * Restore persisted local changes from IndexedDB into the in-memory
   * reactive atoms. Server data (already in memory) wins — we skip
   * any IDs that already exist.
   */
  async restore() {
    try {
      const [storedValues, storedRelations] = await Promise.all([db.values.toArray(), db.relations.toArray()]);

      const localValues = storedValues.filter(v => v.isLocal && !v.hasBeenPublished);
      const localRelations = storedRelations.filter(r => r.isLocal && !r.hasBeenPublished);

      if (localValues.length > 0) {
        reactiveValues.set(prev => {
          const existingIds = new Set(prev.map(v => v.id));
          const newValues = localValues.filter(v => !existingIds.has(v.id));
          return newValues.length > 0 ? [...prev, ...newValues] : prev;
        });
      }

      if (localRelations.length > 0) {
        reactiveRelations.set(prev => {
          const existingIds = new Set(prev.map(r => r.id));
          const newRelations = localRelations.filter(r => !existingIds.has(r.id));
          return newRelations.length > 0 ? [...prev, ...newRelations] : prev;
        });
      }
    } catch (err) {
      console.warn('[PersistenceEngine] restore failed:', err);
    }
  }
}
