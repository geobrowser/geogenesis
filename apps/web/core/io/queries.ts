import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';

import { COMMENT_REPLY_TO_ID, COMMENT_TYPE_ID } from '~/core/comment-ids';
import { VOTE_DEBATES_PROPERTY_ID, VOTE_TYPE_ID } from '~/core/debates/ontology';
import { getConfig } from '~/core/environment/environment';
import {
  EntitiesBatchForCommentsDocument,
  type EntitiesBatchForCommentsQuery,
  EntitiesOrderBy,
  EntityCommentReplyBacklinksPageDocument,
  type EntityCommentReplyBacklinksPageQuery,
  EntityExistsDocument,
  type EntityExistsQuery,
  type EntityFilter,
  type EntitySpacesBatchQuery,
  UserHasEntityVoteDocument,
  type UserVoteFilter,
  type UuidFilter,
} from '~/core/gql/graphql';
import { uuidToHex } from '~/core/id/normalize';
import { RANKING_BLOCK_TYPE_ID } from '~/core/ranking-block-ids';
import {
  type ActiveResponseDirection,
  type ResponseKind,
  type ResponseObjectType,
  decodeActiveResponseDirection,
  entityResponseQueryVariables,
} from '~/core/responses/entity-response';
import { Entity, SearchResult } from '~/core/types';
import { spacesFromRoutingProjections } from '~/core/utils/entity/entities';
import { sortSpaceIdsByRank } from '~/core/utils/space/space-ranking';

import { allEntitiesConnectionDocument } from './all-entities-connection-document';
import { type DebateVoteBacklinksPageQuery, debateVoteBacklinksPageDocument } from './debate-vote-backlinks-document';
import { EntityDecoder, EntityTypeDecoder } from './decoders/entity';
import { PropertyDecoder } from './decoders/property';
import { RelationDecoder } from './decoders/relation';
import { ResultDecoder } from './decoders/result';
import { SpaceDecoder } from './decoders/space';
import { Space } from './dto/spaces';
import { entitiesOrderedByPropertyConnectionDocument } from './entities-ordered-by-property-connection-document';
import { graphql } from './graphql-client';
import {
  claimResponseSummariesQuery,
  entitiesBatchQuery,
  entitiesPageQuery,
  entityBacklinksQuery,
  entityNamesQuery,
  entityPageQuery,
  entityQuery,
  entityRelationsPageQuery,
  entityRespondersQuery,
  entityResponseCountsQuery,
  entitySpacesBatchQuery,
  entityTiebreakerBatchQuery,
  entityTypesQuery,
  importNameValuesQuery,
  isEditorOfSpaceQuery,
  isMemberOfSpaceQuery,
  propertiesBatchQuery,
  propertyQuery,
  relationEntityQuery,
  relationEntityRelationsQuery,
  relationsByFromEntityIdQuery,
  relationsByToEntityIdsQuery,
  resultQuery,
  spaceEditorsPageQuery,
  spaceMembersPageQuery,
  spaceQuery,
  spacesQuery,
  spacesWhereMemberQuery,
  userEntityResponseQuery,
} from './query-fragments';
import { restFetch } from './rest';
import { type SortOrder } from './sort-order';
import { extractSingleSpaceIdFromFilter, extractSpaceIdsFromFilter, removeSpaceIdsFromFilter } from './space-filter';
import { extractSingleTypeIdFromFilter, extractTypeIdsFromFilter, removeTypeIdsFromFilter } from './type-filter';
import { UserEntityVotesByTypeDocument } from './user-entity-votes-by-type-document';

// `EntitiesBatch` has no `first` argument, so keep id.in calls under the API's default page size.
export const ENTITY_ID_BATCH_SIZE = 50;

// @TODO(migration): Can we somehow bind the querying patterns to the sync store?
// When we querying for things on the client we want them to populate the sync store
// automatically...
//
// We also want to merge local data as much as possible

function getBatchEntitiesPage(entityIds: string[], spaceId?: string, signal?: AbortController['signal']) {
  return graphql({
    query: entitiesBatchQuery,
    decoder: data => data.entities?.map(EntityDecoder.decode).filter((e): e is Entity => e !== null) ?? [],
    variables: { filter: { id: { in: entityIds } }, spaceId },
    signal,
  });
}

export function getBatchEntities(entityIds: string[], spaceId?: string, signal?: AbortController['signal']) {
  if (entityIds.length === 0) return Effect.succeed([]);
  if (entityIds.length <= ENTITY_ID_BATCH_SIZE) return getBatchEntitiesPage(entityIds, spaceId, signal);

  return Effect.gen(function* () {
    const entities: Entity[] = [];

    for (let start = 0; start < entityIds.length; start += ENTITY_ID_BATCH_SIZE) {
      const batch = yield* getBatchEntitiesPage(entityIds.slice(start, start + ENTITY_ID_BATCH_SIZE), spaceId, signal);
      entities.push(...batch);
    }

    return entities;
  });
}

