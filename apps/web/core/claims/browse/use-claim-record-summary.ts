'use client';

import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { useQuery } from '@tanstack/react-query';

import { Effect } from 'effect';
import { parse } from 'graphql';

import { CLAIM_TYPE_ID, TOPICS_PROPERTY_ID } from '~/core/claims/ontology';
import { TAG_PROPERTY_ID } from '~/core/constants';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TAG_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import { type ExploreCardEntity, type ExploreFeedRow, decodeExploreCardEntity } from '~/core/explore/explore-card-item';
import { exploreCardNodeFields, exploreCardPropertyFragment } from '~/core/explore/explore-card-selection';
import type { EntityFilter } from '~/core/gql/graphql';
import { graphql } from '~/core/io/graphql-client';
import { ACTIVITY_GALLERY_CARD_LIMIT } from '~/core/profile/activity-gallery';
import { buildExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import { normId } from '~/core/utils/norm-id';

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
const SUMMARY_ENTITY_FRAGMENT = 'ClaimRecordSummaryEntity';
const SUMMARY_PROPERTY_FRAGMENT = 'ClaimRecordSummaryProperty';

const CLAIM_RECORD_SUMMARY_SOURCE = /* GraphQL */ `
  ${exploreCardPropertyFragment(SUMMARY_PROPERTY_FRAGMENT)}

  fragment ${SUMMARY_ENTITY_FRAGMENT} on Entity {
    ${exploreCardNodeFields(SUMMARY_PROPERTY_FRAGMENT)}
  }

  query ClaimRecordSummary(
    $relatedClaimsFilter: EntityFilter!
    $debatesFilter: EntityFilter!
    $first: Int!
    $spaceIdsForLists: [UUID!]!
    $hydrateRows: Boolean!
  ) {
    relatedClaims: entitiesConnection(first: $first, orderBy: [RANKING_SCORE_DESC], filter: $relatedClaimsFilter) {
      totalCount
      nodes {
        id
        ...${SUMMARY_ENTITY_FRAGMENT} @include(if: $hydrateRows)
      }
    }

    debates: entitiesConnection(first: $first, orderBy: [RANKING_SCORE_DESC], filter: $debatesFilter) {
      totalCount
      nodes {
        id
        ...${SUMMARY_ENTITY_FRAGMENT} @include(if: $hydrateRows)
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
  claimRows: ExploreFeedRow[];
  debateRows: ExploreFeedRow[];
  claimsTotal: number;
  debatesTotal: number;
};

function decodeConnection(
  connection: SummaryConnection,
  label: string,
  spaceId: string
): { ids: string[]; rows: ExploreFeedRow[]; total: number } {
  if (!connection || !Number.isSafeInteger(connection.totalCount) || connection.totalCount! < 0) {
    throw new Error(`Claim record summary returned an invalid ${label} count`);
  }

  const ids = new Map<string, string>();
  const entities: ExploreCardEntity[] = [];
  for (const node of connection.nodes ?? []) {
    if (!node?.id) continue;
    ids.set(normId(node.id), node.id);
    const entity = decodeExploreCardEntity(node);
    if (entity) entities.push(entity);
  }

  const orderedIds = [...ids.values()];
  const preferredSpaces = new Map(orderedIds.map(id => [normId(id), [spaceId]]));

  return {
    ids: orderedIds,
    rows: buildExploreRowsByIds(orderedIds, entities, preferredSpaces),
    total: connection.totalCount!,
  };
}

export function decodeClaimRecordSummary(response: SummaryResponse, spaceId = ''): ClaimRecordSummary {
  const claims = decodeConnection(response.relatedClaims ?? null, 'related claims', spaceId);
  const debates = decodeConnection(response.debates ?? null, 'debates', spaceId);

  return {
    relatedClaimIds: claims.ids,
    debateIds: debates.ids,
    claimRows: claims.rows,
    debateRows: debates.rows,
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
    // Counts-only and card-bearing results have different shapes. Keeping them under separate
    // keys prevents a freshly cached full-tab count from making Overview accept an empty row set.
    queryKey: [
      'claim',
      'record-summary',
      normId(spaceId),
      normId(claimId),
      normalizedTopicIds,
      hydrateRows ? 'with-rows' : 'counts-only',
    ],
    enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      Effect.runPromise(
        graphql({
          query: claimRecordSummaryDocument,
          decoder: response => decodeClaimRecordSummary(response, spaceId),
          variables: {
            ...filters,
            first: ACTIVITY_GALLERY_CARD_LIMIT,
            spaceIdsForLists: [spaceId],
            hydrateRows,
          },
          signal,
        })
      ),
  });

  const relatedClaimIds = summary.data?.relatedClaimIds ?? NO_IDS;

  return {
    relatedClaimIds,
    claimRows: hydrateRows ? (summary.data?.claimRows ?? NO_ROWS) : NO_ROWS,
    debateRows: hydrateRows ? (summary.data?.debateRows ?? NO_ROWS) : NO_ROWS,
    claimsTotal: summary.data?.claimsTotal ?? 0,
    debatesTotal: summary.data?.debatesTotal ?? 0,
    claimsCountUnavailable: summary.isError,
    debatesCountUnavailable: summary.isError,
    claimsLoading: enabled && summary.isLoading,
    debatesLoading: enabled && summary.isLoading,
    claimsError: summary.isError,
    debatesError: summary.isError,
    claimsFetchingNextPage: false,
    debatesFetchingNextPage: false,
    claimsHasNextPage: false,
    debatesHasNextPage: false,
    fetchNextClaimsPage: () => void summary.refetch(),
    fetchNextDebatesPage: () => void summary.refetch(),
  };
}
