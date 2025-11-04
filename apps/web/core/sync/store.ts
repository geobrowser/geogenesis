import { SystemIds } from '@graphprotocol/grc-20';
import { createAtom } from '@xstate/store';
import { Array as A } from 'effect';
import produce from 'immer';

import { RENDERABLE_TYPE_PROPERTY } from '../constants';
import { db } from '../database/indexeddb';
import { readTypes } from '../database/entities';
import { getStrictRenderableType } from '../io/dto/properties';
import { Entities } from '../utils/entity';
import { DataType, Entity, Property, Relation, Value } from '../v2.types';
import { WhereCondition } from './experimental_query-layer';
import { GeoEventStream } from './stream';

type ReadOptions = { includeDeleted?: boolean; spaceId?: string };

export const reactiveValues = createAtom<Value[]>([]);
export const reactiveRelations = createAtom<Relation[]>([]);
export const syncedEntities = new Map<string, Entity>();

/**
 * The GeoStore is a local cache of data representing entities in the application.
 * When users write local data it is written to the store. In the background
 * a sync engine listens for changes to entities and syncs with the remote source.
 * These synced changes get written back to the GeoStore asynchronously.
 */
export class GeoStore {
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

    // Restore persisted changes from IndexedDB on initialization
    this.restoreFromIndexedDB();
  }

  private syncEntities(entities: Entity[]) {
    this.hydrateWith(entities);

    if (process.env.NODE_ENV === 'development') {
      console.log(`
Finished syncing entities to store.
Entity ids: ${entities.map(e => e.id).join(', ')}`);
    }
  }

  /**
   * Restore persisted changes from IndexedDB on store initialization
   */
  private async restoreFromIndexedDB() {
    try {
      const [persistedValues, persistedRelations] = await Promise.all([
        db.values.toArray(),
        db.relations.toArray()
      ]);

      if (persistedValues.length > 0) {
        reactiveValues.set(prev => [...prev, ...persistedValues]);
      }

      if (persistedRelations.length > 0) {
        reactiveRelations.set(prev => [...prev, ...persistedRelations]);
      }

      if (process.env.NODE_ENV === 'development') {
        console.log(`[GeoStore] Restored ${persistedValues.length} values and ${persistedRelations.length} relations from IndexedDB`);
      }
    } catch (error) {
      console.error('[GeoStore] Failed to restore from IndexedDB:', error);
    }
  }

  /**
   * Persist unpublished values to IndexedDB
   */
  private async persistValues() {
    try {
      const unpublished = reactiveValues.get().filter(v => !v.hasBeenPublished && v.isLocal);
      await db.values.clear();
      if (unpublished.length > 0) {
        await db.values.bulkPut(unpublished);
      }
    } catch (error) {
      console.error('[GeoStore] Failed to persist values:', error);
    }
  }

  /**
   * Persist unpublished relations to IndexedDB
   */
  private async persistRelations() {
    try {
      const unpublished = reactiveRelations.get().filter(r => !r.hasBeenPublished && r.isLocal);
      await db.relations.clear();
      if (unpublished.length > 0) {
        await db.relations.bulkPut(unpublished);
      }
    } catch (error) {
      console.error('[GeoStore] Failed to persist relations:', error);
    }
  }

  /**
   * Clear published items from IndexedDB after successful publish
   */
  private async clearPublishedFromIndexedDB(valueIds: string[], relationIds: string[]) {
    try {
      await db.transaction('rw', [db.values, db.relations], async () => {
        await db.values.bulkDelete(valueIds);
        await db.relations.bulkDelete(relationIds);
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`[GeoStore] Cleared ${valueIds.length} values and ${relationIds.length} relations from IndexedDB`);
      }
    } catch (error) {
      console.error('[GeoStore] Failed to clear from IndexedDB:', error);
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

    this.properties.clear();
    this.pendingDataTypes.clear();

    this.stream.emit({ type: GeoEventStream.HYDRATE, entities: entitiesToSync.map(e => e.id) });
  }

  /**
   * Clear all unpublished local changes from the store and IndexedDB
   */
  public clearAllUnpublished(): void {
    // Remove all unpublished local changes
    reactiveValues.set(prev => {
      return prev.filter(v => v.hasBeenPublished || !v.isLocal);
    });

    reactiveRelations.set(prev => {
      return prev.filter(r => r.hasBeenPublished || !r.isLocal);
    });

    // Clear IndexedDB
    this.persistValues();
    this.persistRelations();
  }

  public hydrateWith(entities: Entity[]) {
    /**
     * We set the synced entities before we update values and relations
     * so that the synced entities are immediately available as soon as
     * any downstream reactive consumers update as a result of changes to
     * reactiveValues or reactiveRelations.
     */
    for (const entity of entities) {
      syncedEntities.set(entity.id, entity);
    }

    const newValues = entities.flatMap(e => e.values);
    const newRelations = entities.flatMap(e => e.relations);

    const valueIdsToWrite = new Set(newValues.map(t => t.id));
    const relationIdsToWrite = new Set(newRelations.map(t => t.id));

    reactiveValues.set(prev => {
      const unchangedValues = prev.filter(t => {
        return !valueIdsToWrite.has(t.id);
      });

      return [...unchangedValues, ...newValues];
    });

    reactiveRelations.set(prev => {
      const unchangedRelations = prev.filter(t => {
        return !relationIdsToWrite.has(t.id);
      });

      return [...unchangedRelations, ...newRelations];
    });
  }

  /**
   * Get an entity by ID with full resolution of its relations
   */
  public getEntity(id: string, options: ReadOptions = {}): Entity | undefined {
    const { includeDeleted = false } = options;

    // Get the base entity
    const entity = syncedEntities.get(id);

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
            id: id,
            name,
            description,
            types,
            spaces,
            nameTripleSpaces: spaces,
          }),
      values: values.filter(t => (options.spaceId ? t.spaceId === options.spaceId : true)),
      relations: relations.filter(r =>
        includeDeleted ? true : Boolean(r.isDeleted) === false && options.spaceId ? r.spaceId === options.spaceId : true
      ),
    };

    const resolvedRelations = resolvedEntity.relations.map(r => {
      let maybeToEntity: Entity | null = null;

      if (r.toEntity.id !== id) {
        maybeToEntity = syncedEntities.get(r.toEntity.id) ?? null;
      }

      return {
        ...r,
        position: r.position,
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
    return [...syncedEntities.keys()].map(id => this.getEntity(id, options)).filter(entity => entity !== undefined);
  }

  /**
   * Get all triples for an entity including optimistic updates
   */
  public getResolvedValues(entityId: string, includeDeleted = false): Value[] {
    const values = reactiveValues.get().filter(v => v.entity.id === entityId);

    if (!includeDeleted) {
      return values.filter(v => Boolean(v.isDeleted) === false);
    }

    return values;
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

    const renderableTypeId = renderableType ? renderableType.toEntity.id : null;

    return {
      id,
      name: entity?.name ?? null,
      dataType: dataType,
      relationValueTypes,
      renderableType: renderableTypeId,
      renderableTypeStrict: getStrictRenderableType(renderableTypeId),

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
   * Get all relations for an entity including optimistic updates
   */
  public getResolvedRelations(entityId: string, includeDeleted = false): Relation[] {
    const relations = reactiveRelations.get().filter(r => r.fromEntity.id === entityId);

    if (!includeDeleted) {
      return relations.filter(r => Boolean(r.isDeleted) === false);
    }

    return relations;
  }

  /**
   * Add or update a value with optimistic updates
   */
  public setValue(value: Value): void {
    const newValue = produce(value, draft => {
      draft.hasBeenPublished = false;
      draft.isDeleted = false;
      draft.isLocal = true;
      draft.timestamp = new Date().toISOString();
    });

    reactiveValues.set(prev => {
      const unchangedValues = prev.filter(t => {
        return t.id !== newValue.id;
      });

      return [...unchangedValues, newValue];
    });

    // Emit update event
    this.stream.emit({ type: GeoEventStream.VALUES_CREATED, value: newValue });

    // Persist to IndexedDB (fire-and-forget)
    this.persistValues();
  }

  /**
   * Delete a value with optimistic updates
   */
  public deleteValue(value: Value): void {
    const newValue = produce(value, draft => {
      draft.hasBeenPublished = false;
      draft.isDeleted = true;
      draft.isLocal = true;
      draft.timestamp = new Date().toISOString();
    });

    // Remove from reactive values
    reactiveValues.set(prev => {
      const unchangedValues = prev.filter(t => {
        return t.id !== newValue.id;
      });

      return [...unchangedValues, newValue];
    });

    // Emit update event
    this.stream.emit({ type: GeoEventStream.VALUES_DELETED, value: newValue });

    // Persist to IndexedDB (fire-and-forget)
    this.persistValues();
  }

  /**
   * Add or update a relation with optimistic updates
   */
  public setRelation(relation: Relation): void {
    const newRelation = produce(relation, draft => {
      draft.hasBeenPublished = false;
      draft.isDeleted = false;
      draft.isLocal = true;
      draft.timestamp = new Date().toISOString();
    });

    reactiveRelations.set(prev => {
      const unchangedRelations = prev.filter(t => {
        return t.id !== relation.id;
      });

      return [...unchangedRelations, newRelation];
    });

    // Emit update event
    this.stream.emit({ type: GeoEventStream.RELATION_CREATED, relation: newRelation });

    // Persist to IndexedDB (fire-and-forget)
    this.persistRelations();
  }

  /**
   * Delete a relation with optimistic updates
   */
  public deleteRelation(relation: Relation): void {
    const newRelation = produce(relation, draft => {
      draft.hasBeenPublished = false;
      draft.isDeleted = true;
      draft.isLocal = true;
      draft.timestamp = new Date().toISOString();
    });

    // Remove from reactive relations
    reactiveRelations.set(prev => {
      const unchangedRelations = prev.filter(t => {
        return t.id !== newRelation.id;
      });

      return [...unchangedRelations, newRelation];
    });

    // Emit update event
    this.stream.emit({ type: GeoEventStream.RELATION_DELETED, relation: newRelation });

    // Persist to IndexedDB (fire-and-forget)
    this.persistRelations();
  }

  /**
   * Discard (permanently remove) unpublished values from the store and IndexedDB
   */
  public discardValues(valueIds: string[]): void {
    const idsSet = new Set(valueIds);

    reactiveValues.set(prev => {
      return prev.filter(v => !idsSet.has(v.id));
    });

    // Persist to IndexedDB (fire-and-forget)
    this.persistValues();
  }

  /**
   * Discard (permanently remove) unpublished relations from the store and IndexedDB
   */
  public discardRelations(relationIds: string[]): void {
    const idsSet = new Set(relationIds);

    reactiveRelations.set(prev => {
      return prev.filter(r => !idsSet.has(r.id));
    });

    // Persist to IndexedDB (fire-and-forget)
    this.persistRelations();
  }

  /**
   * Find all entities that reference the given entity in their relations
   */
  public findReferencingEntities(id: string): string[] {
    const referencingEntities: string[] = [];

    const relations = reactiveRelations.get();

    // Check base relations
    relations.forEach(relation => {
      if (relation.toEntity.id === id) {
        referencingEntities.push(relation.fromEntity.id);
      }
    });

    return referencingEntities;
  }

  public setAsPublished(valueIds: string[], relationIds: string[]) {
    const valueIdsSet = new Set(valueIds);
    const relationIdsSet = new Set(relationIds);

    reactiveValues.set(prev => {
      const [unpublished, published] = A.partition(prev, v => valueIdsSet.has(v.id));

      return [
        ...unpublished,
        ...published.map(p => {
          return produce(p, draft => {
            draft.hasBeenPublished = true;
          });
        }),
      ];
    });

    reactiveRelations.set(prev => {
      const [unpublished, published] = A.partition(prev, r => relationIdsSet.has(r.id));

      return [
        ...unpublished,
        ...published.map(p => {
          return produce(p, draft => {
            draft.hasBeenPublished = true;
          });
        }),
      ];
    });

    // Clear published items from IndexedDB (fire-and-forget)
    this.clearPublishedFromIndexedDB(valueIds, relationIds);
  }
}
