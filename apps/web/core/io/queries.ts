import { SystemIds } from '@geoprotocol/geo-sdk';

import * as Effect from 'effect/Effect';

import { EntitiesOrderBy, type EntityFilter, SortOrder, type UuidFilter } from '~/core/gql/graphql';
import { Entity, SearchResult } from '~/core/types';

import { EntityDecoder, EntityTypeDecoder } from './decoders/entity';
import { PropertyDecoder } from './decoders/property';
import { RelationDecoder } from './decoders/relation';
import { ResultDecoder } from './decoders/result';
import { SpaceDecoder } from './decoders/space';
import { Space } from './dto/spaces';
import { getConfig } from '~/core/environment/environment';
import { graphql } from './graphql-client';
import { restFetch } from './rest';
import {
  entitiesBatchQuery,
  entitiesOrderedByPropertyQuery,
  entitiesQuery,
  entityBacklinksQuery,
  entityNamesQuery,
  entityPageQuery,
  entityQuery,
  entityTypesQuery,
  propertiesBatchQuery,
  propertyQuery,
  relationEntityQuery,
  relationEntityRelationsQuery,
  relationsByToEntityIdsQuery,
  importNameValuesQuery,
  resultQuery,
  spaceQuery,
  spacesQuery,
  spacesWhereMemberQuery,
} from './query-fragments';
import { extractSingleSpaceIdFromFilter, extractSpaceIdsFromFilter, removeSpaceIdsFromFilter } from './space-filter';
import { extractSingleTypeIdFromFilter, extractTypeIdsFromFilter, removeTypeIdsFromFilter } from './type-filter';

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

/** Lightweight batch fetch that returns only {id, name} for a set of entity IDs. */
export function getEntityNames(entityIds: string[], signal?: AbortController['signal']) {
  return graphql({
    query: entityNamesQuery,
    decoder: data =>
      (data.entities ?? [])
        .filter((e): e is { id: string; name: string | null } => e != null && typeof e.id === 'string')
        .map(e => ({ id: e.id as string, name: (e.name as string | null) ?? null })),
    variables: { filter: { id: { in: entityIds } } },
    signal,
  });
}

type GetAllEntitiesOptions = {
  limit?: number;
  offset?: number;
  spaceId?: string;
  spaceIds?: UuidFilter;
  typeId?: string;
  typeIds?: UuidFilter;
  filter?: EntityFilter;
  orderBy?: EntitiesOrderBy[];
};

export function getAllEntities(
  { limit, offset, spaceId, spaceIds, typeId, typeIds, filter, orderBy }: GetAllEntitiesOptions,
  signal?: AbortController['signal']
) {
  const extractedSpaceId = extractSingleSpaceIdFromFilter(filter);
  const extractedSpaceIds = extractSpaceIdsFromFilter(filter);
  const extractedTypeId = extractSingleTypeIdFromFilter(filter);
  const extractedTypeIds = extractTypeIdsFromFilter(filter);

  const topLevelSpaceId = spaceId ?? extractedSpaceId;
  const topLevelSpaceIds = topLevelSpaceId ? undefined : (spaceIds ?? extractedSpaceIds);

  const topLevelTypeId = typeId ?? extractedTypeId;
  const topLevelTypeIds = topLevelTypeId ? undefined : (typeIds ?? extractedTypeIds);

  let normalizedFilter = filter;
  if (topLevelSpaceId || topLevelSpaceIds) {
    normalizedFilter = removeSpaceIdsFromFilter(normalizedFilter);
  }
  if (topLevelTypeId || topLevelTypeIds) {
    normalizedFilter = removeTypeIdsFromFilter(normalizedFilter);
  }

  return graphql({
    query: entitiesQuery,
    decoder: data => data.entities?.map(EntityDecoder.decode).filter((e): e is Entity => e !== null) ?? [],
    variables: {
      limit,
      offset,
      spaceId: topLevelSpaceId,
      spaceIds: topLevelSpaceIds,
      typeId: topLevelTypeId,
      typeIds: topLevelTypeIds,
      filter: normalizedFilter,
      orderBy,
    },
    signal,
  });
}

type GetEntitiesOrderedByPropertyOptions = {
  propertyId: string;
  sortDirection: SortOrder;
  dataType?: string;
  spaceId?: string;
  limit?: number;
  offset?: number;
  filter?: EntityFilter;
};

