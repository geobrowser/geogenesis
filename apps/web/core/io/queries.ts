import { SystemIds } from '@geoprotocol/geo-sdk';

import { EntitiesOrderBy, type EntityFilter, type UuidFilter } from '~/core/gql/graphql';
import { Entity, SearchResult } from '~/core/types';

import { EntityDecoder, EntityTypeDecoder } from './decoders/entity';
import { PropertyDecoder } from './decoders/property';
import { RelationDecoder } from './decoders/relation';
import { ResultDecoder } from './decoders/result';
import { SpaceDecoder } from './decoders/space';
import { Space } from './dto/spaces';
import { graphql } from './graphql-client';
import {
  entitiesBatchQuery,
  entitiesQuery,
  entityBacklinksQuery,
  entityPageQuery,
  entityQuery,
  entityTypesQuery,
  propertiesBatchQuery,
  propertyQuery,
  relationEntityQuery,
  relationEntityRelationsQuery,
  resultQuery,
  resultsQuery,
  spaceQuery,
  spacesQuery,
  spacesWhereMemberQuery,
} from './query-fragments';

// @TODO(migration): Can we somehow bind the querying patterns to the sync store?
// When we querying for things on the client we want them to populate the sync store
// automatically...
//
// We also want to merge local data as much as possible

export function getBatchEntities(entityIds: string[], spaceId?: string, signal?: AbortController['signal']) {
  return graphql({
    query: entitiesBatchQuery,
    decoder: data => data.entities?.map(EntityDecoder.decode).filter((e): e is Entity => e !== null) ?? [],
    variables: { filter: { id: { in: entityIds } }, spaceId },
    signal,
  });
}

type GetAllEntitiesOptions = {
  limit?: number;
  offset?: number;
  spaceId?: string;
  typeIds?: UuidFilter;
  filter?: EntityFilter;
  orderBy?: EntitiesOrderBy[];
};

export function getAllEntities(
  { limit, offset, spaceId, typeIds, filter, orderBy }: GetAllEntitiesOptions,
  signal?: AbortController['signal']
) {
  return graphql({
    query: entitiesQuery,
    decoder: data => data.entities?.map(EntityDecoder.decode).filter((e): e is Entity => e !== null) ?? [],
    variables: { limit, offset, spaceId, typeIds, filter, orderBy },
    signal,
  });
}

export function getEntity(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return graphql({
    query: entityQuery,
    decoder: data => (data.entity ? EntityDecoder.decode(data.entity) : null),
    variables: { id: entityId, spaceId },
    signal,
  });
}

export function getRelation(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return graphql({
    query: relationEntityQuery,
    decoder: data => {
      return data.relation?.entity ? EntityDecoder.decode(data.relation.entity) : null;
    },
    variables: { id: entityId, spaceId },
    signal,
  });
}

export function getRelationEntityRelations(entityId: string, spaceId: string, signal?: AbortController['signal']) {
  return graphql({
    query: relationEntityRelationsQuery,
    decoder: data => (data.relations ? data.relations.map(r => RelationDecoder.decode(r)).filter(r => r !== null) : []),
    variables: { id: entityId, spaceId },
    signal,
  });
}

export function getEntityPage(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return graphql({
    query: entityPageQuery,
    decoder: data =>
      data.entity
        ? {
            entity: EntityDecoder.decode(data.entity),
            relations: data.relations?.map(r => RelationDecoder.decode(r)).filter(r => r !== null) ?? [],
          }
        : null,
    variables: { id: entityId, spaceId },
    signal,
  });
}

export function getEntityTypes(entityId: string, signal?: AbortController['signal']) {
  return graphql({
    query: entityTypesQuery,
    decoder: data =>
      data.entity?.types
        ?.map(EntityTypeDecoder.decode)
        .filter((e): e is { id: string; name: string | null } => e !== null) ?? [],
    variables: { id: entityId },
    signal,
  });
}

