import { SystemIds } from '@graphprotocol/grc-20';

import { Entity } from '../io/dto/entities';
import { EntityId } from '../io/schema';
import { Relation, Triple } from '../types';
import { GeoEventStream } from './stream';

type ReadOptions = { includeDeleted?: boolean; spaceId?: string };

/**
 * The GeoStore is a local cache of data representing entities in the application.
 * When users write local data it is written to the store. In the background
 * a sync engine listens for changes to entities and syncs with the remote source.
 * These synced changes get written back to the GeoStore asynchronously.
 */
export class GeoStore {
  // Core data storage
  private entities: Map<string, Entity> = new Map();
  private triples: Map<string, Triple[]> = new Map();
  private relations: Map<string, Relation[]> = new Map();
  private deletedEntities: Set<string> = new Set();
  private deletedRelations: Set<string> = new Set();
  private deletedTriples: Set<string> = new Set();

  // Pending optimistic updates
  // @TODO:
  // We don't need pending data since we don't actually _write_ anything
  // to the network, we only read and merge.
  private pendingTriples: Map<string, Map<string, Triple>> = new Map();
  private pendingRelations: Map<string, Map<string, Relation>> = new Map();
  private pendingEntityDeletes: Set<string> = new Set();

  // Need to also store the ops. We can emit an event to create ops based on events
  // here
  private stream: GeoEventStream;

  constructor(stream: GeoEventStream) {
    this.stream = stream;

    /**
     * The sync engine listens for events from the event stream. When it receives
     * an event it queues it up in the background for syncing. Once syncing is
     * complete it emits an event to the event stream to notify consumers that
     * syncing is complete.
     */
    this.stream.on(GeoEventStream.ENTITIES_SYNCED, event => this.syncEntities(event.entities));
  }

  private syncEntities(entities: Entity[]) {
    for (const entity of entities) {
      this.entities.set(entity.id, entity);
      this.triples.set(entity.id, entity.triples);

      const newRelations: Relation[] = [];
      const existingRelationIds = new Set(this.relations.get(entity.id)?.map(r => r.id) ?? []);

      for (const relation of entity.relationsOut) {
        if (!existingRelationIds.has(relation.id)) {
          newRelations.push(relation);
        }
      }

      this.relations.set(entity.id, entity.relationsOut);
    }
  }

  static queryKey(id: string) {
    return ['store', 'entity', id];
  }

  static queryKeys(ids: string[]) {
    return ['store', 'entities', ids];
  }

  clear() {
    const entitiesToSync = this.getEntities();

    this.entities.clear();
    this.triples.clear();
    this.relations.clear();
    this.deletedEntities.clear();
    this.deletedRelations.clear();
    this.deletedTriples.clear();
    this.pendingTriples.clear();
    this.pendingRelations.clear();
    this.pendingEntityDeletes.clear();

    this.stream.emit({ type: GeoEventStream.CHANGES_CLEARED, entities: entitiesToSync });
  }

  /**
   * Get an entity by ID with full resolution of its relations
   */
  public getEntity(id: string, options: ReadOptions = {}): Entity | undefined {
    const { includeDeleted = false } = options ?? {};

    // Check if the entity is deleted
    if (this.isEntityDeleted(id) && !options.includeDeleted) return undefined;

    // Get the base entity
    const entity = this.entities.get(id);

    // Get triples including any pending optimistic updates
    const triples = this.getResolvedTriples(id);

    // Get relations including any pending optimistic updates
    const relations = this.getResolvedRelations(id);

    if (!entity && triples.length === 0 && relations.length === 0) {
      return undefined;
    }

    const name = triples.find(t => t.attributeId === SystemIds.NAME_ATTRIBUTE)?.value.value ?? null;
    const description = triples.find(t => t.attributeId === SystemIds.DESCRIPTION_ATTRIBUTE)?.value.value ?? null;

    // Return fully resolved entity
    const resolvedEntity: Entity = {
      ...(entity
        ? {
            ...entity,
            name: name ?? entity.name,
            description: description ?? entity.description,
            relationsOut: relations.filter(r => (includeDeleted ? true : Boolean(r.isDeleted) === false)),
          }
        : {
            id: EntityId(id),
            name,
            description,
            types: [],
            spaces: [],
            nameTripleSpaces: [],
          }),
      triples: triples.filter(t => (includeDeleted ? true : Boolean(t.isDeleted) === false)),
      relationsOut: relations.filter(r => (includeDeleted ? true : Boolean(r.isDeleted) === false)),
    };

    return resolvedEntity;
  }

