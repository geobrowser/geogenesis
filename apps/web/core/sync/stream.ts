import { DataType, Entity, Relation, Value } from '../v2.types';

const ENTITY_UPDATED = 'entity:updated' as const;
const ENTITY_DELETED = 'entity:deleted' as const;
const VALUES_CREATED = 'values:updated' as const;
const VALUES_DELETED = 'values:deleted' as const;
const RELATION_CREATED = 'relations:created' as const;
const RELATION_DELETED = 'relations:deleted' as const;
const ENTITIES_SYNCED = 'entities:synced' as const;
const DATA_TYPE_CREATED = 'datatype:created' as const;
const HYDRATE = 'hydrate' as const;

export type GeoEvent =
  | {
      type: typeof ENTITY_UPDATED;
      entity: Entity;
    }
  | {
      type: typeof ENTITY_DELETED;
      entity: Entity;
    }
  | {
      type: typeof VALUES_CREATED;
      value: Value;
    }
  | {
      type: typeof VALUES_DELETED;
      value: Value;
    }
  | {
      type: typeof RELATION_CREATED;
      relation: Relation;
    }
  | {
      type: typeof RELATION_DELETED;
      relation: Relation;
    }
  | {
      type: typeof ENTITIES_SYNCED;
      entities: Entity[];
      paginationKey?: string;
    }
  // Not sure if this revalidation event should be part of the stream or not.
  // We need a way to trigger re-syncs of data in some instances in order to
  // sync UI state with external systems. e.g., clearing all local changes from
  // the review screen should re-sync and trigger UI updates.
  //
  // All of the other events in the stream are things that have ALREADY happened,
  // but this event is a trigger to _DO_ something.
  | {
      type: typeof HYDRATE;
      entities: string[];
    }
  | {
      type: typeof DATA_TYPE_CREATED;
      property: {
        id: string;
        dataType: DataType;
      };
    };

// Extract event types that match a specific 'type' value
export type GeoEventByType<T extends GeoEvent['type']> = Extract<GeoEvent, { type: T }>;

/**
 * The GeoEventStream stores and emits events for all changes
 * to entity data locally in the app.
 *
 * Downstream consumers of the stream can write their own logic
 * to be triggered by the stream events.
 *
 * e.g.,
 * 1. Create ops representing the changes
 * 2. Trigger React to re-render
 * 3. Persist ops in indexeddb
 * 4. Sync local data with remote data
 */
export class GeoEventStream {
  static ENTITY_UPDATED = ENTITY_UPDATED;
  static ENTITY_DELETED = ENTITY_DELETED;
  static VALUES_CREATED = VALUES_CREATED;
  static VALUES_DELETED = VALUES_DELETED;
  static RELATION_CREATED = RELATION_CREATED;
  static RELATION_DELETED = RELATION_DELETED;
  static DATA_TYPE_CREATED = DATA_TYPE_CREATED;
  static ENTITIES_SYNCED = ENTITIES_SYNCED;
  static HYDRATE = HYDRATE;

  private listeners: Record<string, Array<(event: GeoEvent) => void>> = {};

  // Store all events that ever happened so we can replay or reconstruct state
  // at any point in time.
  private events: GeoEvent[] = [];

  public on<E extends GeoEvent['type']>(event: E, callback: (event: GeoEventByType<E>) => void): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    // @ts-expect-error need to use correct type with generic to narrow event data
    this.listeners[event].push(callback);

    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  public emit(event: GeoEvent): void {
    if (this.listeners[event.type]) {
      this.listeners[event.type].forEach(callback => {
        callback(event);
      });
    }

    this.events.push(event);
  }
}