export function getEntityBacklinks(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return graphql({
    query: entityBacklinksQuery,
    // prettier-ignore
    decoder: data =>
      data.entity?.backlinksList
        ? (data.entity.backlinksList
            .map((e: any) => e?.fromEntity ? { ...e.fromEntity, backlinkSpaceId: e.spaceId } : null)
            .filter((e): e is { id: string; name?: string | null; spaceIds: string[]; types: Array<{ id: string; name: string; spaceIds?: string[] }>; backlinkSpaceId: string } => e !== null) ?? [])
        : [],
    variables: { id: entityId, spaceId },
    signal,
  });
}

export function getSpace(spaceId: string, signal?: AbortController['signal']) {
  return graphql({
    query: spaceQuery,
    decoder: data => (data.space ? SpaceDecoder.decode(data.space) : null),
    variables: { id: spaceId },
    signal,
  });
}

export function getSpaces(
  { limit, offset, spaceIds }: { limit?: number; offset?: number; spaceIds?: string[] } = {},
  signal?: AbortController['signal']
) {
  return graphql({
    query: spacesQuery,
    decoder: data => data.spaces?.map(SpaceDecoder.decode).filter((e): e is Space => e !== null) ?? [],
    variables: {
      limit,
      offset,
      filter: spaceIds ? { id: { in: spaceIds } } : undefined,
    },
    signal,
  });
}

export function getSpacesWhereMember(memberSpaceId: string, signal?: AbortController['signal']) {
  return graphql({
    query: spacesWhereMemberQuery,
    decoder: data => data.spaces?.map(SpaceDecoder.decode).filter((s): s is Space => s !== null) ?? [],
    variables: { memberSpaceId },
    signal,
  });
}

/** Get a personal space by wallet address. Returns the space owned by this address, or null if none exists. */
export function getSpaceByAddress(address: string, signal?: AbortController['signal']) {
  return graphql({
    query: spacesQuery,
    decoder: data => {
      const firstSpace = data.spaces?.[0];
      if (!firstSpace) return null;
      return SpaceDecoder.decode(firstSpace);
    },
    // Use case-insensitive matching since Ethereum addresses can be checksummed or lowercase
    variables: { filter: { address: { isInsensitive: address } }, limit: 1 },
    signal,
  });
}

export function getResult(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return graphql({
    query: resultQuery,
    decoder: data => {
      return data.entity ? ResultDecoder.decode(data.entity) : null;
    },
    variables: { id: entityId },
    signal,
  });
}

interface ResultsArgs {
  query: string;
  spaceId?: string;
  typeIds?: string[];
  limit?: number;
  offset?: number;
}

export function getResults(args: ResultsArgs, signal?: AbortController['signal']) {
  const filter: EntityFilter | undefined = args.typeIds?.length
    ? { typeIds: { in: args.typeIds } }
    : { and: BLOCK_TYPE_EXCLUSION_FILTERS };

  return graphql({
    query: resultsQuery,
    decoder: data => {
      return data.search?.map(ResultDecoder.decode).filter((r): r is SearchResult => r !== null) ?? [];
    },
    variables: {
      query: args.query,
      spaceId: args.spaceId,
      limit: args.limit,
      offset: args.offset,
      filter,
    },
    signal,
  });
}

export function getProperty(id: string, signal?: AbortController['signal']) {
  return graphql({
    query: propertyQuery,
    decoder: data => {
      return data.property ? PropertyDecoder.decode(data.property) : null;
    },
    variables: {
      id,
    },
    signal,
  });
}

export function getProperties(ids: string[], signal?: AbortController['signal']) {
  return graphql({
    query: propertiesBatchQuery,
    decoder: data => {
      return data.properties?.map(PropertyDecoder.decode).filter(e => e !== null) ?? [];
    },
    variables: {
      ids,
    },
    signal,
  });
}

const EXCLUDED_BLOCK_TYPES = [
  SystemIds.TEXT_BLOCK,
  SystemIds.IMAGE_BLOCK,
  SystemIds.DATA_BLOCK,
  SystemIds.IMAGE_TYPE,
  SystemIds.VIDEO_TYPE,
  SystemIds.VIDEO_BLOCK,
];

const BLOCK_TYPE_EXCLUSION_FILTERS = EXCLUDED_BLOCK_TYPES.map(typeId => ({
  typeIds: { anyNotEqualTo: typeId },
}));