  /**
   * Get multiple entities by ID with full resolution
   */
  public getEntities(ids?: string[], options: ReadOptions = {}): Entity[] {
    if (!ids) {
      return Array.from(this.entities.keys())
        .filter(id => (options.includeDeleted ? true : this.isEntityDeleted(id) === false))
        .map(id => this.getEntity(id, options))
        .filter(entity => entity !== undefined);
    }

    return ids
      .map(id => this.getEntity(id))
      .filter(entity => entity !== undefined)
      .filter(entity => (options.includeDeleted ? true : this.isEntityDeleted(entity.id) === false));
  }

  /**
   * Set or update an entity's base properties (without triples or relations)
   */
  public setEntity(entity: Entity): void {
    const baseEntity = { ...entity, triples: [], relationsOut: [] };
    this.entities.set(entity.id as string, baseEntity);

    // Set entity triples
    if (entity.triples && entity.triples.length > 0) {
      entity.triples.forEach(triple => {
        this.setTriple(triple);
      });
    }

    // Set entity relations
    if (entity.relationsOut && entity.relationsOut.length > 0) {
      entity.relationsOut.forEach(relation => {
        this.setRelation(relation);
      });
    }

    this.stream.emit({ type: GeoEventStream.ENTITY_UPDATED, entity });
  }

  /**
   * Get triples for an entity (without pending changes)
   */
  private getBaseTriples(entityId: string): Triple[] {
    return this.triples.get(entityId) || [];
  }

  /**
   * Get all triples for an entity including optimistic updates
   */
  public getResolvedTriples(entityId: string): Triple[] {
    const baseTriples = this.getBaseTriples(entityId);
    const pendingTripleMap = this.pendingTriples.get(entityId);

    if (!pendingTripleMap || pendingTripleMap.size === 0) {
      return baseTriples;
    }

    // Create a map of base triples for easier merging
    const tripleMap = new Map<string, Triple>();

    // Function to generate a unique key for each triple
    const getTripleKey = (triple: Triple): string => `${triple.entityId}-${triple.attributeId}-${triple.space}`;

    // Add base triples to the map
    baseTriples.forEach(triple => {
      tripleMap.set(getTripleKey(triple), triple);
    });

    // Apply pending triple changes
    pendingTripleMap.forEach(pendingTriple => {
      const key = getTripleKey(pendingTriple);
      if (pendingTriple.isDeleted) {
        tripleMap.delete(key);
      } else {
        tripleMap.set(key, pendingTriple);
      }
    });

    return Array.from(tripleMap.values());
  }

  /**
   * Get relations for an entity (without pending changes)
   */
  private getBaseRelations(entityId: string): Relation[] {
    return this.relations.get(entityId) || [];
  }

  /**
   * Get all relations for an entity including optimistic updates
   */
  private getResolvedRelations(entityId: string): Relation[] {
    const baseRelations = this.getBaseRelations(entityId);
    const pendingRelationMap = this.pendingRelations.get(entityId);

    if (!pendingRelationMap || pendingRelationMap.size === 0) {
      return baseRelations;
    }

    // Create a map of base relations for easier merging
    const relationMap = new Map<string, Relation>();

    // Add base relations to the map
    baseRelations.forEach(relation => {
      relationMap.set(relation.id, relation);
    });

    // Apply pending relation changes
    pendingRelationMap.forEach(pendingRelation => {
      if (pendingRelation.isDeleted) {
        relationMap.delete(pendingRelation.id);
      } else {
        relationMap.set(pendingRelation.id, pendingRelation);
      }
    });

    return Array.from(relationMap.values());
  }

  /**
   * Check if entity is marked as deleted (including pending deletes)
   */
  public isEntityDeleted(id: string): boolean {
    return this.deletedEntities.has(id) || this.pendingEntityDeletes.has(id);
  }