export function getBatchEntitySpaces(entityIds: string[], signal?: AbortController['signal']) {
  return graphql({
    query: entitySpacesBatchQuery,
    decoder: data =>
      (data.entities ?? [])
        .filter((entity): entity is NonNullable<NonNullable<EntitySpacesBatchQuery['entities']>[number]> =>
          Boolean(entity?.id)
        )
        .map(entity => ({
          id: entity.id as string,
          spaces: spacesFromRoutingProjections({
            spaceIds: (entity.spaceIds ?? []).filter((id): id is string => typeof id === 'string'),
            values: entity.allValuesList,
            relations: entity.allRelationsList,
          }),
        })),
    variables: { filter: { id: { in: entityIds } } },
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
  after?: string;
  /**
   * Bounded offset relative to `after`. Used by the hybrid jump-to-page
   * pager to skip forward from a known anchor cursor without walking each
   * intermediate page. Callers (the pagination hook) are expected to cap
   * this value; this layer just forwards it to the API.
   */
  offset?: number;
  spaceId?: string;
  spaceIds?: UuidFilter;
  typeId?: string;
  typeIds?: UuidFilter;
  filter?: EntityFilter;
  orderBy?: EntitiesOrderBy[];
};

/** API rejects `first` (mapped from `limit`) above this on `entitiesConnection`. */
const ENTITIES_CONNECTION_MAX_FIRST = 1000;

export type EntitiesPage = {
  entities: Entity[];
  endCursor: string | null;
  hasNextPage: boolean;
};

type EntitiesConnectionShape = {
  nodes?: unknown[] | null;
  pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
} | null;

function decodeEntitiesConnectionPage(connection: EntitiesConnectionShape): EntitiesPage {
  const entities =
    connection?.nodes
      ?.map((n: unknown) => EntityDecoder.decode(n))
      .filter((e: Entity | null): e is Entity => e !== null) ?? [];
  return {
    entities,
    endCursor: connection?.pageInfo?.endCursor ?? null,
    hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
  };
}

export function getAllEntities(
  { limit, after, offset, spaceId, spaceIds, typeId, typeIds, filter, orderBy }: GetAllEntitiesOptions,
  signal?: AbortController['signal']
) {
  return Effect.gen(function* () {
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

    const variablesBase = {
      spaceId: topLevelSpaceId,
      spaceIds: topLevelSpaceIds,
      typeId: topLevelTypeId,
      typeIds: topLevelTypeIds,
      filter: normalizedFilter,
      orderBy,
    };

    const fetchPage = (pageLimit: number, pageAfter: string | undefined, pageOffset: number | undefined) =>
      graphql({
        query: allEntitiesConnectionDocument,
        decoder: (data: { entitiesConnection?: EntitiesConnectionShape }) =>
          decodeEntitiesConnectionPage(data.entitiesConnection ?? null),
        variables: { ...variablesBase, limit: pageLimit, after: pageAfter, offset: pageOffset },
        signal,
      });

    if (limit === 0) {
      return { entities: [], endCursor: after ?? null, hasNextPage: false } satisfies EntitiesPage;
    }

    // When the caller requests a window <= the API cap, do a single round-trip
    // and surface the connection cursor straight through.
    if (limit !== undefined && limit <= ENTITIES_CONNECTION_MAX_FIRST) {
      return yield* fetchPage(limit, after, offset);
    }

    // Either an unbounded fetch-all (limit undefined) or a window larger than
    // the API's per-request cap. Loop until satisfied, threading endCursor.
    // Offset only applies to the first request — subsequent loops walk the
    // connection forward via endCursor with no additional skip.
    const collected: Entity[] = [];
    let nextAfter = after;
    let nextOffset: number | undefined = offset;
    let remaining = limit;
    let lastEndCursor: string | null = after ?? null;
    let lastHasNextPage = false;

    while (remaining === undefined || remaining > 0) {
      const chunk = Math.min(ENTITIES_CONNECTION_MAX_FIRST, remaining ?? ENTITIES_CONNECTION_MAX_FIRST);
      const page = yield* fetchPage(chunk, nextAfter, nextOffset);
      collected.push(...page.entities);
      lastEndCursor = page.endCursor;
      lastHasNextPage = page.hasNextPage;

      if (!page.hasNextPage || page.entities.length === 0) {
        break;
      }
      if (remaining !== undefined) {
        remaining -= page.entities.length;
      }
      nextAfter = page.endCursor ?? undefined;
      nextOffset = undefined;
    }

    return { entities: collected, endCursor: lastEndCursor, hasNextPage: lastHasNextPage } satisfies EntitiesPage;
  });
}

type GetEntitiesOrderedByPropertyOptions = {
  propertyId: string;
  sortDirection: SortOrder;
  dataType?: string;
  includeWithoutValue?: boolean;
  spaceId?: string;
  spaceIds?: string[];
  typeIds?: string[];
  limit?: number;
  after?: string;
  /** Bounded forward skip relative to `after`. See `GetAllEntitiesOptions.offset`. */
  offset?: number;
  filter?: EntityFilter;
};

function nonEmptyIds(ids?: readonly (string | null | undefined)[]): string[] | undefined {
  const normalized = ids?.filter((id): id is string => typeof id === 'string' && id.length > 0) ?? [];
  return normalized.length > 0 ? normalized : undefined;
}

function idsFromUuidFilter(filter?: UuidFilter): string[] | undefined {
  if (!filter) return undefined;

  if (Array.isArray(filter.in)) {
    return nonEmptyIds(filter.in);
  }

  if (typeof filter.is === 'string') {
    return [filter.is];
  }

  return undefined;
}

export function getEntitiesOrderedByPropertyConnection(
  {
    propertyId,
    sortDirection,
    dataType,
    includeWithoutValue,
    spaceId,
    spaceIds,
    typeIds,
    limit,
    after,
    offset,
    filter,
  }: GetEntitiesOrderedByPropertyOptions,
  signal?: AbortController['signal']
) {
  const extractedSpaceId = extractSingleSpaceIdFromFilter(filter);
  const extractedSpaceIds = extractSpaceIdsFromFilter(filter);
  const extractedTypeId = extractSingleTypeIdFromFilter(filter);
  const extractedTypeIds = extractTypeIdsFromFilter(filter);

  const topLevelSpaceId = spaceId ?? extractedSpaceId;
  const topLevelSpaceIds =
    nonEmptyIds(spaceIds) ?? idsFromUuidFilter(extractedSpaceIds) ?? (topLevelSpaceId ? [topLevelSpaceId] : undefined);

  const topLevelTypeIds =
    nonEmptyIds(typeIds) ?? idsFromUuidFilter(extractedTypeIds) ?? (extractedTypeId ? [extractedTypeId] : undefined);

  let normalizedFilter = filter;
  if (topLevelSpaceId || topLevelSpaceIds) {
    normalizedFilter = removeSpaceIdsFromFilter(normalizedFilter);
  }
  if (topLevelTypeIds) {
    normalizedFilter = removeTypeIdsFromFilter(normalizedFilter);
  }

  return graphql({
    query: entitiesOrderedByPropertyConnectionDocument,
    decoder: (data: { entitiesOrderedByPropertyConnection?: EntitiesConnectionShape }) =>
      decodeEntitiesConnectionPage(data.entitiesOrderedByPropertyConnection ?? null),
    variables: {
      propertyId,
      sortDirection,
      dataType,
      includeWithoutValue,
      spaceId: topLevelSpaceId,
      spaceIds: topLevelSpaceIds,
      typeIds: topLevelTypeIds,
      limit,
      after,
      offset,
      filter: normalizedFilter,
    },
    signal,
  });
}

export function getEntity(entityId: string, spaceId?: string, signal?: AbortController['signal']) {
  return Effect.gen(function* () {
    const entity = yield* graphql({
      query: entityQuery,
      decoder: data => data.entity ?? null,
      variables: { id: entityId, spaceId },
      signal,
    });

    if (!entity) {
      return null;
    }

    // `relations` is the paginated connection (the non-paginated `relationsList`
    // truncates at the server's 100-row default). Drain every page so hydration
    // is correct for entities with any number of relations, then merge the nodes
    // into the `relationsList` shape the decoder expects.
    const relationNodes = [...entity.relations.nodes];
    let pageInfo = entity.relations.pageInfo;

    while (pageInfo.hasNextPage && pageInfo.endCursor) {
      const cursor = pageInfo.endCursor;
      const nextPage = yield* graphql({
        query: entityRelationsPageQuery,
        decoder: data => data.entity?.relations ?? null,
        variables: { id: entityId, spaceId, cursor },
        signal,
      });

      if (!nextPage || nextPage.nodes.length === 0) {
        break;
      }

      relationNodes.push(...nextPage.nodes);
      pageInfo = nextPage.pageInfo;
    }

    return EntityDecoder.decode({ ...entity, relationsList: relationNodes });
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

export function getRelationsByFromEntityId(
  fromEntityId: string,
  typeId: string,
  spaceId: string,
  signal?: AbortController['signal']
) {
  return graphql({
    query: relationsByFromEntityIdQuery,
    decoder: data =>
      data.relations
        ? data.relations.map(r => RelationDecoder.decode(r)).filter((r): r is NonNullable<typeof r> => r !== null)
        : [],
    variables: { fromEntityId, typeId, spaceId },
    signal,
  });
}

export type EntityTiebreakerData = {
  id: string;
  createdAt: string;
  backlinksCount: number;
  relationsCount: number;
  valuesCount: number;
};

export function getEntityTiebreakerBatch(entityIds: string[], signal?: AbortController['signal']) {
  return graphql({
    query: entityTiebreakerBatchQuery,
    decoder: data =>
      (data.entities ?? []).map((e): EntityTiebreakerData => ({
        id: e.id,
        createdAt: e.createdAt,
        backlinksCount: e.backlinks?.totalCount ?? 0,
        relationsCount: e.relations?.totalCount ?? 0,
        valuesCount: e.values?.totalCount ?? 0,
      })),
    variables: { filter: { id: { in: entityIds } } },
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

const BACKLINKS_PAGE_SIZE = 1000;

/**
 * Cheap "does this entity exist in the indexer yet" probe — returns true once an entity with
 * the given id is queryable. Used by the post-publish poll so we don't have to refetch the
 * full comment list every 2 seconds just to check for a single id.
 */
export function checkEntityExists(entityId: string, signal?: AbortController['signal']) {
  return graphql({
    query: EntityExistsDocument,
    decoder: (data: EntityExistsQuery) => data.entity?.id != null,
    variables: { id: entityId },
    signal,
  });
}

export function getBatchEntitiesForComments(entityIds: string[], signal?: AbortController['signal']) {
  return graphql({
    query: EntitiesBatchForCommentsDocument,
    decoder: (data: EntitiesBatchForCommentsQuery) =>
      data.entities?.map(EntityDecoder.decode).filter((e): e is Entity => e !== null) ?? [],
    variables: { filter: { id: { in: entityIds } } },
    signal,
  });
}

/**
 * Walks a paginated `backlinksList` query and collects the distinct source entity ids.
 * `id` is typed loosely because codegen maps the UUID scalar to `any`.
 */
function collectBacklinkSourceIds<E>(
  fetchPage: (offset: number) => Effect.Effect<ReadonlyArray<{ fromEntity?: { id: unknown } | null } | null>, E>
) {
  return Effect.gen(function* () {
    const seen = new Set<string>();
    const ids: string[] = [];

    for (let offset = 0; ; offset += BACKLINKS_PAGE_SIZE) {
      const page = yield* fetchPage(offset);

      for (const row of page) {
        const id = row?.fromEntity?.id;
        if (typeof id !== 'string' || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }

      if (page.length < BACKLINKS_PAGE_SIZE) return ids;
    }
  });
}

function getCommentEntityIdsViaParentEntityReplyBacklinks(parentEntityId: string, signal?: AbortController['signal']) {
  return collectBacklinkSourceIds(offset =>
    graphql({
      query: EntityCommentReplyBacklinksPageDocument,
      decoder: (data: EntityCommentReplyBacklinksPageQuery) => data.entity?.backlinksList ?? [],
      variables: {
        id: parentEntityId,
        replyToTypeId: COMMENT_REPLY_TO_ID,
        commentTypeId: COMMENT_TYPE_ID,
        first: BACKLINKS_PAGE_SIZE,
        offset,
      },
      signal,
    })
  );
}

/** Counts distinct Comment entities connected to the target by incoming "Reply to" relations. */
export function getEntityCommentCount(entityId: string, signal?: AbortController['signal']) {
  return Effect.map(getCommentEntityIdsViaParentEntityReplyBacklinks(entityId, signal), ids => ids.length);
}

/**
 * Loads Comment entities from incoming "Reply to" backlinks on the parent entity.
 * Nested replies are included when they also backlink to the parent (same index pattern).
 */
export function getCommentEntitiesViaParentEntityReplyBacklinks(
  parentEntityId: string,
  signal?: AbortController['signal']
) {
  return Effect.gen(function* () {
    const ids = yield* getCommentEntityIdsViaParentEntityReplyBacklinks(parentEntityId, signal);

    if (ids.length === 0) return [] as Entity[];
    return yield* getBatchEntitiesForComments(ids, signal);
  });
}

/**
 * Loads the Vote entities cast on a debate, from incoming "Debates" relations on entities
 * typed Vote. Each vote lives in its own voter's personal space, so the tally is read across
 * spaces rather than from one.
 */
export function getDebateVoteEntities(debateEntityId: string, signal?: AbortController['signal']) {
  return Effect.gen(function* () {
    const ids = yield* collectBacklinkSourceIds(offset =>
      graphql({
        query: debateVoteBacklinksPageDocument,
        decoder: (data: DebateVoteBacklinksPageQuery) => data.entity?.backlinksList ?? [],
        variables: {
          id: debateEntityId,
          votesDebatePropertyId: VOTE_DEBATES_PROPERTY_ID,
          voteTypeId: VOTE_TYPE_ID,
          first: BACKLINKS_PAGE_SIZE,
          offset,
        },
        signal,
      })
    );

    if (ids.length === 0) return [] as Entity[];
    return yield* getBatchEntitiesForComments(ids, signal);
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
  {
    limit,
    offset,
    spaceIds,
    topicIds,
  }: { limit?: number; offset?: number; spaceIds?: string[]; topicIds?: string[] } = {},
  signal?: AbortController['signal']
) {
  // Build the filter from whichever id set the caller passed. `topicIds` is
  // how we resolve an entity-of-type-Space (returned by the search endpoint)
  // back to the actual space container the app navigates to.
  let filter: { id?: { in: string[] }; topicId?: { in: string[] } } | undefined;
  if (spaceIds) filter = { ...filter, id: { in: spaceIds } };
  if (topicIds) filter = { ...filter, topicId: { in: topicIds } };

  return graphql({
    query: spacesQuery,
    decoder: data => data.spaces?.map(SpaceDecoder.decode).filter((e): e is Space => e !== null) ?? [],
    variables: {
      limit,
      offset,
      filter,
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

// Filter server-side: `membersList` is paginated to 100 by the API, so a
// client-side `includes()` against `FullSpace` misses members past page 1.
export function getIsMemberOfSpace(spaceId: string, memberSpaceId: string, signal?: AbortController['signal']) {
  return graphql({
    query: isMemberOfSpaceQuery,
    decoder: data => (data.space?.membersList?.length ?? 0) > 0,
    variables: { spaceId, memberSpaceId },
    signal,
  });
}

export function getIsEditorOfSpace(spaceId: string, memberSpaceId: string, signal?: AbortController['signal']) {
  return graphql({
    query: isEditorOfSpaceQuery,
    decoder: data => (data.space?.editorsList?.length ?? 0) > 0,
    variables: { spaceId, memberSpaceId },
    signal,
  });
}

export type SpaceParticipantsPage = {
  memberSpaceIds: string[];
  totalCount: number;
};

export function getSpaceMembersPage(
  spaceId: string,
  { first, offset }: { first: number; offset: number },
  signal?: AbortController['signal']
) {
  return graphql({
    query: spaceMembersPageQuery,
    decoder: (data): SpaceParticipantsPage => ({
      memberSpaceIds: data.space?.membersList?.map(m => m.memberSpaceId as string) ?? [],
      totalCount: data.space?.members?.totalCount ?? 0,
    }),
    variables: { spaceId, first, offset },
    signal,
  });
}

export function getSpaceEditorsPage(
  spaceId: string,
  { first, offset }: { first: number; offset: number },
  signal?: AbortController['signal']
) {
  return graphql({
    query: spaceEditorsPageQuery,
    decoder: (data): SpaceParticipantsPage => ({
      memberSpaceIds: data.space?.editorsList?.map(e => e.memberSpaceId as string) ?? [],
      totalCount: data.space?.editors?.totalCount ?? 0,
    }),
    variables: { spaceId, first, offset },
    signal,
  });
}

/**
 * Get a personal space by wallet address. Returns the space owned by this address, or
 * null if none exists.
 *
 * An address can have MORE than one indexed space. `overrideSpaceId` retires an
 * account's previous space id on-chain, but the indexer keeps serving the retired row,
 * so the same account appears twice — often under different address casing, which the
 * case-insensitive filter (deliberately kept: addresses are stored both checksummed and
 * lowercase) collapses into one result set. Taking `spaces[0]` from an unordered query
 * then picks the dead space about half the time, and because the personal space is the
 * *author* of every write, that bricks the account entirely — every publish, vote, and
 * comment reverts `SpaceNotActive()` no matter which space it targets.
 *
 * So when the index returns more than one row, ask the registry which id is still
 * active. The single-row case — every healthy account — costs no extra RPC.
 */
export function getSpaceByAddress(address: string, signal?: AbortController['signal']) {
  return graphql({
    query: spacesQuery,
    decoder: data => data.spaces ?? [],
    // Use case-insensitive matching since Ethereum addresses can be checksummed or lowercase
    variables: { filter: { address: { isInsensitive: address } }, limit: DUPLICATE_SPACE_SCAN_LIMIT },
    signal,
  }).pipe(Effect.flatMap(spaces => resolveActiveSpace(spaces, address)));
}

/** Bounds the duplicate scan. Real accounts have 1; the sweep that created these produced 2. */
const DUPLICATE_SPACE_SCAN_LIMIT = 10;

/** Exported for testing; call `getSpaceByAddress`. */
export function resolveActiveSpace(spaces: readonly unknown[], address: string) {
  return Effect.gen(function* () {
    if (spaces.length === 0) return null;
    if (spaces.length === 1) return SpaceDecoder.decode(spaces[0] as never);

    const decoded = spaces.map(space => SpaceDecoder.decode(space as never)).filter(space => space !== null);
    if (decoded.length <= 1) return decoded[0] ?? null;

    const active = yield* Effect.tryPromise({
      // Imported lazily on purpose. geo-network pulls in the chain config, which
      // resolves an RPC at module scope and throws when none is configured — a
      // static import would make this shared query module unloadable in any
      // context without a live chain, including unit tests. Duplicate rows are
      // rare, so paying for the module only here costs nothing in practice.
      try: async () => {
        const { isSpaceActiveOnChain } = await import('~/core/sdk/geo-network');
        return Promise.all(decoded.map(space => isSpaceActiveOnChain(space.id)));
      },
      // isSpaceActiveOnChain already swallows RPC failures to `false`; this guards
      // only against an unexpected throw, and index order is the safe fallback.
      catch: () => new Error('failed to resolve active space'),
    }).pipe(Effect.orElseSucceed(() => decoded.map(() => false)));

    const activeSpace = decoded.find((_, index) => active[index]);

    if (!activeSpace) {
      console.warn(
        `[getSpaceByAddress] ${decoded.length} indexed spaces for ${address}, none active on-chain. ` +
          `Falling back to index order (${decoded[0].id}).`
      );
      return decoded[0];
    }

    if (activeSpace.id !== decoded[0].id) {
      console.warn(
        `[getSpaceByAddress] ${decoded.length} indexed spaces for ${address}; index order returned the ` +
          `retired ${decoded[0].id}, using the on-chain active ${activeSpace.id}.`
      );
    }

    return activeSpace;
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
  additionalSpaceIds?: string[];
  /**
   * Pass `false` to restrict results to the canonical graph plus the user's
   * scoped spaces (`additionalSpaceIds`).
   *
   * Where that gate runs depends on whether the request scopes spaces — see
   * `buildSearchPath`. Scoped requests gate client-side in `getResultsPage` via each
   * result's `inCanonicalGraph` flag, so scoped-space results are never stripped
   * before they reach us; unscoped requests gate server-side, so the canonical rows
   * can't be pushed off the endpoint's 100-row page by non-canonical ones.
   */
  includeNonCanonical?: boolean;
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
  return uuid.replace(/-/g, '').toLowerCase();
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

    const spaceTypes = (r.types ?? []).map(type => ({ id: stripHyphens(type.id), name: type.name ?? null }));

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

      // Track types per space
      if (existing.typesBySpace) {
        existing.typesBySpace[spaceId] = spaceTypes;
      }
      existing.namesBySpace = {
        ...(existing.namesBySpace ?? {}),
        [spaceId]: r.name ?? null,
      };
    } else {
      byEntity.set(entityId, {
        id: entityId,
        name: r.name ?? null,
        description: r.description ?? null,
        types: (r.types ?? []).map(type => ({ id: stripHyphens(type.id), name: type.name ?? null })),
        namesBySpace: { [spaceId]: r.name ?? null },
        typesBySpace: { [spaceId]: spaceTypes },
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
export type SearchResultsPage = {
  results: SearchResult[];
  /**
   * Total number of matches across the whole result set, as reported by the
   * REST endpoint. Paginated callers should use this to detect exhaustion
   * (`offset + rawCount >= total`).
   */
  total: number;
  /**
   * Per-space rows returned on this page after `shouldIncludeRestSearchResult`
   * exclusions but before grouping by entity. Useful as a "did we get a full
   * page worth of rows that can actually reach the UI?" pagination signal
   * when `total` is unavailable or unreliable. Intentionally post-exclusion
   * — a page where every raw row was excluded as a block/system type should
   * read as empty, not as a full page.
   */
  rawCount: number;
  /**
   * Raw row count in the REST response before any exclusion or canonical
   * gating. This is the correct "did the server hand us a full page?" signal
   * for empty-page pumping: a full server page that gates down to zero rows
   * still means more pages may exist, so pagination must not stop on it.
   */
  serverCount: number;
};

export function buildSearchPath(args: ResultsArgs): string {
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

  const scopesAdditionalSpaces = Boolean(args.additionalSpaceIds?.length) && !args.spaceId;

  if (scopesAdditionalSpaces) {
    // REST endpoint expects UUIDs with hyphens
    params.set('additional_space_ids', args.additionalSpaceIds!.map(toUuid).join(','));
  }

  // Canonical filtering runs server-side only when we aren't widening to scoped spaces.
  // The endpoint documents `additional_space_ids` as "ignored when
  // include_non_canonical=false" and means it literally — sending both silently drops
  // the scoped spaces, which is why #1949 stopped emitting this param and moved the
  // gate into `shouldIncludeRestSearchResult`.
  //
  // A client-side gate can only filter the page it was handed, though, and the endpoint
  // caps a page at 100 rows however large a `limit` you ask for. That loses badly for an
  // unscoped caller listing a type dominated by non-canonical entities: the
  // community-calls digest requested every Community Call, got 100 test-space rows of
  // 382 with none canonical, and filtered down to nothing while all 8 curated calls sat
  // past offset 100 — so the Explore panel vanished entirely (GEO-2480).
  //
  // Unscoped callers therefore filter at the source; the client-side gate stays as a
  // no-op safety net. Search-dialog requests are unaffected — they always carry
  // ROOT_SPACE in `additionalSpaceIds` (see buildGlobalSearchSpaceIds), so they take the
  // branch above and emit a byte-identical URL.
  if (args.includeNonCanonical === false && !scopesAdditionalSpaces) {
    params.set('include_non_canonical', 'false');
  }

  return `/search?${params.toString()}`;
}

export function getResultsPage(args: ResultsArgs, signal?: AbortController['signal']) {
  return Effect.map(
    restFetch<RestSearchResponse>({
      endpoint: getConfig().api,
      path: buildSearchPath(args),
      signal,
    }),
    (response): SearchResultsPage => {
      const scopedSpaceIds = new Set((args.additionalSpaceIds ?? []).map(stripHyphens));
      const canonicalOnly = args.includeNonCanonical === false;
      const filtered = response.results.filter(result =>
        shouldIncludeRestSearchResult(result, { canonicalOnly, scopedSpaceIds })
      );
      return {
        results: groupRestResults(filtered),
        total: response.total,
        // Post-exclusion count — callers paginate against rows that can
        // actually reach the UI, not rows filtered out as block/system
        // types at this layer.
        rawCount: filtered.length,
        // Pre-filter server page length — drives empty-page pumping so a full
        // page gated down to zero canonical rows still fetches the next page.
        serverCount: response.results.length,
      };
    }
  );
}

export function getResults(args: ResultsArgs, signal?: AbortController['signal']) {
  return Effect.map(getResultsPage(args, signal), page => page.results);
}

export type PropertiesSearchPage = {
  results: SearchResult[];
  offset: number;
};

/**
 * Server-side property search backed by GraphQL `entities(filter, first, offset)`.
 * The caller composes an `EntityFilter` with `relations.some` clauses so the
 * dataType / renderableType / relationValueTypes narrowing happens server-side
 * instead of by hydrating each result and filtering on the client. After the
 * entity page lands we issue one batched `getSpaces` to attach the `SpaceEntity`
 * objects `ResultContent` needs for the breadcrumb.
 */
export function searchPropertiesPage(
  args: { filter: EntityFilter; limit: number; offset: number },
  signal?: AbortController['signal']
) {
  return Effect.gen(function* () {
    const entities =
      (yield* graphql({
        query: entitiesPageQuery,
        decoder: data => data.entities ?? [],
        variables: { filter: args.filter, first: args.limit, offset: args.offset },
        signal,
      })) ?? [];

    const uniqueSpaceIds = [
      ...new Set(entities.flatMap(e => e?.spaceIds ?? []).filter((id): id is string => typeof id === 'string')),
    ];

    const spaces = uniqueSpaceIds.length > 0 ? yield* getSpaces({ spaceIds: uniqueSpaceIds }, signal) : [];

    const spaceEntityBySpaceId = new Map(spaces.map(s => [s.id, s.entity]));

    const results: SearchResult[] = entities
      .filter((e): e is NonNullable<typeof e> => Boolean(e))
      .map(e => {
        const sortedSpaceIds = sortSpaceIdsByRank(
          (e.spaceIds ?? []).filter((id): id is string => typeof id === 'string')
        );
        return {
          id: e.id as string,
          name: e.name ?? null,
          description: e.description ?? null,
          spaces: sortedSpaceIds
            .map(id => spaceEntityBySpaceId.get(id))
            .filter((s): s is NonNullable<typeof s> => s !== undefined),
          types: (e.types ?? [])
            .filter((t): t is NonNullable<typeof t> => Boolean(t?.id))
            .map(t => ({ id: t.id as string, name: t.name ?? null })),
        };
      });

    return { results, offset: args.offset };
  });
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
export function getNameValuesBatch(args: { names: string[]; typeIds?: string[] }, signal?: AbortController['signal']) {
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

export function getEntityResponseCounts(
  entityId: string,
  spaceId: string,
  responseKind: ResponseKind,
  objectType: ResponseObjectType = 0, // objectType: 0 = Entity, 1 = Relation
  signal?: AbortController['signal']
) {
  return graphql({
    query: entityResponseCountsQuery,
    decoder: data => {
      const counts = data.votesCountByObjectIdAndObjectTypeAndSpaceIdAndVoteKind;
      if (!counts) return null;
      return { positive: Number(counts.positive), negative: Number(counts.negative) };
    },
    variables: entityResponseQueryVariables(entityId, spaceId, objectType, responseKind),
    signal,
  });
}

export function getUserEntityResponse(
  userId: string,
  entityId: string,
  spaceId: string,
  responseKind: ResponseKind,
  objectType: ResponseObjectType = 0,
  signal?: AbortController['signal']
) {
  return graphql({
    query: userEntityResponseQuery,
    decoder: data => {
      return decodeActiveResponseDirection(
        data.userVoteByUserIdAndObjectIdAndObjectTypeAndSpaceIdAndVoteKind?.voteType
      );
    },
    variables: {
      userId,
      ...entityResponseQueryVariables(entityId, spaceId, objectType, responseKind),
    },
    signal,
  });
}

export function getUserHasEntityVote(userId: string, signal?: AbortController['signal']) {
  return graphql({
    query: UserHasEntityVoteDocument,
    decoder: data => (data.userVotes?.length ?? 0) > 0,
    variables: { userId },
    signal,
  });
}

export type EntityResponder = { userId: string; direction: ActiveResponseDirection };

export type ClaimResponseSummaryRow = {
  userId: string;
  objectId: string;
  voteType: number;
  voteKind: number;
};

export function getClaimResponseSummaryPage(
  filter: UserVoteFilter,
  first: number,
  offset: number,
  signal?: AbortController['signal']
) {
  return graphql({
    query: claimResponseSummariesQuery,
    decoder: data =>
      (data.userVotes ?? []).map((vote): ClaimResponseSummaryRow => ({
        userId: String(vote.userId),
        objectId: String(vote.objectId),
        voteType: vote.voteType,
        voteKind: vote.voteKind,
      })),
    variables: { filter, first, offset },
    signal,
  });
}

export function getEntityResponders(
  entityId: string,
  spaceId: string,
  responseKind: ResponseKind,
  objectType: ResponseObjectType = 0,
  signal?: AbortController['signal']
) {
  return graphql({
    query: entityRespondersQuery,
    decoder: data => {
      return (data.userVotes ?? []).flatMap(vote => {
        const direction = decodeActiveResponseDirection(vote.voteType);
        return direction ? [{ userId: String(vote.userId), direction }] : [];
      });
    },
    variables: entityResponseQueryVariables(entityId, spaceId, objectType, responseKind),
    signal,
  });
}

export const USER_ENTITY_VOTES_PAGE_SIZE = 50;

type UserEntityVotesPage = {
  nodes: Array<{ objectId: string; voteKind: number }>;
  pageInfo: { hasNextPage: boolean; endCursor?: string | null };
};

export type UserEntityVoteObjectIdsPage = {
  objectIds: string[];
  voteKindByObjectId: Record<string, number>;
  endCursor: string | null;
  hasNextPage: boolean;
};

export function getUserEntityVoteObjectIdsPage(
  userId: string,
  voteType: 0 | 1,
  objectType: 0 | 1 = 0,
  after?: string | null,
  signal?: AbortController['signal']
) {
  return Effect.gen(function* () {
    const page: UserEntityVotesPage = yield* graphql({
      query: UserEntityVotesByTypeDocument,
      decoder: (data): UserEntityVotesPage =>
        data.userVotesConnection ?? { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
      variables: {
        userId,
        voteType,
        objectType,
        first: USER_ENTITY_VOTES_PAGE_SIZE,
        after: after ?? null,
      },
      signal,
    });

    const nodes = page.nodes.filter(node => Boolean(node.objectId));
    const objectIds = nodes.map(node => node.objectId);
    const voteKindByObjectId = Object.fromEntries(nodes.map(node => [uuidToHex(node.objectId), node.voteKind]));
    const endCursor = page.pageInfo.endCursor ?? null;

    return {
      objectIds,
      voteKindByObjectId,
      endCursor,
      // A cursor is required to advance, so treat a missing one as the end.
      hasNextPage: Boolean(page.pageInfo.hasNextPage && endCursor),
    } satisfies UserEntityVoteObjectIdsPage;
  });
}

const EXCLUDED_BLOCK_TYPES = [
  SystemIds.TEXT_BLOCK,
  SystemIds.IMAGE_BLOCK,
  SystemIds.DATA_BLOCK,
  SystemIds.IMAGE_TYPE,
  SystemIds.VIDEO_TYPE,
  SystemIds.VIDEO_BLOCK,
  RANKING_BLOCK_TYPE_ID,
];

const BLOCK_TYPE_EXCLUSION_FILTER: EntityFilter = {
  not: {
    typeIds: { overlaps: EXCLUDED_BLOCK_TYPES },
  },
};

const EXCLUDED_BLOCK_TYPE_IDS = new Set(EXCLUDED_BLOCK_TYPES.map(typeId => typeId.replace(/-/g, '')));

export function hasDefaultSearchExcludedType(types: Array<{ id: string }>): boolean {
  return types.some(type => EXCLUDED_BLOCK_TYPE_IDS.has(stripHyphens(type.id)));
}

export function shouldIncludeRestSearchResult(
  result: RestSearchResult,
  canonicalGate?: { canonicalOnly: boolean; scopedSpaceIds: Set<string> }
): boolean {
  if (hasDefaultSearchExcludedType(result.types ?? [])) return false;
  if (!canonicalGate?.canonicalOnly) return true;
  // Canonical-only still surfaces the user's scoped spaces, not only the canonical graph.
  return result.inCanonicalGraph === true || canonicalGate.scopedSpaceIds.has(stripHyphens(result.space.id));
}
