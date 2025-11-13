'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Effect } from 'effect';
import { dedupeWith } from 'effect/Array';

import { getBatchEntities, getProperties } from '../io/v2/queries';
import { useQueryEntity } from '../sync/use-store';
import { Entities } from '../utils/entity';
import { EntityWithSchema, Property, Relation } from '../v2.types';

const IS_TYPE_PROPERTY_ID = 'd2c1a101-14e3-464a-8272-f4e75b0f1407';

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

  const { data: schema } = useQuery({
    enabled: types.length > 0,
    queryKey: ['entity-schema-for-merging', id, types],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      return await getSchemaFromTypeIds(types.map(t => t.id));
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

  const typeEntities = await Effect.runPromise(getBatchEntities(dedupedTypeIds));

  const propertyIds = typeEntities
    .flatMap(entity => entity.relations.filter(r => r.type.id === SystemIds.PROPERTIES))
    .map(r => r.toEntity.id);

  const properties = await Effect.runPromise(getProperties(propertyIds));

  const propertyEntities = await Effect.runPromise(getBatchEntities(propertyIds));

  const typePropertyIds = propertyEntities
    .filter(entity => {
      const isTypePropertyValue = entity.values.find(v => v.property.id === IS_TYPE_PROPERTY_ID);
      return isTypePropertyValue?.value === '1';
    })
    .map(e => e.id);

  let additionalPropertyIds: string[] = [];

  if (typePropertyIds.length > 0) {
    const typePropertyEntities = propertyEntities.filter(e => typePropertyIds.includes(e.id));

    additionalPropertyIds = typePropertyEntities
      .flatMap(entity => entity.relations.filter(r => r.type.id === SystemIds.PROPERTIES))
      .map(r => r.toEntity.id);
  }

  let additionalProperties: Property[] = [];

  if (additionalPropertyIds.length > 0) {
    additionalProperties = await Effect.runPromise(getProperties(additionalPropertyIds));
  }

  // If the schema exists already in the list then we should dedupe it.
  // Some types might share some elements in their schemas, e.g., Person
  // and Pet both have Avatar as part of their schema.
  return dedupeWith([...DEFAULT_ENTITY_SCHEMA, ...properties, ...additionalProperties], (a, b) => a.id === b.id);
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
