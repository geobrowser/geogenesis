import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { SCORE_SYSTEM_PROPERTY } from '~/core/constants';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import {
  type ExploreCardEntity,
  decodeExploreCardEntity,
} from '~/core/explore/explore-card-item';
import { exploreCardNodeFields, exploreCardPropertyFragment } from '~/core/explore/explore-card-selection';
import { EntitiesOrderBy, type EntityFilter, type RelationFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

export const CLAIM_RECORD_PAGE_SIZE = 20;

const CLAIM_FRAGMENT = 'ClaimRecordClaimPropertyFragment';
const DEBATE_FRAGMENT = 'ClaimRecordDebatePropertyFragment';

const CLAIMS_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(CLAIM_FRAGMENT)}

  query ClaimRecordClaims(
    $claimTypeId: UUID!
    $spaceIds: [UUID!]!
    $spaceIdsForLists: [UUID!]!
    $topicFilter: EntityFilter!
    $extractedFilter: EntityFilter!
    $relatedFilter: EntityFilter!
    $matchingFilter: RelationFilter!
    $orderBy: [EntitiesOrderBy!]!
    $scorePropertyId: UUID!
    $first: Int!
    $topicAfter: Cursor
    $extractedAfter: Cursor
    $skipTopicClaims: Boolean!
    $skipExtractedClaims: Boolean!
    $fetchRelatedClaimsTop: Boolean!
  ) {
    topicClaims: entitiesConnection(
      first: $first
      after: $topicAfter
      typeId: $claimTypeId
      filter: $topicFilter
      orderBy: $orderBy
    ) @skip(if: $skipTopicClaims) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        rankingScore
        updatedAt
        matchingRelations: relationsList(filter: $matchingFilter) {
          spaceId
        }
        ${exploreCardNodeFields(CLAIM_FRAGMENT)}
      }
    }

    extractedClaims: entitiesConnection(
      first: $first
      after: $extractedAfter
      typeId: $claimTypeId
      filter: $extractedFilter
      orderBy: $orderBy
    ) @skip(if: $skipExtractedClaims) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        rankingScore
        updatedAt
        matchingRelations: relationsList(filter: $matchingFilter) {
          spaceId
        }
        ${exploreCardNodeFields(CLAIM_FRAGMENT)}
      }
    }

    relatedClaimsTop: entitiesOrderedByPropertyConnection(
      first: $first
      after: $topicAfter
      filter: $relatedFilter
      propertyId: $scorePropertyId
      dataType: "integer"
      sortDirection: DESC
      includeWithoutValue: true
      spaceIds: $spaceIds
      typeIds: [$claimTypeId]
    ) @include(if: $fetchRelatedClaimsTop) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        rankingScore
        updatedAt
        matchingRelations: relationsList(filter: $matchingFilter) {
          spaceId
        }
        ${exploreCardNodeFields(CLAIM_FRAGMENT)}
      }
    }
  }
`;

const DEBATES_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(DEBATE_FRAGMENT)}

  query ClaimRecordDebates(
    $debateTypeId: UUID!
    $spaceIds: [UUID!]!
    $spaceIdsForLists: [UUID!]!
    $filter: EntityFilter!
    $matchingFilter: RelationFilter!
    $orderBy: [EntitiesOrderBy!]!
    $scorePropertyId: UUID!
    $first: Int!
    $after: Cursor
    $isTop: Boolean!
  ) {
    debates: entitiesConnection(
      first: $first
      after: $after
      typeId: $debateTypeId
      filter: $filter
      orderBy: $orderBy
    ) @skip(if: $isTop) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        rankingScore
        updatedAt
        matchingRelations: relationsList(filter: $matchingFilter) {
          spaceId
        }
        ${exploreCardNodeFields(DEBATE_FRAGMENT)}
      }
    }

    debatesTop: entitiesOrderedByPropertyConnection(
      first: $first
      after: $after
      filter: $filter
      propertyId: $scorePropertyId
      dataType: "integer"
      sortDirection: DESC
      includeWithoutValue: true
      spaceIds: $spaceIds
      typeIds: [$debateTypeId]
    ) @include(if: $isTop) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        rankingScore
        updatedAt
        matchingRelations: relationsList(filter: $matchingFilter) {
          spaceId
        }
        ${exploreCardNodeFields(DEBATE_FRAGMENT)}
      }
    }
  }
`;

