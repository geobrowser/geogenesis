import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import {
  type ExploreCardEntity,
  decodeExploreCardEntity,
} from '~/core/explore/explore-card-item';
import { exploreCardNodeFields, exploreCardPropertyFragment } from '~/core/explore/explore-card-selection';
import type { EntityFilter, RelationFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { normId } from '~/core/utils/norm-id';

export const CLAIM_RECORD_PAGE_SIZE = 20;

const CLAIM_FRAGMENT = 'ClaimRecordClaimPropertyFragment';
const DEBATE_FRAGMENT = 'ClaimRecordDebatePropertyFragment';

const CLAIMS_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(CLAIM_FRAGMENT)}

  query ClaimRecordClaims(
    $claimTypeId: UUID!
    $spaceId: UUID!
    $spaceIdsForLists: [UUID!]!
    $topicFilter: EntityFilter!
    $extractedFilter: EntityFilter!
    $first: Int!
    $topicAfter: Cursor
    $extractedAfter: Cursor
    $skipTopicClaims: Boolean!
    $skipExtractedClaims: Boolean!
  ) {
    topicClaims: entitiesConnection(
      first: $first
      after: $topicAfter
      typeId: $claimTypeId
      spaceId: $spaceId
      filter: $topicFilter
      orderBy: [RANKING_SCORE_DESC, UPDATED_AT_DESC, ID_ASC]
    ) @skip(if: $skipTopicClaims) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        rankingScore
        updatedAt
        ${exploreCardNodeFields(CLAIM_FRAGMENT)}
      }
    }

    extractedClaims: entitiesConnection(
      first: $first
      after: $extractedAfter
      typeId: $claimTypeId
      spaceId: $spaceId
      filter: $extractedFilter
      orderBy: [RANKING_SCORE_DESC, UPDATED_AT_DESC, ID_ASC]
    ) @skip(if: $skipExtractedClaims) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        rankingScore
        updatedAt
        ${exploreCardNodeFields(CLAIM_FRAGMENT)}
      }
    }
  }
