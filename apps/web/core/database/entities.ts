'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { dedupeWith } from 'effect/Array';

import { queryClient } from '../query-client';
import { E } from '../sync/orm';
import { useQueryEntity } from '../sync/use-store';
import { store as geoStore } from '../sync/use-sync-engine';
import { Entities } from '../utils/entity';
import { EntityWithSchema, PropertySchema, Relation, Value } from '../v2.types';

type UseEntityOptions = {
  spaceId?: string;
  id: string;
  initialData?: { spaces: string[]; values: Value[]; relations: Relation[] };
};

export function useEntity(options: UseEntityOptions): EntityWithSchema {
  const { spaceId, id, initialData } = options;

  const { entity } = useQueryEntity({
    id: id,
    spaceId: spaceId,
  });

  // If the caller passes in a set of data we use that for merging. If not,
  // we fetch the entity from the server and merge it with the local state.
  const data = entity ?? initialData;

  const values = data?.values ?? [];
  const relations = data?.relations ?? [];

  const name = Entities.name(values ?? []);
  const spaces = data?.spaces ?? [];
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
    values: data?.values ?? [],
    relations: relations,
    types,
  };
}

// Name, description, and types are always required for every entity even
// if they aren't defined in the schema.
export const DEFAULT_ENTITY_SCHEMA: PropertySchema[] = [
  {
    id: SystemIds.NAME_ATTRIBUTE,
    name: 'Name',
    dataType: 'TEXT',
  },
  {
    id: SystemIds.DESCRIPTION_ATTRIBUTE,
    name: 'Description',
    dataType: 'TEXT',
  },
  {
    id: SystemIds.TYPES_ATTRIBUTE,
    name: 'Types',
    dataType: 'RELATION',
  },
  {
    id: SystemIds.COVER_ATTRIBUTE,
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
export async function getSchemaFromTypeIds(typesIds: string[]): Promise<PropertySchema[]> {
  const dedupedTypeIds = [...new Set(typesIds)];

  const schemaEntities = await E.findMany({
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

  // @TODO(migration): Fetch types directly
  const schemaWithoutValueType = schemaEntities.flatMap((e): PropertySchema[] => {
    const attributeRelations = e.relations.filter(t => t.type.id === SystemIds.PROPERTIES);

    if (attributeRelations.length === 0) {
      return [];
    }

    return attributeRelations.map(a => ({
      id: a.toEntity.id,
      name: a.toEntity.name,

      // We add the correct value type below.
      dataType: 'TEXT', // @TODO(migration): Use types query
    }));
  });

  const attributes = await E.findMany({
    store: geoStore,
    cache: queryClient,
    where: {
      id: {
        in: schemaWithoutValueType.map(a => a.id),
      },
    },
    first: 100,
    skip: 0,
  });

  // const valueTypes = attributes.map(a => {
  //   const valueTypeId = a.relations.find(r => r.type.id === EntityId(SystemIds.VALUE_TYPE_ATTRIBUTE))?.toEntity.id;
  //   return {
  //     attributeId: a.id,
  //     valueTypeId,
  //   };
  // });

  const relationValueTypes = attributes.map(a => {
    const relationValueType = a.relations.find(r => r.type.id === SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE)?.toEntity;

    const relationValueTypes = a.relations
      .filter(r => r.type.id === SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE)
      .map(r => ({ typeId: r.toEntity.id, typeName: r.toEntity.name }));

    return {
      attributeId: a.id,
      relationValueTypeId: relationValueType?.id,
      relationValueTypeName: relationValueType?.name,
      relationValueTypes,
    };
  });

  const schema = schemaWithoutValueType.map((s): PropertySchema => {
    const relationValueType = relationValueTypes.find(t => t.attributeId === s.id) ?? null;

    return {
      ...s,
      dataType: 'TEXT', // @TODO(migration): use Types
      relationValueTypeId: relationValueType?.relationValueTypeId,
      relationValueTypeName: relationValueType?.relationValueTypeName,
      relationValueTypes: relationValueType?.relationValueTypes,
    };
  });

  // If the schema exists already in the list then we should dedupe it.
  // Some types might share some elements in their schemas, e.g., Person
  // and Pet both have Avatar as part of their schema.
  return dedupeWith([...DEFAULT_ENTITY_SCHEMA, ...schema], (a, b) => a.id === b.id);
}

/**
 * Types are defined either a relation with a Relation type of SystemIds.TYPES_ATTRIBUTE,
 * or a triple with an attribute id of SystemIds.TYPES_ATTRIBUTE. We expect that only
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