  /**
   * Add or update a triple with optimistic updates
   */
  public setTriple(triple: Triple): void {
    const entityId = triple.entityId;

    // Create a composite key for the triple
    const tripleKey = `${triple.entityId}-${triple.attributeId}-${triple.space}`;

    // Get or create the pending triples map for this entity
    if (!this.pendingTriples.has(entityId)) {
      this.pendingTriples.set(entityId, new Map());
    }

    // Add to pending changes
    this.pendingTriples.get(entityId)!.set(tripleKey, triple);

    if (triple.attributeId === SystemIds.NAME_PROPERTY) {
      // Optimistically set the name for the entity. This means we can
      // immediately render the entity with the new name without waiting
      // for syncing to finish.
      const maybeEntity = this.entities.get(entityId);

      if (!maybeEntity) {
        this.entities.set(entityId, {
          id: EntityId(entityId),
          name: triple.value.value,
          description: null,
          types: [],
          spaces: [],
          nameTripleSpaces: [],
          relationsOut: [],
          triples: [],
        });
      } else {
        this.entities.set(entityId, {
          ...maybeEntity,
          name: triple.value.value,
        });
      }
    }

    if (triple.attributeId === SystemIds.DESCRIPTION_PROPERTY) {
      // Optimistically set the description for the entity. This means we can
      // immediately render the entity with the new description without waiting
      // for syncing to finish.
      const maybeEntity = this.entities.get(entityId);

      if (!maybeEntity) {
        this.entities.set(entityId, {
          id: EntityId(entityId),
          name: null,
          description: triple.value.value,
          types: [],
          spaces: [],
          nameTripleSpaces: [],
          relationsOut: [],
          triples: [],
        });
      } else {
        this.entities.set(entityId, {
          ...maybeEntity,
          description: triple.value.value,
        });
      }
    }

    // Emit update event
    this.stream.emit({ type: GeoEventStream.TRIPLES_CREATED, triple });
  }

  /**
   * Delete a triple with optimistic updates
   */
  public deleteTriple(triple: Triple): void {
    // Mark the triple as deleted in pending changes
    const entityId = triple.entityId;
    const tripleKey = `${triple.entityId}-${triple.attributeId}-${triple.space}`;

    // Get or create the pending triples map for this entity
    if (!this.pendingTriples.has(entityId)) {
      this.pendingTriples.set(entityId, new Map());
    }

    // Add a deleted version to pending changes
    this.pendingTriples.get(entityId)!.set(tripleKey, {
      ...triple,
      isDeleted: true,
    });

    this.deletedTriples.add(tripleKey);

    if (triple.attributeId === SystemIds.NAME_PROPERTY) {
      // Optimistically set the name for the entity. This means we can
      // immediately render the entity with the new name without waiting
      // for syncing to finish.
      this.entities.set(entityId, {
        ...this.entities.get(entityId),
        name: null,
      } as Entity);
    }

    if (triple.attributeId === SystemIds.DESCRIPTION_PROPERTY) {
      // Optimistically set the description for the entity. This means we can
      // immediately render the entity with the new description without waiting
      // for syncing to finish.
      this.entities.set(entityId, {
        ...this.entities.get(entityId),
        description: null,
      } as Entity);
    }

    // Emit update event
    this.stream.emit({ type: GeoEventStream.TRIPLES_DELETED, triple });
  }

  /**
   * Add or update a relation with optimistic updates
   */
  public setRelation(relation: Relation): void {
    const entityId = relation.fromEntity.id;

    // Get or create the pending relations map for this entity
    if (!this.pendingRelations.has(entityId)) {
      this.pendingRelations.set(entityId, new Map());
    }

    // Add to pending changes
    this.pendingRelations.get(entityId)!.set(relation.id, relation);

    // Emit update event
    this.stream.emit({ type: GeoEventStream.RELATION_CREATED, relation });
  }

  /**
   * Delete a relation with optimistic updates
   */
  public deleteRelation(relation: Relation): void {
    const entityId = relation.fromEntity.id;

    // Get or create the pending relations map for this entity
    if (!this.pendingRelations.has(entityId)) {
      this.pendingRelations.set(entityId, new Map());
    }

    // Add a deleted version to pending changes
    this.pendingRelations.get(entityId)!.set(relation.id, {
      ...relation,
      isDeleted: true,
    });

    this.deletedRelations.add(relation.id);

    // Emit update event
    this.stream.emit({ type: GeoEventStream.RELATION_DELETED, relation });
  }

  /**
   * Find all entities that reference the given entity in their relations
   */
  public findReferencingEntities(id: string): string[] {
    const referencingEntities: string[] = [];

    // Check base relations
    this.relations.forEach((relationsArray, entityId) => {
      for (const relation of relationsArray) {
        if (relation.toEntity.id === id) {
          referencingEntities.push(entityId);
          break;
        }
      }
    });

    // Check pending relations
    this.pendingRelations.forEach((pendingMap, entityId) => {
      pendingMap.forEach(relation => {
        if (relation.toEntity.id === id && !relation.isDeleted) {
          if (!referencingEntities.includes(entityId)) {
            referencingEntities.push(entityId);
          }
        }
      });
    });

    return referencingEntities;
  }
}
