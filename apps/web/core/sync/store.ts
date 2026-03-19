import { SystemIds } from '@geoprotocol/geo-sdk';
import { createAtom } from '@xstate/store';
import { Array as A } from 'effect';
import { produce } from 'immer';

import { FORMAT_PROPERTY, RENDERABLE_TYPE_PROPERTY, UNIT_PROPERTY } from '../constants';
import { readTypes } from '../database/entities';
import { getStrictRenderableType } from '../io/dto/properties';
import { DataType, Entity, Property, Relation, Value } from '../types';
import { Entities } from '../utils/entity';
import { getSpaceRank } from '../utils/space/space-ranking';
import { WhereCondition } from './experimental_query-layer';
import { GeoEventStream } from './stream';

type ReadOptions = { includeDeleted?: boolean; spaceId?: string };

function relationKey(r: Relation): string {
  return `${r.fromEntity.id}:${r.type.id}:${r.toEntity.id}:${r.spaceId ?? ''}`;
}

/**
 * Stable JSON stringify that produces consistent output regardless of object key order.
 * This ensures query keys are deterministic for TanStack Query cache hits.
 *
 * Particularly important for WhereCondition objects where key order may vary
 * depending on how the object was constructed.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }

  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value as object).sort();
    const pairs = sortedKeys.map(key => {
      const v = (value as Record<string, unknown>)[key];
      return JSON.stringify(key) + ':' + stableStringify(v);
    });
    return '{' + pairs.join(',') + '}';
  }

  return JSON.stringify(value);
}

export const reactiveValues = createAtom<Value[]>([]);
export const reactiveRelations = createAtom<Relation[]>([]);
export const syncedEntities = new Map<string, Entity>();

// Lazy indexes for O(1) entity lookups instead of O(N) array scans.
// Rebuilt automatically when the underlying array reference changes.
let _valueIndex: Map<string, Value[]> = new Map();
let _valueIndexSource: Value[] | null = null;

function getValueIndex(): Map<string, Value[]> {
  const current = reactiveValues.get();
  if (current !== _valueIndexSource) {
    _valueIndex = new Map();
    for (const v of current) {
      const key = v.entity.id;
      const arr = _valueIndex.get(key);
      if (arr) arr.push(v);
      else _valueIndex.set(key, [v]);
    }
    _valueIndexSource = current;
  }
  return _valueIndex;
}

let _relationIndex: Map<string, Relation[]> = new Map();
let _relationIndexSource: Relation[] | null = null;

function getRelationIndex(): Map<string, Relation[]> {
  const current = reactiveRelations.get();
  if (current !== _relationIndexSource) {
    _relationIndex = new Map();
    for (const r of current) {
      const key = r.fromEntity.id;
      const arr = _relationIndex.get(key);
      if (arr) arr.push(r);
      else _relationIndex.set(key, [r]);
    }
    _relationIndexSource = current;
  }
  return _relationIndex;
}

export function resolveRelationNames(r: Relation): Relation {
  const resolvedFromName = resolveEntityName(r.fromEntity.id) ?? r.fromEntity.name;
  const resolvedToName = resolveEntityName(r.toEntity.id) ?? r.toEntity.name;
  const resolvedTypeName = resolveEntityName(r.type.id) ?? r.type.name;

  if (
    resolvedFromName === r.fromEntity.name &&
    resolvedToName === r.toEntity.name &&
    resolvedTypeName === r.type.name
  ) {
    return r;
  }

  return {
    ...r,
    type: { ...r.type, name: resolvedTypeName },
    fromEntity: { ...r.fromEntity, name: resolvedFromName },
    toEntity: { ...r.toEntity, name: resolvedToName },
  };
}

function resolveEntityName(entityId: string): string | null {
  const entityValues = getValueIndex().get(entityId) ?? [];
  const nameValues = entityValues.filter(
    v => v.property.id === SystemIds.NAME_PROPERTY && !v.isDeleted
  );

  if (nameValues.length === 0) {
    const synced = syncedEntities.get(entityId);
    return synced?.name ?? null;
  }

  if (nameValues.length === 1) return nameValues[0].value ?? null;

  // Pick the name from the highest-ranked space
  return nameValues.reduce((a, b) => (getSpaceRank(a.spaceId) <= getSpaceRank(b.spaceId) ? a : b)).value ?? null;
}

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
  }

  private syncEntities(entities: Entity[]) {
    this.hydrateWith(entities);

    if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_STORE_LOGGING !== '0') {
      console.log(`
Finished syncing entities to store.
Entity ids: ${entities.map(e => e.id).join(', ')}`);
    }
  }

  static queryKey(id?: string) {
    return ['store', 'entity', id];
  }

  static queryKeys(where: WhereCondition, first?: number, skip?: number) {
    return ['store', 'entities', stableStringify(where), first, skip];
  }

  clear() {
    const entitiesToSync = this.getEntities();

    this.properties.clear();
    this.pendingDataTypes.clear();

    this.stream.emit({ type: GeoEventStream.HYDRATE, entities: entitiesToSync.map(e => e.id) });
  }

  /**
   * Clear all local (unpublished) changes for a specific space.
   * This removes local values and relations, then re-hydrates the affected entities.
   */
  clearLocalChangesForSpace(spaceId: string) {
    const localValues = reactiveValues.get().filter(v => v.spaceId === spaceId && v.isLocal === true);
    const localRelations = reactiveRelations.get().filter(r => r.spaceId === spaceId && r.isLocal === true);

    const affectedEntityIds = new Set<string>();

    // Collect affected entity IDs before removing
    for (const value of localValues) {
      affectedEntityIds.add(value.entity.id);
    }
    for (const relation of localRelations) {
      affectedEntityIds.add(relation.fromEntity.id);
    }

    const localValueIds = new Set(localValues.map(v => v.id));
    const localRelationIds = new Set(localRelations.map(r => r.id));

    // Remove local values for this space
    reactiveValues.set(prev => prev.filter(v => !localValueIds.has(v.id)));

    // Remove local relations for this space
    reactiveRelations.set(prev => prev.filter(r => !localRelationIds.has(r.id)));

    // Re-hydrate affected entities to restore their server state
    if (affectedEntityIds.size > 0) {
      this.stream.emit({ type: GeoEventStream.HYDRATE, entities: [...affectedEntityIds] });
    }

    this.stream.emit({ type: GeoEventStream.LOCAL_CHANGES_CLEARED, spaceId });
  }

  /**
   * Clear specific local (unpublished) changes by ID.
   * Only local rows are removed so synced server state is preserved.
   */
  clearLocalChangesByIds(params: { spaceId: string; valueIds: string[]; relationIds: string[] }) {
    const { spaceId, valueIds, relationIds } = params;
    if (valueIds.length === 0 && relationIds.length === 0) return;

    const valueIdsSet = new Set(valueIds);
    const relationIdsSet = new Set(relationIds);
    const affectedEntityIds = new Set<string>();

    const currentValues = reactiveValues.get();
    const currentRelations = reactiveRelations.get();

    for (const value of currentValues) {
      if (valueIdsSet.has(value.id) && value.isLocal === true) {
        affectedEntityIds.add(value.entity.id);
      }
    }

    for (const relation of currentRelations) {
      if (relationIdsSet.has(relation.id) && relation.isLocal === true) {
        affectedEntityIds.add(relation.fromEntity.id);
      }
    }

    reactiveValues.set(prev => prev.filter(v => !(valueIdsSet.has(v.id) && v.isLocal === true)));
    reactiveRelations.set(prev => prev.filter(r => !(relationIdsSet.has(r.id) && r.isLocal === true)));

    if (affectedEntityIds.size > 0) {
      this.stream.emit({ type: GeoEventStream.HYDRATE, entities: [...affectedEntityIds] });
    }

    this.stream.emit({ type: GeoEventStream.LOCAL_CHANGES_CLEARED, spaceId });
  }

  public hydrateWith(entities: Entity[]) {
    for (const entity of entities) {
      syncedEntities.set(entity.id, entity);
    }

    const newValues = entities.flatMap(e => e.values);
    const newRelations = entities.flatMap(e => e.relations);

    if (newValues.length === 0 && newRelations.length === 0) return;

    const valueIdsToWrite = new Set(newValues.map(t => t.id));
    const relationIdsToWrite = new Set(newRelations.map(t => t.id));

    if (newValues.length > 0) {
      reactiveValues.set(prev => {
        const prevById = new Map(prev.map(v => [v.id, v]));
        const mergedIncoming = newValues.map(v => {
          const local = prevById.get(v.id);
          return local && local.isLocal && (!local.hasBeenPublished || local.isDeleted) ? local : v;
        });
        const unchangedValues = prev.filter(t => !valueIdsToWrite.has(t.id));
        return [...unchangedValues, ...mergedIncoming];
      });
    }

    if (newRelations.length > 0) {
      reactiveRelations.set(prev => {
        const prevById = new Map(prev.map(r => [r.id, r]));
        const deletedRelationKeys = new Set(
          prev.filter(r => r.isDeleted && r.isLocal).map(r => relationKey(r))
        );
        const mergedIncoming = newRelations
          .filter(r => !deletedRelationKeys.has(relationKey(r)))
          .map(r => {
            const local = prevById.get(r.id);
            return local && local.isLocal && (!local.hasBeenPublished || local.isDeleted) ? local : r;
          });
        const unchangedRelations = prev.filter(t => !relationIdsToWrite.has(t.id));
        return [...unchangedRelations, ...mergedIncoming];
      });
    }
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
      values: values.filter(v => (options.spaceId ? v.spaceId === options.spaceId : true)),
      relations: relations.filter(
        r => (includeDeleted || !r.isDeleted) && (options.spaceId ? r.spaceId === options.spaceId : true)
      ),
    };

    resolvedEntity.relations = resolvedEntity.relations.map(resolveRelationNames);

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
    const values = getValueIndex().get(entityId) ?? [];

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

    const dataType = pendingDataType ?? stableDataType ?? null;

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

    const formatValue = entity?.values.find(v => v.property.id === FORMAT_PROPERTY);
    const unitRelation = entity?.relations.find(t => t.type.id === UNIT_PROPERTY);

    return {
      id,
      name: entity?.name ?? null,
      dataType: dataType,
      relationValueTypes,
      renderableType: renderableTypeId,
      renderableTypeStrict: getStrictRenderableType(renderableTypeId),
      format: formatValue?.value ?? null,
      unit: unitRelation?.toEntity.id ?? null,
    };
  }

  getStableDataType(id: string): DataType | null {
    return this.dataTypes.get(id) ?? null;
  }

  /**
   * Get all relations for an entity including optimistic updates
   */
  public getResolvedRelations(entityId: string, includeDeleted = false): Relation[] {
    const relations = getRelationIndex().get(entityId) ?? [];

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

    reactiveRelations.set(prev => {
      const unchangedRelations = prev.filter(t => t.id !== newRelation.id);
      return [...unchangedRelations, newRelation];
    });

    this.stream.emit({ type: GeoEventStream.RELATION_DELETED, relation: newRelation });
  }

  /**
   * Delete multiple values in one update to avoid multiple re-renders (e.g. entity delete).
   */
  public deleteValues(values: Value[]): void {
    if (values.length === 0) return;
    const deletedIds = new Set(values.map(v => v.id));
    const newValues = values.map(v =>
      produce(v, draft => {
        draft.hasBeenPublished = false;
        draft.isDeleted = true;
        draft.isLocal = true;
        draft.timestamp = new Date().toISOString();
      })
    );
    reactiveValues.set(prev => {
      const unchanged = prev.filter(t => !deletedIds.has(t.id));
      return [...unchanged, ...newValues];
    });
    newValues.forEach(v => this.stream.emit({ type: GeoEventStream.VALUES_DELETED, value: v }));
  }

  /**
   * Delete multiple relations in one update to avoid multiple re-renders (e.g. entity delete).
   */
  public deleteRelations(relations: Relation[]): void {
    if (relations.length === 0) return;
    const deletedIds = new Set(relations.map(r => r.id));
    const newRelations = relations.map(r =>
      produce(r, draft => {
        draft.hasBeenPublished = false;
        draft.isDeleted = true;
        draft.isLocal = true;
        draft.timestamp = new Date().toISOString();
      })
    );
    reactiveRelations.set(prev => {
      const unchanged = prev.filter(t => !deletedIds.has(t.id));
      return [...unchanged, ...newRelations];
    });
    newRelations.forEach(r => this.stream.emit({ type: GeoEventStream.RELATION_DELETED, relation: r }));
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

    this.stream.emit({ type: GeoEventStream.CHANGES_PUBLISHED, valueIds, relationIds });
  }
}