export function getEntitiesOrderedByProperty(
  { propertyId, sortDirection, dataType, spaceId, limit, offset, filter }: GetEntitiesOrderedByPropertyOptions,
  signal?: AbortController['signal']
) {
  return graphql({
    query: entitiesOrderedByPropertyQuery,
    decoder: data =>
      data.entitiesOrderedByProperty?.map(EntityDecoder.decode).filter((e): e is Entity => e !== null) ?? [],
    variables: {
      propertyId,
      sortDirection,
      dataType,
      spaceId,
      limit,
      offset,
      filter,
    },
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

export function getRelationsByToEntityIds(
  toEntityIds: string[],
  typeId?: string,
  spaceId?: string,
  signal?: AbortController['signal']
) {
  return graphql({
    query: relationsByToEntityIdsQuery,
    decoder: data => data.relations ?? [],
    variables: { toEntityIds, typeId, spaceId },
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

export function getSpacesByAddresses(addresses: string[], signal?: AbortController['signal']) {
  return graphql({
    query: spacesQuery,
    decoder: data => data.spaces?.map(SpaceDecoder.decode).filter((e): e is Space => e !== null) ?? [],
    variables: {
      filter: { address: { in: addresses } },
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

/**
 * Raw search result from the REST /search endpoint.
 * Each result represents one entity in one space, with nested space/type data.
 */
interface RestSearchResult {
  entityId: string;
  space: {
    id: string;
    name?: string;
    avatar?: string;
  };
  name?: string;
  description?: string;
  avatar?: string;
  cover?: string;
  types?: Array<{
    id: string;
    name?: string;
  }>;
  entityGlobalScore?: number;
  relevanceScore?: number;
  textMatchScore?: number;
  inCanonicalGraph?: boolean;
}

interface RestSearchResponse {
  results: RestSearchResult[];
  total: number;
  tookMs: number;
}

function stripHyphens(uuid: string): string {
  return uuid.replace(/-/g, '');
}

/**
 * Converts a 32-char hex ID to UUID format (8-4-4-4-12).
 * If the string already contains hyphens it is returned as-is.
 */
function toUuid(hex: string): string {
  if (hex.includes('-')) return hex;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Groups flat per-space REST results into the SearchResult shape the app expects.
 *
 * The REST endpoint returns one result per (entity, space) pair. We group
 * by entityId and collect all spaceIds into a single SearchResult per entity.
 */
export function groupRestResults(results: RestSearchResult[]): SearchResult[] {
  const byEntity = new Map<string, SearchResult>();

  for (const r of results) {
    const entityId = stripHyphens(r.entityId);
    const spaceId = stripHyphens(r.space.id);

    const existing = byEntity.get(entityId);

    if (existing) {
      // Add this space to the existing result's spaces list (if not already there)
      if (!existing.spaces.some(s => s.spaceId === spaceId)) {
        existing.spaces.push({
          id: spaceId,
          name: r.space.name ?? null,
          description: null,
          image: r.space.avatar ?? '',
          relations: [],
          spaceId,
          spaces: [spaceId],
          values: [],
          types: [],
        });
      }

      for (const type of r.types ?? []) {
        const typeId = stripHyphens(type.id);
        const existingType = existing.types.find(t => t.id === typeId);

        if (existingType) {
          existingType.name = existingType.name ?? type.name ?? null;
          continue;
        }

        existing.types.push({ id: typeId, name: type.name ?? null });
      }
    } else {
      byEntity.set(entityId, {
        id: entityId,
        name: r.name ?? null,
        description: r.description ?? null,
        types: (r.types ?? []).map(type => ({ id: stripHyphens(type.id), name: type.name ?? null })),
        spaces: [
          {
            id: spaceId,
            name: r.space.name ?? null,
            description: null,
            image: r.space.avatar ?? '',
            relations: [],
            spaceId,
            spaces: [spaceId],
            values: [],
            types: [],
          },
        ],
      });
    }
  }

  return [...byEntity.values()];
}

/**
 * Search for entities using the REST /search endpoint.
 *
 * This replaces the previous GraphQL-based search with the OpenSearch-backed
 * REST endpoint which provides better relevance scoring and performance.
 */
export function getResults(args: ResultsArgs, signal?: AbortController['signal']) {
  const params = new URLSearchParams();
  params.set('query', args.query);
  params.set('limit', String(args.limit ?? 10));
  params.set('offset', String(args.offset ?? 0));

  if (args.spaceId) {
    params.set('scope', 'SPACE_SINGLE');
    // REST endpoint expects UUIDs with hyphens
    params.set('space_id', toUuid(args.spaceId));
  }

  if (args.typeIds?.length) {
    // REST endpoint expects UUIDs with hyphens
    params.set('type_ids', args.typeIds.map(toUuid).join(','));
  }

  return Effect.map(
    restFetch<RestSearchResponse>({
      endpoint: getConfig().api,
      path: `/search?${params.toString()}`,
      signal,
    }),
    response => groupRestResults(response.results.filter(shouldIncludeRestSearchResult))
  );
}

export type NameValueMatch = {
  text: string | null;
  spaceId: string;
  entity: {
    id: string;
    name: string | null;
    typeIds: Array<string | null> | null;
    backlinks: { totalCount: number };
    relations: { totalCount: number };
  };
};

/**
 * Batch name resolution via the `values` endpoint.
 * Matches multiple names in one request using `text: { inInsensitive }`.
 * Returns value rows with entity metadata for client-side ranking.
 */
export function getNameValuesBatch(
  args: { names: string[]; typeIds?: string[] },
  signal?: AbortController['signal']
) {
  const entityFilter: EntityFilter | undefined = args.typeIds?.length
    ? { typeIds: { in: args.typeIds } }
    : BLOCK_TYPE_EXCLUSION_FILTER;

  return graphql({
    query: importNameValuesQuery,
    decoder: data => {
      const rows = data.values ?? [];
      return rows.filter(v => v.entity != null) as NameValueMatch[];
    },
    variables: {
      propertyId: SystemIds.NAME_PROPERTY,
      texts: args.names,
      first: args.names.length * 5,
      entityFilter,
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

const EXCLUDED_BLOCK_TYPE_IDS = new Set(EXCLUDED_BLOCK_TYPES.map(typeId => typeId.replace(/-/g, '')));

function shouldIncludeRestSearchResult(result: RestSearchResult): boolean {
  return !(result.types ?? []).some(type => EXCLUDED_BLOCK_TYPE_IDS.has(stripHyphens(type.id)));
}
