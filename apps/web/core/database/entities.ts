'use client';

import { SystemIds } from '@geoprotocol/geo-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { dedupeWith } from 'effect/Array';
import { useMemo } from 'react';

import { getProperties } from '../io/queries';
import { queryClient } from '../query-client';
import { E } from '../sync/orm';
import { useQueryEntity } from '../sync/use-store';
import { store as geoStore } from '../sync/use-sync-engine';
import { EntityWithSchema, Property, Relation } from '../types';
import { Entities } from '../utils/entity';

type UseEntityOptions = {
  spaceId?: string;
  id: string;
};

export function useEntity(options: UseEntityOptions): EntityWithSchema {
  const { spaceId, id } = options;

  const { entity } = useQueryEntity({
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
  const stableTypeKey = useMemo(() => types.map(t => t.id).sort(), [types]);
  const stableRelationKey = useMemo(
    () => [...new Set(relations.map(r => `${r.type.id}:${r.toEntity.id}`))].sort(),
    [relations]
  );

  const { data: schema } = useQuery({
    enabled: types.length > 0 || relations.length > 0,
    queryKey: ['entity-schema-for-merging', id, stableTypeKey, stableRelationKey],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      return await getSchemaFromTypeIdsAndRelations(
        types.map(t => t.id),
        relations
      );
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
  },
  {
    id: SystemIds.COVER_PROPERTY,
    name: 'Cover',
    dataType: 'RELATION',
    renderableType: 'IMAGE',
  },
];

/**
 * Fetch the entities for each type and parse their attributes into a schema.
 *
 * A entity with Types -> Type can specify a schema that all entities of that
 * type should adhere to. Currently schemas are optional.
 *
 * We expect that attributes are only defined via relations, not triples.
 */
export async function getSchemaFromTypeIds(typesIds: string[]): Promise<Property[]> {
  const dedupedTypeIds = [...new Set(typesIds)];

  // @TODO(migration): Should generate schema by syncing types
  const typeEntities = await E.findMany({
    store: geoStore,
    cache: queryClient,
    where: {
      id: {
        in: dedupedTypeIds,
      },
    },
    first: 100,
    skip: 0,
  });

  const propertyIds = typeEntities
    .flatMap(entity => {
      return entity.relations.filter(r => r.type.id === SystemIds.PROPERTIES);
    })
    .map(r => r.toEntity.id);

  const properties = await Effect.runPromise(getProperties(propertyIds));

  // If the schema exists already in the list then we should dedupe it.
  // Some types might share some elements in their schemas, e.g., Person
  // and Pet both have Avatar as part of their schema.
  return dedupeWith([...DEFAULT_ENTITY_SCHEMA, ...properties], (a, b) => a.id === b.id);
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
  typeIds: string[],
  relations: Relation[]
): Promise<Property[]> {
  const typeSchema = await getSchemaFromTypeIds(typeIds);

  if (relations.length === 0) return typeSchema;

  // Batch-fetch property definitions for all unique relation types
  const relationTypeIds = [...new Set(relations.map(r => r.type.id))];
  const relationProperties = await Effect.runPromise(getProperties(relationTypeIds));

  // Find which relation types have isType=true
  const isTypePropertyIds = new Set(
    relationProperties.filter(p => p.isType).map(p => p.id)
  );

  if (isTypePropertyIds.size === 0) return typeSchema;

  // Collect target entity IDs from matching relations
  const targetIds = [...new Set(
    relations
      .filter(r => isTypePropertyIds.has(r.type.id))
      .map(r => r.toEntity.id)
  )];

  // Fetch target entities to get their PROPERTIES relations
  const targetEntities = await E.findMany({
    store: geoStore,
    cache: queryClient,
    where: { id: { in: targetIds } },
    first: 100,
    skip: 0,
  });

  const additionalPropertyIds = targetEntities
    .flatMap(entity => entity.relations.filter(r => r.type.id === SystemIds.PROPERTIES))
    .map(r => r.toEntity.id);

  if (additionalPropertyIds.length === 0) return typeSchema;

  const additionalProperties = await Effect.runPromise(getProperties(additionalPropertyIds));

  return dedupeWith([...typeSchema, ...additionalProperties], (a, b) => a.id === b.id);
}
