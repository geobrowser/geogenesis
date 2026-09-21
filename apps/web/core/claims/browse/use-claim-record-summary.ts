'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TAG_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import type { EntityFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { ACTIVITY_GALLERY_CARD_LIMIT } from '~/core/profile/activity-gallery';
import { normId } from '~/core/utils/norm-id';

import { useClaimExploreRows } from './use-claim-explore-rows';

/**
 * Exact record totals and one globally Best-ranked page for the Overview.
 *
 * The exhaustive client path is still needed after someone opens a full record tab: it supports
 * progressive hydration without trusting a filtered ranking cursor. Overview needs much less. A
 * single entity connection can count the distinct union and order its first bounded page by the
 * same ranking-score column Best uses, avoiding hundreds of cursor and score requests just to draw
 * six Activity cards.
 *
 * Related claims are one entity-level OR, so a claim reached through both a shared topic and a
 * direct debate source is counted once by the connection. The debate branch uses the equivalent
 * OR at the far end of its Claims relation, which likewise dedupes debates arguing both the current
 * claim and a related one.
 */
const CLAIM_RECORD_SUMMARY_SOURCE = /* GraphQL */ `
  query ClaimRecordSummary($relatedClaimsFilter: EntityFilter!, $debatesFilter: EntityFilter!, $first: Int!) {
    relatedClaims: entitiesConnection(first: $first, orderBy: [RANKING_SCORE_DESC], filter: $relatedClaimsFilter) {
      totalCount
      nodes {
        id
      }
    }

    debates: entitiesConnection(first: $first, orderBy: [RANKING_SCORE_DESC], filter: $debatesFilter) {
      totalCount
      nodes {
        id
      }
    }
  }
`;

export const claimRecordSummaryDocument = parse(CLAIM_RECORD_SUMMARY_SOURCE) as TypedDocumentNode<any, any>;

export function claimRecordSummaryFilters({
  claimId,
  spaceId,
  topicIds,
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
}): { relatedClaimsFilter: EntityFilter; debatesFilter: EntityFilter } {
  const topicRelations: EntityFilter[] =
    topicIds.length === 0
      ? []
      : [
          {
            relations: {
              some: {
                typeId: { is: TOPICS_PROPERTY_ID },
                toEntityId: { in: topicIds },
                spaceId: { is: spaceId },
              },
            },
          },
          {
            relations: {
              some: {
                typeId: { is: TAG_PROPERTY_ID },
                toEntityId: { is: DEBATE_TAG_ID },
                spaceId: { is: spaceId },
              },
            },
          },
        ];

  const directDebateFilter: EntityFilter = {
    typeIds: { overlaps: [DEBATE_TYPE_ID] },
    spaceIds: { overlaps: [spaceId] },
    relations: {
      some: {
        typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
        toEntityId: { is: claimId },
        spaceId: { is: spaceId },
      },
    },
  };

  const relatedClaimTarget: EntityFilter = {
    and: [{ typeIds: { overlaps: [CLAIM_TYPE_ID] } }, { spaceIds: { overlaps: [spaceId] } }, ...topicRelations],
  };

  return {
    relatedClaimsFilter: {
      id: { isNot: claimId },
      typeIds: { overlaps: [CLAIM_TYPE_ID] },
      spaceIds: { overlaps: [spaceId] },
      or: [
        ...(topicRelations.length > 0 ? [{ and: topicRelations }] : []),
        {
          relations: {
            some: {
              typeId: { is: SOURCES_PROPERTY_ID },
              spaceId: { is: spaceId },
              toEntity: directDebateFilter,
            },
          },
        },
      ],
    },
    debatesFilter: {
      typeIds: { overlaps: [DEBATE_TYPE_ID] },
      spaceIds: { overlaps: [spaceId] },
      relations: {
        some: {
          typeId: { is: DEBATE_CLAIMS_PROPERTY_ID },
          spaceId: { is: spaceId },
          toEntity: {
            or: [{ id: { is: claimId } }, ...(topicRelations.length > 0 ? [relatedClaimTarget] : [])],
          },
        },
      },
    },
  };
}

