'use client';

import { SystemIds } from '@graphprotocol/grc-20';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { dedupeWith } from 'effect/Array';

import { Entity } from '../io/dto/entities';
import { EntityId } from '../io/schema';
import { fetchEntity } from '../io/subgraph';
import { queryClient } from '../query-client';
import { E } from '../sync/orm';
import { store as geoStore } from '../sync/use-sync-engine';
import { PropertySchema, Relation, SpaceId, Triple, ValueTypeId } from '../types';
import { Entities } from '../utils/entity';
import { useRelations } from './relations';
import { useTriples } from './triples';

export type EntityWithSchema = Entity & { schema: PropertySchema[] };

type UseEntityOptions = {
  spaceId?: SpaceId;
  id: EntityId;
  initialData?: { spaces: SpaceId[]; triples: Triple[]; relations: Relation[] };
};

export function useEntity(options: UseEntityOptions): EntityWithSchema {
  const { spaceId, id, initialData } = options;

  const { data: remoteData } = useQuery({
    enabled: !initialData && id !== '',
    placeholderData: keepPreviousData,
    queryKey: ['useEntity', spaceId, id, initialData],
    initialData,
    queryFn: async ({ signal }) => {
      const entity = await fetchEntity({ spaceId, id, signal });

      return {
        spaces: entity?.spaces ?? [],
        triples: entity?.triples ?? [],
        relations: entity?.relationsOut ?? [],
      };
    },
  });

  // If the caller passes in a set of data we use that for merging. If not,
  // we fetch the entity from the server and merge it with the local state.
  const data = initialData ?? remoteData;

  const triples = useTriples({
    mergeWith: data?.triples,
    selector: spaceId ? t => t.entityId === id && t.space === spaceId : t => t.entityId === id,
  });

  const relations = useRelations({
    mergeWith: data?.relations,
    selector: spaceId ? r => r.fromEntity.id === id && r.space === spaceId : r => r.fromEntity.id === id,
  });

  const name = Entities.name(triples);
  const nameTripleSpaces = triples.filter(t => t.attributeId === SystemIds.NAME_ATTRIBUTE).map(t => t.space);
  const spaces = data?.spaces ?? [];
  const description = Entities.description(triples);
  const types = readTypes(relations);

  const { data: schema } = useQuery({
    enabled: types.length > 0,
    queryKey: ['entity-schema-for-merging', id, types],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const typesIds = [...new Set(types.map(t => t.id))];
      return await getSchemaFromTypeIds(typesIds);
    },
  });

  return {
    id,
    name,
    nameTripleSpaces,
    spaces,
    description,
    schema: schema ?? DEFAULT_ENTITY_SCHEMA,
    triples,
    relationsOut: relations,
    types,
  };
}

// Name, description, and types are always required for every entity even
// if they aren't defined in the schema.
export const DEFAULT_ENTITY_SCHEMA: PropertySchema[] = [
  {
    id: EntityId(SystemIds.NAME_ATTRIBUTE),
    name: 'Name',
    valueType: SystemIds.TEXT,
  },
  {
    id: EntityId(SystemIds.DESCRIPTION_ATTRIBUTE),
    name: 'Description',
    valueType: SystemIds.TEXT,
  },
  {
    id: EntityId(SystemIds.TYPES_ATTRIBUTE),
    name: 'Types',
    valueType: SystemIds.RELATION,
  },
  {
    id: EntityId(SystemIds.COVER_ATTRIBUTE),
    name: 'Cover',
    valueType: SystemIds.IMAGE,
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
  const schemaEntities = await E.findMany(
    geoStore,
    queryClient,
    {
      id: {
        in: typesIds,
      },
    },
    100,
    0
  );

  const schemaWithoutValueType = schemaEntities.flatMap((e): PropertySchema[] => {
    const attributeRelations = e.relationsOut.filter(t => t.typeOf.id === EntityId(SystemIds.PROPERTIES));

    if (attributeRelations.length === 0) {
      return [];
    }

    return attributeRelations.map(a => ({
      id: a.toEntity.id,
      name: a.toEntity.name,
      // We add the correct value type below.
      valueType: SystemIds.TEXT,
    }));
  });

  const attributes = await E.findMany(
    geoStore,
    queryClient,
    {
      id: {
        in: schemaWithoutValueType.map(a => a.id),
      },
    },
    100,
    0
  );

  const valueTypes = attributes.map(a => {
    const valueTypeId = a.relationsOut.find(r => r.typeOf.id === EntityId(SystemIds.VALUE_TYPE_ATTRIBUTE))?.toEntity.id;
    return {
      attributeId: a.id,
      valueTypeId,
    };
  });

  const relationValueTypes = attributes.map(a => {
    const relationValueType = a.relationsOut.find(
      r => r.typeOf.id === EntityId(SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE)
    )?.toEntity;

    const relationValueTypes = a.relationsOut
      .filter(r => r.typeOf.id === EntityId(SystemIds.RELATION_VALUE_RELATIONSHIP_TYPE))
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
      valueType: (valueTypes.find(v => v.attributeId === s.id)?.valueTypeId ?? SystemIds.TEXT) as ValueTypeId,
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
export function readTypes(relations: Relation[]): { id: EntityId; name: string | null }[] {
  const typeIdsViaRelations = relations
    .filter(r => r.typeOf.id === EntityId(SystemIds.TYPES_ATTRIBUTE))
    .map(r => ({
      id: EntityId(r.toEntity.id),
      name: r.toEntity.name,
    }));

  return dedupeWith(typeIdsViaRelations, (a, b) => a.id === b.id);
}