`;

const DEBATES_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(DEBATE_FRAGMENT)}

  query ClaimRecordDebates(
    $debateTypeId: UUID!
    $spaceId: UUID!
    $spaceIdsForLists: [UUID!]!
    $filter: EntityFilter!
    $first: Int!
    $after: Cursor
  ) {
    debates: entitiesConnection(
      first: $first
      after: $after
      typeId: $debateTypeId
      spaceId: $spaceId
      filter: $filter
      orderBy: [RANKING_SCORE_DESC, UPDATED_AT_DESC, ID_ASC]
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        rankingScore
        updatedAt
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

export type ClaimRecordFilters = {
  hasTopics: boolean;
  topicClaims: EntityFilter;
  extractedClaims: EntityFilter;
  debates: EntityFilter;
  claimRelations: RelationFilter;
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
  spaceId,
  topicIds,
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
}): ClaimRecordFilters {
  const claimScope: EntityFilter = {
    id: { isNot: claimId },
    typeIds: { overlaps: [CLAIM_TYPE_ID] },
    spaceIds: { overlaps: [spaceId] },
  };
  const debateScope: EntityFilter = {
    typeIds: { overlaps: [DEBATE_TYPE_ID] },
    spaceIds: { overlaps: [spaceId] },
  };
  const directClaimRelation: RelationFilter = {
    typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
    spaceId: { is: spaceId },
    toEntityId: { is: claimId },
  };
  const directDebate: EntityFilter = {
    ...debateScope,
    relations: { some: directClaimRelation },
  };
  const extractedSourceRelation: RelationFilter = {
    typeId: { is: SOURCES_PROPERTY_ID },
    spaceId: { is: spaceId },
    toEntity: directDebate,
  };
  const topicRelation: RelationFilter = {
    typeId: { is: TOPICS_PROPERTY_ID },
    spaceId: { is: spaceId },
    toEntityId: { in: topicIds },
  };
  const topicClaim: EntityFilter = {
    id: { isNot: claimId },
    relations: { some: topicRelation },
  };
  const extractedClaim: EntityFilter = {
    id: { isNot: claimId },
    relations: { some: extractedSourceRelation },
  };
  const topicClaimTarget: EntityFilter = {
    ...claimScope,
    relations: { some: topicRelation },
  };
  const debateTarget: EntityFilter =
    topicIds.length > 0 ? { or: [{ id: { is: claimId } }, topicClaimTarget] } : { id: { is: claimId } };

  const topicClaimRelation: RelationFilter = {
    ...topicRelation,
    fromEntity: claimScope,
  };
  const extractedClaimRelation: RelationFilter = {
    ...extractedSourceRelation,
    fromEntity: claimScope,
  };

  return {
    hasTopics: topicIds.length > 0,
    topicClaims: topicClaim,
    extractedClaims: extractedClaim,
    debates: {
      relations: {
        some: {
          typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
          spaceId: { is: spaceId },
          toEntity: debateTarget,
        },
      },
    },
    claimRelations: {
      or: topicIds.length > 0 ? [topicClaimRelation, extractedClaimRelation] : [extractedClaimRelation],
    },
    debateRelations: {
      typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
      spaceId: { is: spaceId },
      fromEntity: debateScope,
      toEntity: debateTarget,
    },
  };
}

export type RankedClaimRecordEntity = ExploreCardEntity & {
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

    const raw = node as { rankingScore?: string | number | null; updatedAt?: string | null };
    const parsedScore = raw.rankingScore == null ? null : Number(raw.rankingScore);
    entities.push({
      ...decoded,
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
}): ClaimRecordClaimsPage {
  return {
    topicClaims: decodeConnection(data.topicClaims ?? null),
    extractedClaims: decodeConnection(data.extractedClaims ?? null),
  };
}

export function decodeClaimRecordDebates(data: { debates?: ConnectionShape }): ClaimRecordConnectionPage {
  return decodeConnection(data.debates ?? null);
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

/** Merge server-ranked branches into one deterministic Best order, once per normalized entity id. */
export function mergeRankedRecordEntities<T extends { id: string; rankingScore: number | null; updatedAt: string | null }>(
  ...groups: readonly T[][]
): T[] {
  const byId = new Map<string, T>();
  for (const entity of groups.flat()) {
    const key = normId(entity.id);
    if (!byId.has(key)) byId.set(key, entity);
  }

  return [...byId.values()].sort((a, b) => {
    if (a.rankingScore !== b.rankingScore) {
      if (a.rankingScore === null) return 1;
      if (b.rankingScore === null) return -1;
      return b.rankingScore - a.rankingScore;
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
  spaceId,
  pageParam,
  signal,
}: {
  filters: ClaimRecordFilters;
  spaceId: string;
  pageParam: ClaimRecordClaimsPageParam;
  signal?: AbortSignal;
}): Promise<ClaimRecordClaimsPage> {
  return Effect.runPromise(
    graphql({
      query: claimRecordClaimsDocument,
      decoder: decodeClaimRecordClaims,
      variables: {
        claimTypeId: CLAIM_TYPE_ID,
        spaceId,
        spaceIdsForLists: [spaceId],
        topicFilter: filters.topicClaims,
        extractedFilter: filters.extractedClaims,
        first: CLAIM_RECORD_PAGE_SIZE,
        ...pageParam,
      },
      signal,
    })
  );
}

export async function fetchClaimRecordDebatesPage({
  filters,
  spaceId,
  after,
  signal,
}: {
  filters: ClaimRecordFilters;
  spaceId: string;
  after: string | null;
  signal?: AbortSignal;
}): Promise<ClaimRecordConnectionPage> {
  return Effect.runPromise(
    graphql({
      query: claimRecordDebatesDocument,
      decoder: decodeClaimRecordDebates,
      variables: {
        debateTypeId: DEBATE_TYPE_ID,
        spaceId,
        spaceIdsForLists: [spaceId],
        filter: filters.debates,
        first: CLAIM_RECORD_PAGE_SIZE,
        after,
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