type SummaryConnection = {
  totalCount?: number | null;
  nodes?: ({ id?: string | null } | null)[] | null;
} | null;

type SummaryResponse = {
  relatedClaims?: SummaryConnection;
  debates?: SummaryConnection;
};

export type ClaimRecordSummary = {
  relatedClaimIds: string[];
  debateIds: string[];
  claimsTotal: number;
  debatesTotal: number;
};

function decodeConnection(connection: SummaryConnection, label: string): { ids: string[]; total: number } {
  if (!connection || !Number.isSafeInteger(connection.totalCount) || connection.totalCount! < 0) {
    throw new Error(`Claim record summary returned an invalid ${label} count`);
  }

  const ids = new Map<string, string>();
  for (const node of connection.nodes ?? []) {
    if (node?.id) ids.set(normId(node.id), node.id);
  }

  return { ids: [...ids.values()], total: connection.totalCount! };
}

export function decodeClaimRecordSummary(response: SummaryResponse): ClaimRecordSummary {
  const claims = decodeConnection(response.relatedClaims ?? null, 'related claims');
  const debates = decodeConnection(response.debates ?? null, 'debates');

  return {
    relatedClaimIds: claims.ids,
    debateIds: debates.ids,
    claimsTotal: claims.total,
    debatesTotal: debates.total,
  };
}

const NO_IDS: string[] = [];
const NO_ROWS: ExploreFeedRow[] = [];

export function useClaimRecordSummary({
  claimId,
  spaceId,
  topicIds,
  enabled,
  hydrateRows = true,
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
  enabled: boolean;
  /** Counts stay available on full tabs without hydrating either hidden summary feed. */
  hydrateRows?: boolean;
}) {
  const normalizedTopicIds = topicIds.map(normId).sort();
  const filters = claimRecordSummaryFilters({ claimId, spaceId, topicIds });
  const summary = useQuery({
    queryKey: ['claim', 'record-summary', normId(spaceId), normId(claimId), normalizedTopicIds],
    enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: claimRecordSummaryDocument,
          decoder: decodeClaimRecordSummary,
          variables: {
            ...filters,
            first: ACTIVITY_GALLERY_CARD_LIMIT,
          },
          signal,
        })
      ),
  });

  const relatedClaimIds = summary.data?.relatedClaimIds ?? NO_IDS;
  const debateIds = summary.data?.debateIds ?? NO_IDS;
  const canHydrate = enabled && hydrateRows && summary.isSuccess;
  const claimRows = useClaimExploreRows(relatedClaimIds, spaceId, canHydrate);
  const debateRows = useClaimExploreRows(debateIds, spaceId, canHydrate);
  const retryClaims = () => void (summary.isError ? summary.refetch() : claimRows.refetch());
  const retryDebates = () => void (summary.isError ? summary.refetch() : debateRows.refetch());

  return {
    relatedClaimIds,
    claimRows: canHydrate ? (claimRows.data ?? NO_ROWS) : NO_ROWS,
    debateRows: canHydrate ? (debateRows.data ?? NO_ROWS) : NO_ROWS,
    claimsTotal: summary.data?.claimsTotal ?? 0,
    debatesTotal: summary.data?.debatesTotal ?? 0,
    claimsCountUnavailable: summary.isError,
    debatesCountUnavailable: summary.isError,
    claimsLoading: enabled && (summary.isLoading || (canHydrate && claimRows.isLoading)),
    debatesLoading: enabled && (summary.isLoading || (canHydrate && debateRows.isLoading)),
    claimsError: summary.isError || (canHydrate && claimRows.isError),
    debatesError: summary.isError || (canHydrate && debateRows.isError),
    claimsFetchingNextPage: false,
    debatesFetchingNextPage: false,
    claimsHasNextPage: false,
    debatesHasNextPage: false,
    fetchNextClaimsPage: retryClaims,
    fetchNextDebatesPage: retryDebates,
  };
}
