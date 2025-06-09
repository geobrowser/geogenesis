import { SystemIds } from '@graphprotocol/grc-20';

import { readTypes } from '../database/entities';
import { ID } from '../id';
import { EntityId } from '../io/schema';
import { Entities } from '../utils/entity';
import { Entity, Relation, Value } from '../v2.types';
import { WhereCondition } from './experimental_query-layer';
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
  private values: Map<string, Value[]> = new Map();
  private relations: Map<string, Relation[]> = new Map();
  private deletedEntities: Set<string> = new Set();

  // Pending optimistic updates
  // @TODO:
  // We don't need pending data since we don't actually _write_ anything
  // to the network, we only read and merge.
  private pendingTriples: Map<string, Map<string, Value>> = new Map();
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
      this.values.set(entity.id, entity.values);

      // @TODO: Do we still need this? Or is merging handled correctly before syncing here?
      // const newRelations: Relation[] = [];
      // const existingRelationIds = new Set(this.getResolvedRelations(entity.id)?.map(r => r.id) ?? []);

      // for (const relation of entity.relationsOut) {
      //   if (!existingRelationIds.has(relation.id)) {
      //     newRelations.push(relation);
      //   }
      // }

      this.relations.set(entity.id, entity.relations);
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`
Finished syncing entities to store.
Entity ids: ${entities.map(e => e.id).join(', ')}`);
    }
  }

  static queryKey(id?: string) {
    return ['store', 'entity', id];
  }

  static queryKeys(where: WhereCondition) {
    return ['store', 'entities', where];
  }

  clear() {
    const entitiesToSync = this.getEntities();

    this.entities.clear();
    this.values.clear();
    this.relations.clear();
    this.deletedEntities.clear();
    this.pendingTriples.clear();
    this.pendingRelations.clear();
    this.pendingEntityDeletes.clear();

    this.stream.emit({ type: GeoEventStream.CHANGES_CLEARED, entities: entitiesToSync });
  }

  /**
   * Get an entity by ID with full resolution of its relations
   */
  public getEntity(id: string, options: ReadOptions = {}): Entity | undefined {
    const { includeDeleted = false } = options;

    // Check if the entity is deleted
    if (this.isEntityDeleted(id) && !options.includeDeleted) return undefined;

    // Get the base entity
    const entity = this.entities.get(id);

    // Get triples including any pending optimistic updates
    const values = this.getResolvedValues(id, options.includeDeleted);

    // Get relations including any pending optimistic updates
    const relations = this.getResolvedRelations(id, options.includeDeleted);

    if (!entity && values.length === 0 && relations.length === 0) {
      return undefined;
    }

    const name = Entities.name(values);
    const description = Entities.description(values);
    const types = readTypes(relations);
    const spaces = Entities.spaces(values, relations);

    // Return fully resolved entity
    const resolvedEntity: Entity = {
      ...(entity
        ? {
            ...entity,
            types,
            spaces,
            nameTripleSpaces: spaces,
            name: name ?? entity.name,
            description: description ?? entity.description,
          }
        : {
            id: EntityId(id),
            name,
            description,
            types,
            spaces,
            nameTripleSpaces: spaces,
          }),
      values: values.filter(t =>
        includeDeleted ? true : Boolean(t.isDeleted) === false && options.spaceId ? t.spaceId === options.spaceId : true
      ),
      relations: relations.filter(r =>
        includeDeleted ? true : Boolean(r.isDeleted) === false && options.spaceId ? r.spaceId === options.spaceId : true
      ),
    };

    const resolvedRelations = resolvedEntity.relations.map(r => {
      let maybeToEntity: Entity | null = null;
      let maybeRelationEntity: Entity | null = null;

      if (r.toEntity.id !== id) {
        maybeToEntity = this.entities.get(r.toEntity.id) ?? null;
        maybeRelationEntity = this.entities.get(r.id) ?? null;
      }

      return {
        ...r,
        position:
          maybeRelationEntity?.values.find(t => t.property.id === EntityId(SystemIds.RELATION_INDEX))?.value ??
          r.position,
        toEntity: {
          ...r.toEntity,
          name: maybeToEntity?.name ?? r.toEntity.name,
        },
      };
    });

    resolvedEntity.relations = resolvedRelations;

    return resolvedEntity;
  }

  /**
   * Get multiple entities by ID with full resolution
   */
  public getEntities(options: ReadOptions = {}): Entity[] {
    return Array.from(this.entities.keys())
      .filter(id => (options.includeDeleted ? true : this.isEntityDeleted(id) === false))
      .map(id => this.getEntity(id, options))
      .filter(entity => entity !== undefined);
  }

  /**
   * Set or update an entity's base properties (without triples or relations)
   */
  public setEntity(entity: Entity): void {
    const baseEntity = { ...entity, triples: [], relationsOut: [] };
    this.entities.set(entity.id as string, baseEntity);

    // Set entity triples
    if (entity.values && entity.values.length > 0) {
      entity.values.forEach(value => {
        this.setValue(value);
      });
    }

    // Set entity relations
    if (entity.relations && entity.relations.length > 0) {
      entity.relations.forEach(relation => {
        this.setRelation(relation);
      });
    }

    this.stream.emit({ type: GeoEventStream.ENTITY_UPDATED, entity });
  }

  /**
   * Get triples for an entity (without pending changes)
   */
  private getBaseTriples(entityId: string): Value[] {
    return this.values.get(entityId) || [];
  }

  /**
   * Get all triples for an entity including optimistic updates
   */
  public getResolvedValues(entityId: string, includeDeleted = false): Value[] {
    const baseTriples = this.getBaseTriples(entityId);
    const pendingTripleMap = this.pendingTriples.get(entityId);

    if (!pendingTripleMap || pendingTripleMap.size === 0) {
      return baseTriples;
    }

    // Create a map of base value for easier merging
    const valueMap = new Map<string, Value>();

    // Add base value to the map
    baseTriples.forEach(value => {
      valueMap.set(
        ID.createValueId({
          propertyId: value.property.id,
          entityId: value.entityId,
          spaceId: value.spaceId,
        }),
        value
      );
    });

    // Apply pending value changes
    pendingTripleMap.forEach(pendingValue => {
      const key = ID.createValueId({
        propertyId: pendingValue.property.id,
        entityId: pendingValue.entityId,
        spaceId: pendingValue.spaceId,
      });
      if (pendingValue.isDeleted && !includeDeleted) {
        valueMap.delete(key);
      } else {
        valueMap.set(key, pendingValue);
      }
    });

    return Array.from(valueMap.values());
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
  private getResolvedRelations(entityId: string, includeDeleted = false): Relation[] {
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
      if (pendingRelation.isDeleted && !includeDeleted) {
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
   * Add or update a value with optimistic updates
   */
  public setValue(value: Value): void {
    const entityId = value.entityId;

    // Create a composite key for the value
    const tripleKey = ID.createValueId({
      propertyId: value.property.id,
      entityId: value.entityId,
      spaceId: value.spaceId,
    });
    // Get or create the pending triples map for this entity
    if (!this.pendingTriples.has(entityId)) {
      this.pendingTriples.set(entityId, new Map());
    }

    // Add to pending changes
    this.pendingTriples.get(entityId)!.set(tripleKey, value);

    // Emit update event
    this.stream.emit({ type: GeoEventStream.VALUES_CREATED, value: value });
  }

  /**
   * Delete a value with optimistic updates
   */
  public deleteValue(value: Value): void {
    // Mark the value as deleted in pending changes
    const entityId = value.entityId;
    const valueKey = ID.createValueId({
      propertyId: value.property.id,
      entityId: value.entityId,
      spaceId: value.spaceId,
    });
    value.isDeleted = true;

    // Get or create the pending triples map for this entity
    if (!this.pendingTriples.has(entityId)) {
      this.pendingTriples.set(entityId, new Map());
    }

    // Add a deleted version to pending changes
    this.pendingTriples.get(entityId)!.set(valueKey, value);

    // Emit update event
    this.stream.emit({ type: GeoEventStream.VALUES_DELETED, value: value });
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

    // @TODO: Optimistically set types

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
    relation.isDeleted = true;

    // Get or create the pending relations map for this entity
    if (!this.pendingRelations.has(entityId)) {
      this.pendingRelations.set(entityId, new Map());
    }

    // @TODO: Optimistically set types

    // Add a deleted version to pending changes
    this.pendingRelations.get(entityId)!.set(relation.id, relation);

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
