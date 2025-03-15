// Emitter should emit events for changes to entities, relations and triples.
import { Entity } from '../io/dto/entities';
import { Relation, Triple } from '../types';

// Downstream subscribers can listen for events and do things:
// 1. Create ops representing the changes
// 2. Trigger React to re-render
// 3. Persist ops in indexeddb

const ENTITY_UPDATED = 'entity:updated' as const;
const ENTITY_DELETED = 'entity:deleted' as const;
const TRIPLES_CREATED = 'triples:updated' as const;
const TRIPLES_DELETED = 'triples:deleted' as const;
const RELATION_CREATED = 'relations:created' as const;
const RELATION_DELETED = 'relations:deleted' as const;
const ENTITIES_SYNCED = 'entities:synced' as const;

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
      type: typeof TRIPLES_CREATED;
      triple: Triple;
    }
  | {
      type: typeof TRIPLES_DELETED;
      triple: Triple;
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
    };

// Extract event types that match a specific 'type' value
type EventByType<T extends GeoEvent['type']> = Extract<GeoEvent, { type: T }>;

/**
 * EventEmitter for state change notifications
 */
export class GeoEventStream {
  static ENTITY_UPDATED = ENTITY_UPDATED;
  static ENTITY_DELETED = ENTITY_DELETED;
  static TRIPLES_CREATED = TRIPLES_CREATED;
  static TRIPLES_DELETED = TRIPLES_DELETED;
  static RELATION_CREATED = RELATION_CREATED;
  static RELATION_DELETED = RELATION_DELETED;
  static ENTITIES_SYNCED = ENTITIES_SYNCED;

  private listeners: Record<string, Array<(event: GeoEvent) => void>> = {};

  // Store all events that ever happened so we can replay or reconstruct state
  // at any point in time.
  private events: GeoEvent[] = [];

  public on<E extends GeoEvent['type']>(event: E, callback: (event: EventByType<E>) => void): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    // @ts-expect-error typemismatch
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