const COUNTS_SOURCE = /* GraphQL */ `
  query ClaimRecordCounts($claimFilter: RelationFilter!, $debateFilter: RelationFilter!) {
    claims: relationsConnection(filter: $claimFilter) {
      aggregates {
        distinctCount {
          fromEntityId
        }
      }
    }
    debates: relationsConnection(filter: $debateFilter) {
      aggregates {
        distinctCount {
          fromEntityId
        }
      }
    }
  }
`;

export const claimRecordClaimsDocument = parse(CLAIMS_SOURCE) as TypedDocumentNode<any, any>;
export const claimRecordDebatesDocument = parse(DEBATES_SOURCE) as TypedDocumentNode<any, any>;
export const claimRecordCountsDocument = parse(COUNTS_SOURCE) as TypedDocumentNode<any, any>;

export type ClaimRecordSort = 'best' | 'top' | 'new';

export function claimRecordOrderBy(sort: ClaimRecordSort): EntitiesOrderBy[] {
  if (sort === 'new') return [EntitiesOrderBy.CreatedAtDesc, EntitiesOrderBy.IdAsc];
  return [EntitiesOrderBy.RankingScoreDesc, EntitiesOrderBy.UpdatedAtDesc, EntitiesOrderBy.IdAsc];
}

export type ClaimRecordFilters = {
  hasTopics: boolean;
  topicClaims: EntityFilter;
  extractedClaims: EntityFilter;
  relatedClaims: EntityFilter;
  debates: EntityFilter;
  claimRelations: RelationFilter;
  /** Topics carried by the exact Related claims union, grouped for the Topics menu. */
  claimTopicRelations: RelationFilter;
  debateRelations: RelationFilter;
};

/**
 * One definition of the record shared by the result pages and their exact counts.
 *
 * Related claims are the union of claims sharing a space-scoped topic and claims whose Sources
 * relation points at a direct debate on this claim. Relation counts use the same predicates and
 * count distinct source entities, so overlap between those paths never inflates the tab count.
 */
