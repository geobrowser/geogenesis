'use client';

import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useMemo } from 'react';

import { Effect } from 'effect';
import { dedupeWith } from 'effect/Array';

import { COLLAPSED_PROPERTY, DATA_TYPE_PROPERTY, PROPERTY_GROUPS_PROPERTY } from '../constants';
import { getProperties } from '../io/queries';
import { queryClient } from '../query-client';
import { E } from '../sync/orm';
import { useQueryEntity } from '../sync/use-store';
import { store as geoStore } from '../sync/use-sync-engine';
import { Entity, EntityWithSchema, Property, Relation } from '../types';
import { Entities } from '../utils/entity';
import { sortRelations } from '../utils/utils';

function orderEntitiesByIdList<T extends { id: string }>(ids: string[], entities: T[]): T[] {
  const byId = new Map(entities.map(e => [e.id, e]));
  return ids.map(id => byId.get(id)).filter((e): e is T => e != null);
}

function orderPropertiesByIdList(ids: string[], fetched: Property[]): Property[] {
  const byId = new Map(fetched.map(p => [p.id, p]));
  const seen = new Set<string>();
  const ordered: Property[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const p = byId.get(id);
    if (p) ordered.push(p);
  }
  return ordered;
}

function dedupeTypesPreserveOrder(types: { id: string; spaceId?: string }[]): { id: string; spaceId?: string }[] {
  const seen = new Set<string>();
  const out: { id: string; spaceId?: string }[] = [];
  for (const t of types) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

type UseEntityOptions = {
  spaceId?: string;
  id: string;
};

export type SchemaPropertyGroup = {
  id: string;
  name: string | null;
  collapsed: boolean;
  propertyIds: string[];
  source: 'type' | 'isType';
};

export type EntitySchemaWithGroups = {
  schema: Property[];
  propertyGroups: SchemaPropertyGroup[];
  ungroupedPropertyIds: string[];
  hasPropertyGroups: boolean;
};

function readEntityValue(entity: Entity, propertyId: string, preferredSpaceId?: string): string | null {
  const inPreferredSpace = preferredSpaceId
    ? entity.values.find(v => v.property.id === propertyId && v.spaceId === preferredSpaceId)
    : null;

  if (inPreferredSpace?.value != null) return inPreferredSpace.value;

  const anyValue = entity.values.find(v => v.property.id === propertyId);
  return anyValue?.value ?? null;
}

function readBooleanEntityValue(entity: Entity, propertyId: string, preferredSpaceId?: string): boolean {
  const value = readEntityValue(entity, propertyId, preferredSpaceId);
  if (!value) return false;

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function selectRelationsByType(entity: Entity, relationTypeId: string, preferredSpaceId?: string): Relation[] {
  const relationsOfType = entity.relations.filter(r => r.type.id === relationTypeId);
  if (!preferredSpaceId) return relationsOfType;

  const preferredSpaceRelations = relationsOfType.filter(r => r.spaceId === preferredSpaceId);
  if (preferredSpaceRelations.length > 0) return preferredSpaceRelations;

  const topSpaceId = entity.spaces[0];
  if (!topSpaceId || topSpaceId === preferredSpaceId) return relationsOfType;

  const topSpaceRelations = relationsOfType.filter(r => r.spaceId === topSpaceId);
  return topSpaceRelations.length > 0 ? topSpaceRelations : relationsOfType;
}

export function useEntity(options: UseEntityOptions): EntityWithSchema & { isLoading: boolean } {
  const { spaceId, id } = options;

  const { entity, isLoading } = useQueryEntity({
    id: id,
    spaceId: spaceId,
  });

  // If the caller passes in a set of data we use that for merging. If not,
  // we fetch the entity from the server and merge it with the local state.

  const values = entity?.values ?? [];
  const relations = entity?.relations ?? [];

  const name = Entities.name(values ?? []);
  const spaces = entity?.spaces ?? [];
  const description = Entities.description(values);
  const types = readTypes(relations);

  // Extract type+space pairs from relations. Use toSpaceId (the type
  // entity's space) when available, falling back to the relation's spaceId.
  // Deduped by type ID: an entity should only have one TYPES_PROPERTY
  // relation per type. If duplicates exist the first space wins.
  const typesWithSpace = useMemo(
    () =>
      dedupeWith(
        relations
          .filter(r => r.type.id === SystemIds.TYPES_PROPERTY)
          .map(r => ({ id: r.toEntity.id, spaceId: r.toSpaceId })),
        (a, b) => a.id === b.id
      ),
    [relations]
  );

  const stableTypeKey = useMemo(
    () => typesWithSpace.map(t => `${t.id}:${t.spaceId ?? ''}`).join('|'),
    [typesWithSpace]
  );
  const stableRelationKey = useMemo(
    () => [...new Set(relations.map(r => `${r.type.id}:${r.toEntity.id}:${r.toSpaceId ?? ''}`))].sort(),
    [relations]
  );

  const { data: schema } = useQuery({
    enabled: types.length > 0 || relations.length > 0,
    queryKey: ['entity-schema-for-merging', id, spaceId, stableTypeKey, stableRelationKey],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      return await getSchemaFromTypeIdsAndRelations(typesWithSpace, relations);
    },
  });

  return {
    id,
    name,
    spaces,
    description,
    schema: schema ?? DEFAULT_ENTITY_SCHEMA,
    values: values,
    relations: relations,
    types,
    isLoading,
  };
}

// Name, description, and types are always required for every entity even
// if they aren't defined in the schema.
export const DEFAULT_ENTITY_SCHEMA: Property[] = [
  {
    id: SystemIds.NAME_PROPERTY,
    name: 'Name',
    dataType: 'TEXT',
  },
  {
    id: SystemIds.DESCRIPTION_PROPERTY,
    name: 'Description',
    dataType: 'TEXT',
  },
  {
    id: SystemIds.TYPES_PROPERTY,
    name: 'Types',
    dataType: 'RELATION',
    relationValueTypes: [{ id: SystemIds.SCHEMA_TYPE, name: 'Type' }],
  },
  {
    id: SystemIds.COVER_PROPERTY,
    name: 'Cover',
    dataType: 'RELATION',
    renderableType: 'IMAGE',
  },
];

/**
 * Two-phase fetch: fetches entities grouped by spaceId, then re-fetches any
 * that came back with no relations using the entity's own top-ranked space.
 * Needed because the GraphQL API filters relationsList by spaceId.
 */
async function fetchEntitiesWithRelations(
  ids: string[],
  spaceByEntity: Map<string, string | undefined>,
  options: { requiredRelationTypeId?: string } = {}
): Promise<Entity[]> {
  if (ids.length === 0) return [];

  const idsBySpace = new Map<string | undefined, string[]>();
  for (const id of ids) {
    const space = spaceByEntity.get(id);
    const group = idsBySpace.get(space) ?? [];
    group.push(id);
    idsBySpace.set(space, group);
  }

  let entities = (
    await Promise.all(
      [...idsBySpace.entries()].map(([spaceId, entityIds]) =>
        E.findMany({
          store: geoStore,
          cache: queryClient,
          where: { id: { in: entityIds } },
          spaceId,
          first: 100,
        })
      )
    )
  ).flat();

  // Re-fetch entities whose requested space did not include the relations we
  // need and whose top-ranked space differs from the space we fetched with.
  const missingEntities = entities.filter(entity => {
    const hasRequiredRelations = options.requiredRelationTypeId
      ? entity.relations.some(r => r.type.id === options.requiredRelationTypeId)
      : entity.relations.length > 0;
    if (hasRequiredRelations) return false;
    const fetchedSpace = spaceByEntity.get(entity.id);
    return entity.spaces.length > 0 && entity.spaces[0] !== fetchedSpace;
  });

  if (missingEntities.length > 0) {
    const retryBySpace = new Map<string, string[]>();
    for (const entity of missingEntities) {
      const space = entity.spaces[0];
      const group = retryBySpace.get(space) ?? [];
      group.push(entity.id);
      retryBySpace.set(space, group);
    }

    const retried = (
      await Promise.all(
        [...retryBySpace.entries()].map(([spaceId, entityIds]) =>
          E.findMany({
            store: geoStore,
            cache: queryClient,
            where: { id: { in: entityIds } },
            spaceId,
            first: 100,
          })
        )
      )
    ).flat();

    const retriedById = new Map(retried.map(e => [e.id, e]));
    entities = entities.map(e => retriedById.get(e.id) ?? e);
  }

  return entities;
}

export async function getSchemaFromTypeIds(
  types: { id: string; spaceId?: string }[],
  filterSpaceIds?: string[],
  options?: { includeAllTypeSpaces?: boolean }
): Promise<Property[]> {
  if (types.length === 0) return [...DEFAULT_ENTITY_SCHEMA];

  const typesInEntityOrder = dedupeTypesPreserveOrder(types);
  const spaceByType = new Map(typesInEntityOrder.map(t => [t.id, t.spaceId]));
  const dedupedTypeIds = typesInEntityOrder.map(t => t.id);

  const typeEntities = await fetchEntitiesWithRelations(dedupedTypeIds, spaceByType);
  const typeEntitiesOrdered = orderEntitiesByIdList(dedupedTypeIds, typeEntities);

  const nativePropertyIds = typeEntitiesOrdered.flatMap(entity => {
    const typeSpaceId = spaceByType.get(entity.id) ?? entity.spaces[0];
    const props = entity.relations.filter(r => r.type.id === SystemIds.PROPERTIES);
    const primarySpaceProps = sortRelations(props.filter(r => (typeSpaceId ? r.spaceId === typeSpaceId : true)));

    // A multi-space type defines a property list per space iteration. Union
    // them (primary space first so its ordering wins) so properties the type
    // only defines in non-primary spaces stay sortable/filterable (GEO-2202).
    const otherSpaceProps = options?.includeAllTypeSpaces
      ? sortRelations(props.filter(r => (typeSpaceId ? r.spaceId !== typeSpaceId : false)))
      : [];

    return [...primarySpaceProps, ...otherSpaceProps].map(r => r.toEntity.id);
  });

  // Collect additional properties from filter-specified spaces (e.g. a type
  // may define extra properties in a space different from its native one).
  let filterPropertyIds: string[] = [];
  if (filterSpaceIds && filterSpaceIds.length > 0) {
    const uniqueFilterSpaces = [...new Set(filterSpaceIds)];
    const results = await Promise.all(
      uniqueFilterSpaces.map(async spaceId => {
        const spaceMap = new Map(dedupedTypeIds.map(id => [id, spaceId] as const));
        const entities = await fetchEntitiesWithRelations(dedupedTypeIds, spaceMap);
        return { spaceId, entities };
      })
    );

    filterPropertyIds = results.flatMap(({ spaceId, entities }) =>
      orderEntitiesByIdList(dedupedTypeIds, entities).flatMap(entity => {
        const props = entity.relations.filter(r => r.type.id === SystemIds.PROPERTIES && r.spaceId === spaceId);
        return sortRelations(props).map(r => r.toEntity.id);
      })
    );
  }

  const allPropertyIds = [...new Set([...nativePropertyIds, ...filterPropertyIds])];

  if (allPropertyIds.length === 0) return [...DEFAULT_ENTITY_SCHEMA];

  const fetched = await Effect.runPromise(getProperties(allPropertyIds));
  const orderedProperties = orderPropertiesByIdList(allPropertyIds, fetched);

  return dedupeWith([...DEFAULT_ENTITY_SCHEMA, ...orderedProperties], (a, b) => a.id === b.id);
}

/**
 * Types are defined either a relation with a Relation type of SystemIds.TYPES_PROPERTY,
 * or a triple with an attribute id of SystemIds.TYPES_PROPERTY. We expect that only
 * system entities will use the triples approach, mostly to avoid recursive
 * type definitions.
 *
 * This function reads both type locations and merges them into a single list.
 *
 * The triples and relations here should already be merged with the entity's
 * local and remote state.
 */
export function readTypes(relations: Relation[]): { id: string; name: string | null }[] {
  const typeIdsViaRelations = relations
    .filter(r => r.type.id === SystemIds.TYPES_PROPERTY)
    .map(r => ({
      id: r.toEntity.id,
      name: r.toEntity.name,
    }));

  return dedupeWith(typeIdsViaRelations, (a, b) => a.id === b.id);
}

/**
 * Compute schema from both explicit type IDs and IS_TYPE_PROPERTY relations.
 *
 * When a property has isType set to true, relations using that property
 * cause the target entity's properties to be inherited into the source
 * entity's schema.
 *
 * 1. Fetch the type-based schema (existing behavior)
 * 2. Batch-fetch property definitions for each unique relation type
 * 3. Filter to those with isType=true, collect their target entity IDs
 * 4. Fetch those targets' PROPERTIES to get additional schema properties
 */
export async function getSchemaFromTypeIdsAndRelations(
  types: { id: string; spaceId?: string }[],
  relations: Relation[]
): Promise<Property[]> {
  const typeSchema = await getSchemaFromTypeIds(types);
  let dataTypeSchema: Property[] = [];

  const isPropertyEntity = types.some(t => t.id === SystemIds.PROPERTY);
  if (isPropertyEntity) {
    const dataTypeRelations = relations.filter(r => r.type.id === DATA_TYPE_PROPERTY);
    if (dataTypeRelations.length > 0) {
      const dataTypeIds = [...new Set(dataTypeRelations.map(r => r.toEntity.id))];
      const spaceByDataType = new Map(dataTypeRelations.map(r => [r.toEntity.id, r.toSpaceId ?? r.spaceId]));

      const dataTypeEntities = await fetchEntitiesWithRelations(dataTypeIds, spaceByDataType);
      const dataTypeEntitiesOrdered = orderEntitiesByIdList(dataTypeIds, dataTypeEntities);

      const dataTypePropertyIds = dataTypeEntitiesOrdered.flatMap(entity => {
        const props = entity.relations.filter(r => r.type.id === SystemIds.PROPERTIES);
        return sortRelations(props).map(r => r.toEntity.id);
      });

      if (dataTypePropertyIds.length > 0) {
        const dataTypeIdsUnique = [...new Set(dataTypePropertyIds)];
        const fetchedDt = await Effect.runPromise(getProperties(dataTypeIdsUnique));
        dataTypeSchema = orderPropertiesByIdList(dataTypeIdsUnique, fetchedDt);
      }
    }
  }

  const baseSchema = dedupeWith([...typeSchema, ...dataTypeSchema], (a, b) => a.id === b.id);

  if (relations.length === 0) return baseSchema;

  // Batch-fetch property definitions for all unique relation types
  const relationTypeIds = [...new Set(relations.map(r => r.type.id))];
  const relationProperties = await Effect.runPromise(getProperties(relationTypeIds));

  // Find which relation types have isType=true
  const isTypePropertyIds = new Set(relationProperties.filter(p => p.isType).map(p => p.id));

  if (isTypePropertyIds.size === 0) return baseSchema;

  // Collect target entity IDs from matching IS_TYPE relations. A toSpaceId is
  // an explicit target-space override; otherwise resolve via the target's own
  // top-ranked space.
  const isTypeRelations = relations.filter(r => isTypePropertyIds.has(r.type.id));
  const targetIds = [...new Set(isTypeRelations.map(r => r.toEntity.id))];
  const spaceByTarget = new Map(isTypeRelations.map(r => [r.toEntity.id, r.toSpaceId]));

  const targetEntities = await fetchEntitiesWithRelations(targetIds, spaceByTarget, {
    requiredRelationTypeId: SystemIds.PROPERTIES,
  });
  const targetEntitiesOrdered = orderEntitiesByIdList(targetIds, targetEntities);

  const additionalPropertyIds = targetEntitiesOrdered.flatMap(entity => {
    const targetSpaceId = spaceByTarget.get(entity.id) ?? entity.spaces[0];
    const props = selectRelationsByType(entity, SystemIds.PROPERTIES, targetSpaceId);
    return sortRelations(props).map(r => r.toEntity.id);
  });

  if (additionalPropertyIds.length === 0) return baseSchema;

  const additionalIdsUnique = [...new Set(additionalPropertyIds)];
  const fetchedAdditional = await Effect.runPromise(getProperties(additionalIdsUnique));
  const additionalOrdered = orderPropertiesByIdList(additionalIdsUnique, fetchedAdditional);

  return dedupeWith([...baseSchema, ...additionalOrdered], (a, b) => a.id === b.id);
}

export async function getSchemaWithGroupsFromTypeIdsAndRelations(
  types: { id: string; spaceId?: string }[],
  relations: Relation[]
): Promise<EntitySchemaWithGroups> {
  const schema = await getSchemaFromTypeIdsAndRelations(types, relations);
  const defaultSchemaIds = new Set(DEFAULT_ENTITY_SCHEMA.map(p => p.id));

  const dedupedTypes = dedupeTypesPreserveOrder(types);
  const dedupedTypeIds = dedupedTypes.map(t => t.id);
  const spaceByType = new Map(dedupedTypes.map(t => [t.id, t.spaceId]));

  const typeEntities = await fetchEntitiesWithRelations(dedupedTypeIds, spaceByType);
  const typeEntitiesOrdered = orderEntitiesByIdList(dedupedTypeIds, typeEntities);

  const propertyGroupRefs: { id: string; spaceId?: string }[] = [];
  for (const entity of typeEntitiesOrdered) {
    const typeSpaceId = spaceByType.get(entity.id) ?? entity.spaces[0];
    const groupRelations = entity.relations.filter(
      r => r.type.id === PROPERTY_GROUPS_PROPERTY && (typeSpaceId ? r.spaceId === typeSpaceId : true)
    );
    for (const relation of sortRelations(groupRelations)) {
      propertyGroupRefs.push({
        id: relation.toEntity.id,
        spaceId: relation.toSpaceId ?? relation.spaceId,
      });
    }
  }

  const dedupedGroupRefs = dedupeWith(propertyGroupRefs, (a, b) => a.id === b.id);
  const groupSpaceByEntity = new Map(dedupedGroupRefs.map(g => [g.id, g.spaceId]));
  const groupEntities = await fetchEntitiesWithRelations(
    dedupedGroupRefs.map(g => g.id),
    groupSpaceByEntity
  );
  const groupEntitiesById = new Map(groupEntities.map(entity => [entity.id, entity]));

  let propertyGroups: SchemaPropertyGroup[] = [];
  const groupIdByPropertyId = new Map<string, string>();
  const globalSeenPropertyIds = new Set<string>();
  const ungroupedPropertyIds: string[] = [];

  for (const typeEntity of typeEntitiesOrdered) {
    const typeSpaceId = spaceByType.get(typeEntity.id) ?? typeEntity.spaces[0];
    const typePropertyRelations = typeEntity.relations.filter(
      r => r.type.id === SystemIds.PROPERTIES && (typeSpaceId ? r.spaceId === typeSpaceId : true)
    );
    const typePropertyIds = sortRelations(typePropertyRelations).map(r => r.toEntity.id);
    const typePropertyIdSet = new Set(typePropertyIds);

    const groupedInType = new Set<string>();
    const typePropertyGroupRelations = sortRelations(
      typeEntity.relations.filter(
        r => r.type.id === PROPERTY_GROUPS_PROPERTY && (typeSpaceId ? r.spaceId === typeSpaceId : true)
      )
    );

    for (const groupRelation of typePropertyGroupRelations) {
      const groupId = groupRelation.toEntity.id;
      const groupEntity = groupEntitiesById.get(groupId);
      if (!groupEntity) continue;

      const groupSpaceId = groupRelation.toSpaceId ?? groupRelation.spaceId;
      const groupPropertyRelations = groupEntity.relations.filter(
        r => r.type.id === SystemIds.PROPERTIES && (groupSpaceId ? r.spaceId === groupSpaceId : true)
      );

      const rawGroupPropertyIds = sortRelations(groupPropertyRelations)
        .map(r => r.toEntity.id)
        .filter(propertyId => typePropertyIdSet.has(propertyId));

      const groupPropertyIds = rawGroupPropertyIds.filter(propertyId => {
        if (groupedInType.has(propertyId)) return false;
        groupedInType.add(propertyId);
        return true;
      });

      const uniqueGroupPropertyIds = groupPropertyIds.filter(propertyId => {
        if (globalSeenPropertyIds.has(propertyId)) return false;
        globalSeenPropertyIds.add(propertyId);
        return true;
      });

      propertyGroups.push({
        id: groupId,
        name: readEntityValue(groupEntity, SystemIds.NAME_PROPERTY, groupSpaceId) ?? groupEntity.name,
        collapsed: readBooleanEntityValue(groupEntity, COLLAPSED_PROPERTY, groupSpaceId),
        propertyIds: uniqueGroupPropertyIds,
        source: 'type',
      });

      for (const propertyId of uniqueGroupPropertyIds) {
        if (!groupIdByPropertyId.has(propertyId)) {
          groupIdByPropertyId.set(propertyId, groupId);
        }
      }
    }

    for (const propertyId of typePropertyIds) {
      if (groupedInType.has(propertyId) || globalSeenPropertyIds.has(propertyId)) continue;
      globalSeenPropertyIds.add(propertyId);
      ungroupedPropertyIds.push(propertyId);
    }
  }

  const relationTypeIds = [...new Set(relations.map(r => r.type.id))];
  if (relationTypeIds.length > 0) {
    const relationProperties = await Effect.runPromise(getProperties(relationTypeIds));
    const isTypePropertyIds = new Set(relationProperties.filter(p => p.isType).map(p => p.id));
    const orderedIsTypeRelations = sortRelations(relations.filter(r => isTypePropertyIds.has(r.type.id)));
    const uniqueIsTypeRefs = dedupeWith(
      orderedIsTypeRelations.map(r => ({
        relationId: r.id,
        triggerPropertyId: r.type.id,
        targetId: r.toEntity.id,
        targetName: r.toEntity.name,
        spaceId: r.toSpaceId,
      })),
      (a, b) => a.targetId === b.targetId && a.spaceId === b.spaceId
    );

    const isTypeSpaceByTarget = new Map(uniqueIsTypeRefs.map(r => [r.targetId, r.spaceId]));
    const isTypeEntities = await fetchEntitiesWithRelations(
      uniqueIsTypeRefs.map(r => r.targetId),
      isTypeSpaceByTarget,
      {
        requiredRelationTypeId: SystemIds.PROPERTIES,
      }
    );
    const isTypeEntitiesById = new Map(isTypeEntities.map(entity => [entity.id, entity]));
    const isTypeGroupsByParentGroupId = new Map<string, SchemaPropertyGroup[]>();
    const ungroupedIsTypeGroups: SchemaPropertyGroup[] = [];

    for (const relation of uniqueIsTypeRefs) {
      const targetEntity = isTypeEntitiesById.get(relation.targetId);
      if (!targetEntity) continue;

      const targetSpaceId = relation.spaceId ?? targetEntity.spaces[0];
      const targetPropertyRelations = selectRelationsByType(targetEntity, SystemIds.PROPERTIES, targetSpaceId);
      const targetPropertyIds = sortRelations(targetPropertyRelations).map(r => r.toEntity.id);
      const uniqueTargetPropertyIds = targetPropertyIds.filter(propertyId => {
        if (globalSeenPropertyIds.has(propertyId)) return false;
        globalSeenPropertyIds.add(propertyId);
        return true;
      });
      if (uniqueTargetPropertyIds.length === 0) continue;

      const isTypeGroup: SchemaPropertyGroup = {
        id: `is-type-${relation.relationId}`,
        name: relation.targetName ?? readEntityValue(targetEntity, SystemIds.NAME_PROPERTY, targetSpaceId),
        collapsed: false,
        propertyIds: uniqueTargetPropertyIds,
        source: 'isType',
      };

      const parentGroupId = groupIdByPropertyId.get(relation.triggerPropertyId);
      if (parentGroupId) {
        const groups = isTypeGroupsByParentGroupId.get(parentGroupId) ?? [];
        groups.push(isTypeGroup);
        isTypeGroupsByParentGroupId.set(parentGroupId, groups);
      } else {
        ungroupedIsTypeGroups.push(isTypeGroup);
      }
    }

    if (isTypeGroupsByParentGroupId.size > 0 || ungroupedIsTypeGroups.length > 0) {
      propertyGroups = [
        ...propertyGroups.flatMap(group => [group, ...(isTypeGroupsByParentGroupId.get(group.id) ?? [])]),
        ...ungroupedIsTypeGroups,
      ];
    }
  }

  // Synthetic isType groups are only meaningful as a layout hint when at
  // least one real type-defined group exists. Otherwise, keep the inherited
  // properties in the normal flat section so entity pages do not get a
  // type-named collapsible wrapper around their standard properties.
  const hasRealGroups = propertyGroups.some(group => group.source === 'type');
  let effectivePropertyGroups = propertyGroups;
  if (!hasRealGroups) {
    const syntheticPropertyIds = propertyGroups
      .filter(group => group.source === 'isType')
      .flatMap(group => group.propertyIds);

    const ungroupedSeen = new Set(ungroupedPropertyIds);
    for (const propertyId of syntheticPropertyIds) {
      if (ungroupedSeen.has(propertyId)) continue;
      ungroupedSeen.add(propertyId);
      ungroupedPropertyIds.push(propertyId);
    }

    effectivePropertyGroups = [];
  }

  const groupedPropertyIds = effectivePropertyGroups.flatMap(group => group.propertyIds);
  const groupedPropertyIdSet = new Set(groupedPropertyIds);
  const ungroupedSet = new Set(ungroupedPropertyIds);

  for (const property of schema) {
    if (defaultSchemaIds.has(property.id)) continue;
    if (groupedPropertyIdSet.has(property.id)) continue;
    if (ungroupedSet.has(property.id)) continue;
    ungroupedSet.add(property.id);
    ungroupedPropertyIds.push(property.id);
  }

  const schemaById = new Map(schema.map(property => [property.id, property]));
  const orderedSchema: Property[] = [];
  const seenSchemaIds = new Set<string>();

  for (const defaultProperty of DEFAULT_ENTITY_SCHEMA) {
    orderedSchema.push(defaultProperty);
    seenSchemaIds.add(defaultProperty.id);
  }

  for (const propertyId of [...groupedPropertyIds, ...ungroupedPropertyIds]) {
    if (seenSchemaIds.has(propertyId)) continue;
    const property = schemaById.get(propertyId);
    if (!property) continue;
    orderedSchema.push(property);
    seenSchemaIds.add(propertyId);
  }

  for (const property of schema) {
    if (seenSchemaIds.has(property.id)) continue;
    orderedSchema.push(property);
    seenSchemaIds.add(property.id);
  }

  return {
    schema: orderedSchema,
    propertyGroups: effectivePropertyGroups,
    ungroupedPropertyIds,
    hasPropertyGroups: effectivePropertyGroups.length > 0,
  };
}
