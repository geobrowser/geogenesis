import { SystemIds } from '@graphprotocol/grc-20';
import { createAtom } from '@xstate/store';

import { RENDERABLE_TYPE_PROPERTY } from '../constants';
import { readTypes } from '../database/entities';
import { ID } from '../id';
import { EntityId } from '../io/schema';
import { Entities } from '../utils/entity';
import { DataType, Entity, ExtraRenderableType, Property, Relation, Value } from '../v2.types';
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

  private reactiveValues = createAtom<Map<string, Map<string, Value>>>(new Map());
  private reactiveRelations = createAtom<Map<string, Map<string, Relation>>>(new Map());

  // TODO(migration): We can use the pending data to represent what hasn't been
  // published yet.
  //
  // Right now when we sync we do put the synced data directly in the values and
  // relations though.
  private pendingValues: Map<string, Map<string, Value>> = new Map();
  private pendingRelations: Map<string, Map<string, Relation>> = new Map();
  private pendingEntityDeletes: Set<string> = new Set();

  // Properties are entities, but with a required dataType field. The property's
  // dataType is unique across the entire knowledge graph. The other fields of
  // the property are space-specific, and derived from the data of an entity.
  //
  // @NOTE that properties can't be deleted
  //
  // @TODO: Should we model relation value types, renderable types as data on
  // the property? Or should it be derived from the entity representation of
  // the property? Probably the latter to avoid having multiple sources of truth
  /**
   * How should we model writing and syncing properties? Are they basically the
   * same as writing and syncing entities?
   */
  private properties: Map<string, Property> = new Map();

  /**
   * @TODO
   * - [ ] Set/delete relation value types
   * - [ ] Set/delete renderable type
   */
  private dataTypes: Map<string, DataType> = new Map();
  private pendingDataTypes: Map<string, DataType> = new Map();

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
      this.reactiveValues.set(prev => {
        // Convert Value[] to Map<string, Value> indexed by tripleKey
        const valueMap = new Map<string, Value>();
        entity.values.forEach(value => {
          const tripleKey = ID.createValueId({
            propertyId: value.property.id,
            entityId: value.entity.id,
            spaceId: value.spaceId,
          });
          valueMap.set(tripleKey, value);
        });
        prev.set(entity.id, valueMap);
        return prev;
      });

      // @TODO: Do we still need this? Or is merging handled correctly before syncing here?
      // const newRelations: Relation[] = [];
      // const existingRelationIds = new Set(this.getResolvedRelations(entity.id)?.map(r => r.id) ?? []);

      // for (const relation of entity.relationsOut) {
      //   if (!existingRelationIds.has(relation.id)) {
      //     newRelations.push(relation);
      //   }
      // }

      this.relations.set(entity.id, entity.relations);
      this.reactiveRelations.set(prev => {
        // Convert Relation[] to Map<string, Relation> indexed by relation.id
        const relationMap = new Map<string, Relation>();
        entity.relations.forEach(relation => {
          relationMap.set(relation.id, relation);
        });
        prev.set(entity.id, relationMap);
        return prev;
      });
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

  static queryKeys(where: WhereCondition, first?: number, skip?: number) {
    return ['store', 'entities', JSON.stringify(where), first, skip];
  }

  clear() {
    const entitiesToSync = this.getEntities();

    this.entities.clear();
    this.values.clear();
    this.relations.clear();
    this.deletedEntities.clear();
    this.pendingValues.clear();
    this.pendingRelations.clear();
    this.pendingEntityDeletes.clear();

    this.properties.clear();
    this.pendingDataTypes.clear();

    this.stream.emit({ type: GeoEventStream.HYDRATE, entities: entitiesToSync.map(e => e.id) });
  }

  public hydrate(entityIds: string[]) {
    this.stream.emit({ type: GeoEventStream.HYDRATE, entities: entityIds });
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
    const pendingTripleMap = this.pendingValues.get(entityId);

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
          entityId: value.entity.id,
          spaceId: value.spaceId,
        }),
        value
      );
    });

    // Apply pending value changes
    pendingTripleMap.forEach(pendingValue => {
      const key = ID.createValueId({
        propertyId: pendingValue.property.id,
        entityId: pendingValue.entity.id,
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

  getValue(id: string, entityId: string): Value | null {
    return this.getResolvedValues(entityId).find(v => v.id === id) ?? null;
  }

  getRelation(id: string, entityId: string): Relation | null {
    return this.getResolvedRelations(entityId).find(r => r.id === id) ?? null;
  }

  public setDataType(id: string, dataType: DataType) {
    this.pendingDataTypes.set(id, dataType);

    this.stream.emit({ type: GeoEventStream.DATA_TYPE_CREATED, property: { id, dataType } });
  }

  public getProperty(id: string): Property | null {
    const entity = this.getEntity(id);

    const stableDataType = this.getStableDataType(id);
    const pendingDataType = this.pendingDataTypes.get(id);

    /**
     * Always favor the stable data type. The stable data type should
     * come from the server. If the property already exists in the
     * knowledge graph then the data type is immutable.
     */
    const dataType = stableDataType ?? pendingDataType ?? null;

    if (!dataType) {
      return null;
    }

    const relationValueTypes = entity?.relations
      .filter(t => t.type.id === SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE)
      .map(r => ({
        id: r.toEntity.id,
        name: r.toEntity.name,
      }));

    const renderableType = entity?.relations.find(t => t.type.id === RENDERABLE_TYPE_PROPERTY);

    /**
     * @TODO
     * Move to higher-order file
     */
    const mapping: Record<string, ExtraRenderableType> = {
      [SystemIds.URL]: 'URL',
      [SystemIds.IMAGE]: 'IMAGE',
    };

    return {
      id,
      name: entity?.name ?? null,
      dataType: dataType,
      relationValueTypes,
      renderableType: renderableType ? mapping[renderableType.toEntity.id] : dataType,

      /**
       * A data type is still editable as long as there's no
       * stable representation of the property on the server.
       */
      isDataTypeEditable: !stableDataType,
    };
  }

  getStableDataType(id: string): DataType | null {
    return this.dataTypes.get(id) ?? null;
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
    const entityId = value.entity.id;

    // Create a composite key for the value
    const tripleKey = ID.createValueId({
      propertyId: value.property.id,
      entityId: value.entity.id,
      spaceId: value.spaceId,
    });

    value.hasBeenPublished = false;
    value.isDeleted = false;
    value.isLocal = true;
    value.timestamp = new Date().toISOString();

    // Get or create the pending triples map for this entity
    if (!this.pendingValues.has(entityId)) {
      this.pendingValues.set(entityId, new Map());
    }

    // Add to pending changes
    this.pendingValues.get(entityId)!.set(tripleKey, value);

    this.reactiveValues.set(prev => {
      if (!prev.has(entityId)) {
        prev.set(entityId, new Map());
      }

      // Set/replace the value directly using tripleKey as the key
      prev.get(entityId)!.set(tripleKey, value);

      return prev;
    });

    // Emit update event
    this.stream.emit({ type: GeoEventStream.VALUES_CREATED, value: value });
  }

  /**
   * Delete a value with optimistic updates
   */
  public deleteValue(value: Value): void {
    // Mark the value as deleted in pending changes
    const entityId = value.entity.id;
    const valueKey = ID.createValueId({
      propertyId: value.property.id,
      entityId: value.entity.id,
      spaceId: value.spaceId,
    });

    value.hasBeenPublished = false;
    value.isDeleted = true;
    value.isLocal = true;
    value.timestamp = new Date().toISOString();

    // Get or create the pending triples map for this entity
    if (!this.pendingValues.has(entityId)) {
      this.pendingValues.set(entityId, new Map());
    }

    // Add a deleted version to pending changes
    this.pendingValues.get(entityId)!.set(valueKey, value);

    // Remove from reactive values
    this.reactiveValues.set(prev => {
      const entityValues = prev.get(entityId);
      if (entityValues) {
        entityValues.delete(valueKey);
      }
      return prev;
    });

    // Emit update event
    this.stream.emit({ type: GeoEventStream.VALUES_DELETED, value: value });
  }

  /**
   * Add or update a relation with optimistic updates
   */
  public setRelation(relation: Relation): void {
    const entityId = relation.fromEntity.id;

    relation.hasBeenPublished = false;
    relation.isDeleted = false;
    relation.isLocal = true;
    relation.timestamp = new Date().toISOString();

    // Get or create the pending relations map for this entity
    if (!this.pendingRelations.has(entityId)) {
      this.pendingRelations.set(entityId, new Map());
    }

    // @TODO: Optimistically set types

    // Add to pending changes
    this.pendingRelations.get(entityId)!.set(relation.id, relation);

    this.reactiveRelations.set(prev => {
      if (!prev.has(entityId)) {
        prev.set(entityId, new Map());
      }

      // Set/replace the relation directly using relation.id as the key
      prev.get(entityId)!.set(relation.id, relation);

      return prev;
    });

    // Emit update event
    this.stream.emit({ type: GeoEventStream.RELATION_CREATED, relation });
  }

  /**
   * Delete a relation with optimistic updates
   */
  public deleteRelation(relation: Relation): void {
    const entityId = relation.fromEntity.id;

    relation.hasBeenPublished = false;
    relation.isDeleted = true;
    relation.isLocal = true;
    relation.timestamp = new Date().toISOString();

    // Get or create the pending relations map for this entity
    if (!this.pendingRelations.has(entityId)) {
      this.pendingRelations.set(entityId, new Map());
    }

    // @TODO: Optimistically set types

    // Add a deleted version to pending changes
    this.pendingRelations.get(entityId)!.set(relation.id, relation);

    // Remove from reactive relations
    this.reactiveRelations.set(prev => {
      const entityRelations = prev.get(entityId);
      if (entityRelations) {
        entityRelations.delete(relation.id);
      }
      return prev;
    });

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