export function claimRecordFilters({
  claimId,
  spaceIds,
  topicIds,
  filterTopicIds,
}: {
  claimId: string;
  spaceIds: string[];
  topicIds: string[];
  filterTopicIds: string[];
}): ClaimRecordFilters {
  const scopes = [...new Map(spaceIds.map(id => [normId(id), id])).values()];
  if (scopes.length === 0) throw new Error('Claim records require at least one space');

  const selectedTopicConditions = (spaceId: string): EntityFilter[] =>
    filterTopicIds.map(topicId => ({
      relations: {
        some: {
          typeId: { is: TOPICS_PROPERTY_ID },
          spaceId: { is: spaceId },
          toEntityId: { is: topicId },
        },
      },
    }));

  const claimScope = (spaceId: string): EntityFilter => ({
    id: { isNot: claimId },
    typeIds: { overlaps: [CLAIM_TYPE_ID] },
    spaceIds: { overlaps: [spaceId] },
  });
  const narrowedClaimScope = (spaceId: string): EntityFilter => ({
    ...claimScope(spaceId),
    ...(filterTopicIds.length > 0 ? { and: selectedTopicConditions(spaceId) } : {}),
  });
  const debateScope = (spaceId: string): EntityFilter => ({
    typeIds: { overlaps: [DEBATE_TYPE_ID] },
    spaceIds: { overlaps: [spaceId] },
  });
  const directClaimRelation = (spaceId: string): RelationFilter => ({
    typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
    spaceId: { is: spaceId },
    toEntityId: { is: claimId },
  });
  const directDebate = (spaceId: string): EntityFilter => ({
    ...debateScope(spaceId),
    relations: { some: directClaimRelation(spaceId) },
  });
  const extractedSourceRelation = (spaceId: string): RelationFilter => ({
    typeId: { is: SOURCES_PROPERTY_ID },
    spaceId: { is: spaceId },
    toEntity: directDebate(spaceId),
  });
  const topicRelation = (spaceId: string): RelationFilter => ({
    typeId: { is: TOPICS_PROPERTY_ID },
    spaceId: { is: spaceId },
    toEntityId: { in: topicIds },
  });
  const topicClaim = (spaceId: string): EntityFilter => ({
    ...claimScope(spaceId),
    and: [{ relations: { some: topicRelation(spaceId) } }, ...selectedTopicConditions(spaceId)],
  });
  const extractedClaim = (spaceId: string): EntityFilter => ({
    ...claimScope(spaceId),
    and: [{ relations: { some: extractedSourceRelation(spaceId) } }, ...selectedTopicConditions(spaceId)],
  });
  const relatedClaim = (spaceId: string): EntityFilter => ({
    ...narrowedClaimScope(spaceId),
    or: [
      ...(topicIds.length > 0 ? [{ relations: { some: topicRelation(spaceId) } }] : []),
      { relations: { some: extractedSourceRelation(spaceId) } },
    ],
  });

  const debateBranches: EntityFilter[] = scopes.map(spaceId => ({
    ...debateScope(spaceId),
    relations: {
      some: {
        typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
        spaceId: { is: spaceId },
        toEntity: { id: { is: claimId } },
      },
    },
  }));
  const claimRelationBranches: RelationFilter[] = scopes.flatMap(spaceId => [
    ...(topicIds.length > 0
      ? [
          {
            ...topicRelation(spaceId),
            fromEntity: narrowedClaimScope(spaceId),
          },
        ]
      : []),
    {
      ...extractedSourceRelation(spaceId),
      fromEntity: narrowedClaimScope(spaceId),
    },
  ]);
  const claimTopicRelationBranches: RelationFilter[] = scopes.map(spaceId => ({
    typeId: { is: TOPICS_PROPERTY_ID },
    spaceId: { is: spaceId },
    fromEntity: relatedClaim(spaceId),
  }));
  const debateRelationBranches: RelationFilter[] = scopes.map(spaceId => ({
    typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
    spaceId: { is: spaceId },
    fromEntity: debateScope(spaceId),
    toEntity: { id: { is: claimId } },
  }));

  return {
    hasTopics: topicIds.length > 0,
    topicClaims: { or: scopes.map(topicClaim) },
    extractedClaims: { or: scopes.map(extractedClaim) },
    relatedClaims: { or: scopes.map(relatedClaim) },
    debates: debateBranches.length === 1 ? debateBranches[0] : { or: debateBranches },
    claimRelations: { or: claimRelationBranches },
    claimTopicRelations: { or: claimTopicRelationBranches },
    debateRelations:
      debateRelationBranches.length === 1 ? debateRelationBranches[0] : { or: debateRelationBranches },
  };
}

export type RankedClaimRecordEntity = ExploreCardEntity & {
  /** Spaces where this entity satisfied the complete record relation predicate. */
  matchingSpaceIds: string[];
  rankingScore: number | null;
  updatedAt: string;
};

export type ClaimRecordConnectionPage = {
  entities: RankedClaimRecordEntity[];
  endCursor: string | null;
  hasNextPage: boolean;
};

export type ClaimRecordClaimsPage = {
  topicClaims: ClaimRecordConnectionPage;
  extractedClaims: ClaimRecordConnectionPage;
};

type ConnectionShape = {
  nodes?: unknown[] | null;
  pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
} | null;

const EMPTY_CONNECTION_PAGE: ClaimRecordConnectionPage = {
  entities: [],
  endCursor: null,
  hasNextPage: false,
};

