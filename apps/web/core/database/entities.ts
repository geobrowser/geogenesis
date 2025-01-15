'use client';

import { SYSTEM_IDS } from '@geogenesis/sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Duration } from 'effect';
import { dedupeWith } from 'effect/Array';
import { atom, useAtomValue } from 'jotai';
import { unwrap } from 'jotai/utils';

import * as React from 'react';

import { Entity } from '../io/dto/entities';
import { EntityId } from '../io/schema';
import { fetchEntity } from '../io/subgraph';
import { fetchEntitiesBatch } from '../io/subgraph/fetch-entities-batch';
import { queryClient } from '../query-client';
import { store } from '../state/jotai-store';
import { PropertySchema, Relation, SpaceId, Triple, ValueTypeId } from '../types';
import { Entities } from '../utils/entity';
import { getRelations, useRelations } from './relations';
import { getTriples, useTriples } from './triples';
import { localOpsAtom, localRelationsAtom } from './write';

export type EntityWithSchema = Entity & { schema: PropertySchema[] };

type UseEntityOptions = {
  spaceId?: SpaceId;
  id: EntityId;
  initialData?: { spaces: SpaceId[]; triples: Triple[]; relations: Relation[] };
};

export function useEntity(options: UseEntityOptions): EntityWithSchema {
  const { spaceId, id, initialData } = options;

  // If the caller passes in a set of data we use that for merging. If not,
  // we fetch the entity from the server and merge it with the local state.
  let data = initialData;

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

  if (!initialData) {
    data = remoteData;
  }

  const triples = useTriples(
    React.useMemo(
      () => ({
        mergeWith: data?.triples,
        selector: spaceId ? t => t.entityId === id && t.space === spaceId : t => t.entityId === id,
      }),
      [data?.triples, id, spaceId]
    )
  );

  const relations = useRelations(
    React.useMemo(
      () => ({
        mergeWith: data?.relations,
        selector: spaceId ? r => r.fromEntity.id === id && r.space === spaceId : r => r.fromEntity.id === id,
      }),
      [data?.relations, id, spaceId]
    )
  );

  const name = React.useMemo(() => {
    return Entities.name(triples);
  }, [triples]);

  const nameTripleSpaces = React.useMemo(() => {
    return triples.filter(t => t.attributeId === SYSTEM_IDS.NAME_ATTRIBUTE).map(t => t.space);
  }, [triples]);

  const spaces = React.useMemo(() => {
    return data?.spaces ?? [];
  }, [data?.spaces]);

  const description = React.useMemo(() => {
    return Entities.description(triples);
  }, [triples]);

  const types = React.useMemo(() => {
    return readTypes(relations);
  }, [relations]);

  const { data: schema } = useQuery({
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
    // @TODO: Spaces with metadata
    schema: schema ?? [],
    triples,
    relationsOut: relations,
    types,
  };
}

interface MergeEntityArgs {
  id: string;
  mergeWith: Entity | null;
}

/**
 * Merge an entity from the server with the local state. There might be
 * a situation where we already have the entity data and need to merge it
 * with the local state. e.g., rendering a list of entities in a data list.
 *
 * This is different from the mergeEntityAsync which expects that it will
 * handle fetching the remote entity itself.
 */
export function mergeEntity({ id, mergeWith }: MergeEntityArgs): EntityWithSchema {
  const mergedTriples = getTriples({
    mergeWith: mergeWith?.triples,
    selector: t => t.entityId === id,
  });

  const mergedRelations = getRelations({
    mergeWith: mergeWith?.relationsOut,
    selector: r => r.fromEntity.id === id,
  });

  // Use the merged triples to derive the name instead of the remote entity
  // `name` property in case the name was deleted/changed locally.
  const name = Entities.name(mergedTriples);
  const description = Entities.description(mergedTriples);
  const types = readTypes(mergedRelations);

  return {
    id: EntityId(id),
    name,
    nameTripleSpaces: mergedTriples.filter(t => t.attributeId === SYSTEM_IDS.NAME_ATTRIBUTE).map(t => t.space),
    // @TODO add real merging logic
    spaces: mergeWith?.spaces ?? [],
    description,
    types,
    triples: mergedTriples,
    relationsOut: mergedRelations,
    // @TODO: Spaces with metadata
    // @TODO: Schema? Adding schema here might result in infinite queries since we
    // if we called getEntity from within getEntity it would query infinitlely deep
    // until we hit some defined base-case. We could specify a max depth for the
    // recursion so we only return the closest schema and not the whole chain.
    schema: [],
  };
}

/**
 * Fetch an entity from the server and merge it with local triples and relations.
 *
 * There's lots of cases where we want to fetch an entity async for other work that
 * we're doing in the app. e.g., maybe we want to get all the schema for an entity,
 * or the rows in a table.
 *
 * In many of these cases we only need a subset of the entity, but it's the simplest
 * to just fetch the whole thing and put it in cache. The data we fetch for entities
 * is generally small enough where this isn't a big deal.
 *
 * @TODO:
 * Fetch by space id so we can scope the triples and relations to a specific space.
 */
export async function mergeEntityAsync(id: EntityId): Promise<EntityWithSchema> {
  const cachedEntity = await queryClient.fetchQuery({
    queryKey: ['entity-for-merging', id],
    queryFn: ({ signal }) => fetchEntity({ id, signal }),
    staleTime: Infinity,
  });

  return mergeEntity({ id, mergeWith: cachedEntity });
}

/**
 * Fetch the entities for each type and parse their attributes into a schema.
 *
 * A entity with Types -> Type can specify a schema that all entities of that
 * type should adhere to. Currently schemas are optional.
 *
 * We expect that attributes are only defined via relations, not triples.
 */
export async function getSchemaFromTypeIds(typesIds: string[]): Promise<PropertySchema[]> {
  const schemaEntities = await Promise.all(
    typesIds.map(typeId => {
      // These are all cached in a network cache if they've been fetched before.
      return mergeEntityAsync(EntityId(typeId));
    })
  );

  const schemaWithoutValueType = schemaEntities.flatMap((e): PropertySchema[] => {
    const attributeRelations = e.relationsOut.filter(t => t.typeOf.id === SYSTEM_IDS.PROPERTIES);

    if (attributeRelations.length === 0) {
      return [];
    }

    return attributeRelations.map(a => ({
      id: a.toEntity.id,
      name: a.toEntity.name,
      // We add the correct value type below.
      valueType: SYSTEM_IDS.TEXT,
    }));
  });

  const attributes = await Promise.all(schemaWithoutValueType.map(a => mergeEntityAsync(EntityId(a.id))));
  const valueTypes = attributes.map(a => {
    const valueTypeId = a.relationsOut.find(r => r.typeOf.id === SYSTEM_IDS.VALUE_TYPE_ATTRIBUTE)?.toEntity.id;
    return {
      attributeId: a.id,
      valueTypeId,
    };
  });

  const relationValueTypes = attributes.map(a => {
    const relationValueType = a.relationsOut.find(r => r.typeOf.id === SYSTEM_IDS.RELATION_VALUE_RELATIONSHIP_TYPE)
      ?.toEntity;

    return {
      attributeId: a.id,
      relationValueTypeId: relationValueType?.id,
      relationValueTypeName: relationValueType?.name,
    };
  });

  const schema = schemaWithoutValueType.map((s): PropertySchema => {
    const relationValueType = relationValueTypes.find(t => t.attributeId === s.id) ?? null;
    return {
      ...s,
      valueType: (valueTypes.find(v => v.attributeId === s.id)?.valueTypeId ?? SYSTEM_IDS.TEXT) as ValueTypeId,
      relationValueTypeId: relationValueType?.relationValueTypeId,
      relationValueTypeName: relationValueType?.relationValueTypeName,
    };
  });

  // If the schema exists already in the list then we should dedupe it.
  // Some types might share some elements in their schemas, e.g., Person
  // and Pet both have Avatar as part of their schema.
  return dedupeWith(
    [
      // Name, description, and types are always required for every entity even
      // if they aren't defined in the schema.
      {
        id: EntityId(SYSTEM_IDS.NAME_ATTRIBUTE),
        name: 'Name',
        valueType: SYSTEM_IDS.TEXT,
      },
      {
        id: EntityId(SYSTEM_IDS.DESCRIPTION_ATTRIBUTE),
        name: 'Description',
        valueType: SYSTEM_IDS.TEXT,
      },
      {
        id: EntityId(SYSTEM_IDS.TYPES_ATTRIBUTE),
        name: 'Types',
        valueType: SYSTEM_IDS.RELATION,
      },
      {
        id: EntityId(SYSTEM_IDS.COVER_ATTRIBUTE),
        name: 'Cover',
        valueType: SYSTEM_IDS.IMAGE,
      },
      ...schema,
    ],
    (a, b) => a.id === b.id
  );
}

/**
 * Types are defined either a relation with a Relation type of SYSTEM_IDS.TYPES_ATTRIBUTE,
 * or a triple with an attribute id of SYSTEM_IDS.TYPES_ATTRIBUTE. We expect that only
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
    .filter(r => r.typeOf.id === SYSTEM_IDS.TYPES_ATTRIBUTE)
    .map(r => ({
      id: EntityId(r.toEntity.id),
      name: r.toEntity.name,
    }));

  return dedupeWith(typeIdsViaRelations, (a, b) => a.id === b.id);
}

const localEntitiesAtom = atom(async get => {
  const tripleEntityIds = get(localOpsAtom).map(o => o.entityId);
  const relationEntityIds = get(localRelationsAtom).map(r => r.fromEntity.id);

  const changedEntities = [...new Set([...tripleEntityIds, ...relationEntityIds])];

  const remoteVersionsOfEntities = await queryClient.fetchQuery({
    queryKey: ['local-entities-merge-fetch', changedEntities],
    queryFn: () => fetchEntitiesBatch(changedEntities),
    staleTime: Duration.toMillis(Duration.seconds(30)),
  });

  const merged = remoteVersionsOfEntities.map(e => mergeEntity({ id: e.id, mergeWith: e }));

  const localVersionsOfEntitiesNotAlreadyMerged = changedEntities
    .filter(entityId => !merged.some(m => m.id === entityId))
    .map(entityId => mergeEntity({ id: entityId, mergeWith: null }));

  return groupEntitiesByEntityId([...localVersionsOfEntitiesNotAlreadyMerged, ...merged]);
});

function groupEntitiesByEntityId(entities: Entity[]) {
  return entities.reduce<Record<EntityId, Entity>>((acc, entity) => {
    const entityId = EntityId(entity.id);

    if (!acc[entityId]) {
      acc[entityId] = entity;
    }

    return acc;
  }, {});
}

// @TODO Should useEntity just read from useEntities with an id? Do we need an optional
// getter or something?
export function useEntities_experimental() {
  const memoizedAtom = React.useMemo(() => unwrap(localEntitiesAtom, prev => prev ?? {}), []);
  return useAtomValue(memoizedAtom);
}

export async function getEntities_experimental() {
  // @TODO For some reason using unwrap was returning {} for consumers of getEntities.
  // Might have something to do with the first time being called so we are given the
  // fallback?
  // const atom = unwrap(localEntitiesAtom, prev => prev ?? {});
  return store.get(localEntitiesAtom);
}