function decodeConnection(connection: ConnectionShape): ClaimRecordConnectionPage {
  if (!connection) return EMPTY_CONNECTION_PAGE;

  const entities: RankedClaimRecordEntity[] = [];
  for (const node of connection.nodes ?? []) {
    const decoded = decodeExploreCardEntity(node);
    if (!decoded || !node || typeof node !== 'object') continue;

    const raw = node as {
      rankingScore?: string | number | null;
      updatedAt?: string | null;
      matchingRelations?: Array<{ spaceId?: string | null }> | null;
    };
    const parsedScore = raw.rankingScore == null ? null : Number(raw.rankingScore);
    entities.push({
      ...decoded,
      matchingSpaceIds: [
        ...new Map(
          (raw.matchingRelations ?? [])
            .map(relation => relation.spaceId)
            .filter((spaceId): spaceId is string => typeof spaceId === 'string' && spaceId.length > 0)
            .map(spaceId => [normId(spaceId), spaceId])
        ).values(),
      ],
      rankingScore: parsedScore !== null && Number.isFinite(parsedScore) ? parsedScore : null,
      updatedAt: raw.updatedAt ?? '',
    });
  }

  return {
    entities,
    endCursor: connection.pageInfo?.endCursor ?? null,
    hasNextPage: connection.pageInfo?.hasNextPage ?? false,
  };
}

export function decodeClaimRecordClaims(data: {
  topicClaims?: ConnectionShape;
  extractedClaims?: ConnectionShape;
  relatedClaimsTop?: ConnectionShape;
}): ClaimRecordClaimsPage {
  return {
    topicClaims: decodeConnection(data.topicClaims ?? data.relatedClaimsTop ?? null),
    extractedClaims: decodeConnection(data.extractedClaims ?? null),
  };
}

export function decodeClaimRecordDebates(data: {
  debates?: ConnectionShape;
  debatesTop?: ConnectionShape;
}): ClaimRecordConnectionPage {
  return decodeConnection(data.debates ?? data.debatesTop ?? null);
}

type CountConnection = {
  aggregates?: { distinctCount?: { fromEntityId?: string | number | null } | null } | null;
} | null;

function decodeCount(connection: CountConnection): number {
  const raw = connection?.aggregates?.distinctCount?.fromEntityId;
  const count = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid claim record count response');
  return count;
}

export function decodeClaimRecordCounts(data: {
  claims?: CountConnection;
  debates?: CountConnection;
}): { claims: number; debates: number } {
  return { claims: decodeCount(data.claims ?? null), debates: decodeCount(data.debates ?? null) };
}

function updatedAtMillis(value: string | null | undefined): number {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Merge independently paged relation branches into one deterministic record order. */
export function mergeSortedRecordEntities<
  T extends {
    id: string;
    rankingScore: number | null;
    createdAt?: string | null;
    updatedAt: string | null;
  },
>(
  sort: ClaimRecordSort,
  ...groups: readonly T[][]
): T[] {
  const byId = new Map<string, T>();
  for (const entity of groups.flat()) {
    const key = normId(entity.id);
    if (!byId.has(key)) byId.set(key, entity);
  }

  const entities = [...byId.values()];
  // Top connections already own the score aggregation, tie-breaking, and cursor order. Re-sorting
  // their nodes from entity values is both redundant and wrong for entities scored in many spaces.
  if (sort === 'top') return entities;

  return entities.sort((a, b) => {
    if (sort === 'new') {
      const created = updatedAtMillis(b.createdAt) - updatedAtMillis(a.createdAt);
      return created || normId(a.id).localeCompare(normId(b.id));
    }

    const left = a.rankingScore;
    const right = b.rankingScore;
    if (left !== right) {
      if (left === null) return 1;
      if (right === null) return -1;
      return right - left;
    }

    const updated = updatedAtMillis(b.updatedAt) - updatedAtMillis(a.updatedAt);
    return updated || normId(a.id).localeCompare(normId(b.id));
  });
}

export type ClaimRecordClaimsPageParam = {
  topicAfter: string | null;
  extractedAfter: string | null;
  skipTopicClaims: boolean;
  skipExtractedClaims: boolean;
};

export function firstClaimRecordClaimsPageParam(hasTopics: boolean): ClaimRecordClaimsPageParam {
  return {
    topicAfter: null,
    extractedAfter: null,
    skipTopicClaims: !hasTopics,
    skipExtractedClaims: false,
  };
}

export function nextClaimRecordClaimsPageParam(
  page: ClaimRecordClaimsPage
): ClaimRecordClaimsPageParam | undefined {
  const topicHasNext = page.topicClaims.hasNextPage && page.topicClaims.endCursor !== null;
  const extractedHasNext = page.extractedClaims.hasNextPage && page.extractedClaims.endCursor !== null;
  if (!topicHasNext && !extractedHasNext) return undefined;

  return {
    topicAfter: topicHasNext ? page.topicClaims.endCursor : null,
    extractedAfter: extractedHasNext ? page.extractedClaims.endCursor : null,
    skipTopicClaims: !topicHasNext,
    skipExtractedClaims: !extractedHasNext,
  };
}

export async function fetchClaimRecordClaimsPage({
  filters,
  spaceIds,
  sort,
  pageParam,
  signal,
}: {
  filters: ClaimRecordFilters;
  spaceIds: string[];
  sort: ClaimRecordSort;
  pageParam: ClaimRecordClaimsPageParam;
  signal?: AbortSignal;
}): Promise<ClaimRecordClaimsPage> {
  const isTop = sort === 'top';
  return Effect.runPromise(
    graphql({
      query: claimRecordClaimsDocument,
      decoder: decodeClaimRecordClaims,
      variables: {
        claimTypeId: CLAIM_TYPE_ID,
        spaceIds,
        spaceIdsForLists: spaceIds,
        topicFilter: filters.topicClaims,
        extractedFilter: filters.extractedClaims,
        relatedFilter: filters.relatedClaims,
        matchingFilter: filters.claimRelations,
        orderBy: claimRecordOrderBy(sort),
        scorePropertyId: SCORE_SYSTEM_PROPERTY,
        first: CLAIM_RECORD_PAGE_SIZE,
        topicAfter: pageParam.topicAfter,
        extractedAfter: pageParam.extractedAfter,
        skipTopicClaims: pageParam.skipTopicClaims || isTop,
        skipExtractedClaims: pageParam.skipExtractedClaims || isTop,
        fetchRelatedClaimsTop: isTop,
      },
      signal,
    })
  );
}

export async function fetchClaimRecordDebatesPage({
  filters,
  spaceIds,
  sort,
  after,
  signal,
}: {
  filters: ClaimRecordFilters;
  spaceIds: string[];
  sort: ClaimRecordSort;
  after: string | null;
  signal?: AbortSignal;
}): Promise<ClaimRecordConnectionPage> {
  return Effect.runPromise(
    graphql({
      query: claimRecordDebatesDocument,
      decoder: decodeClaimRecordDebates,
      variables: {
        debateTypeId: DEBATE_TYPE_ID,
        spaceIds,
        spaceIdsForLists: spaceIds,
        filter: filters.debates,
        matchingFilter: filters.debateRelations,
        orderBy: claimRecordOrderBy(sort),
        scorePropertyId: SCORE_SYSTEM_PROPERTY,
        first: CLAIM_RECORD_PAGE_SIZE,
        after,
        isTop: sort === 'top',
      },
      signal,
    })
  );
}

export async function fetchClaimRecordCounts({
  filters,
  signal,
}: {
  filters: ClaimRecordFilters;
  signal?: AbortSignal;
}): Promise<{ claims: number; debates: number }> {
  return Effect.runPromise(
    graphql({
      query: claimRecordCountsDocument,
      decoder: decodeClaimRecordCounts,
      variables: { claimFilter: filters.claimRelations, debateFilter: filters.debateRelations },
      signal,
    })
  );
}
