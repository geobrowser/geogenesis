'use client';

import * as React from 'react';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { relatedClaimsWhere } from '~/core/claims/related-claims';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TAG_ID, DEBATE_TYPE_ID, SOURCES_PROPERTY_ID } from '~/core/debates/ontology';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { sortRows } from '~/core/profile/record-client-filter';
import { useEntityScores } from '~/core/profile/use-entity-scores';
import type { WhereCondition } from '~/core/sync/experimental_query-layer';
import { useQueryAllEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { CLAIM_RECORD_PAGE_SIZE, useClaimExploreRows } from './use-claim-explore-rows';
import { useClaimRecordSummary } from './use-claim-record-summary';

export { CLAIM_RECORD_PAGE_SIZE } from './use-claim-explore-rows';

/** Stable empty rows keep the query result from changing identity while it is disabled. */
const NO_ROWS: ExploreFeedRow[] = [];

export type ClaimRecordKind = 'claims' | 'debates';

/** The two full records share discovery queries, but only one branch should fan out at a time. */
export function completeRecordQueryPlan(record: ClaimRecordKind | null) {
  const loadClaims = record === 'claims';
  const loadDebates = record === 'debates';

  return {
    loadClaims,
    loadDebates,
    loadRelatedClaims: loadClaims || loadDebates,
    loadDirectDebates: loadClaims || loadDebates,
    loadExtractedClaims: loadClaims,
    loadRelatedDebates: loadDebates,
  };
}

/**
 * Drawable neighbours from one or more relation paths.
 *
 * The current claim can match its own topic query, and one claim can arrive through both topics and
 * debate extraction. Exclusion and normalized-id deduplication happen here, before counts, scoring,
 * or hydration observe the set.
 */
export function relatedClaimIds(claimId: string, ...groups: Array<Pick<Entity, 'id' | 'name'>[]>): string[] {
  const ids = new Map<string, string>();

  for (const entity of groups.flat()) {
    if (ID.equals(entity.id, claimId)) continue;
    ids.set(normId(entity.id), entity.id);
  }

  return [...ids.values()];
}

/** Claims published from the transcript of one of the claim's direct debates. */
export function claimsExtractedFromDebatesWhere(spaceId: string, debateIds: string[]): WhereCondition {
  return {
    types: [{ id: { equals: CLAIM_TYPE_ID } }],
    spaces: [{ equals: spaceId }],
    relations: [
      {
        typeOf: { id: { equals: SOURCES_PROPERTY_ID } },
        toEntity: { id: { in: debateIds } },
        space: { equals: spaceId },
      },
    ],
  };
}

function entityIds(entities: Pick<Entity, 'id'>[]): string[] {
  return [...new Map(entities.map(entity => [normId(entity.id), entity.id])).values()];
}

/** A fixed Best record must not degrade to its input order when ranking cannot be read. */
export function bestRecordRows<T extends { entityId: string }>(
  rows: readonly T[],
  rankings: ReadonlyMap<string, number>,
  isRankingError: boolean
): T[] {
  return isRankingError ? [] : sortRows(rows, 'best', { rankings });
}

/** Best-ranked ids for the bounded card page, plus whether another page remains. */
export function rankedRecordPage(
  ids: readonly string[],
  rankings: ReadonlyMap<string, number>,
  isRankingError: boolean,
  visibleCount: number
): { ids: string[]; hasNextPage: boolean } {
  const ordered = bestRecordRows(
    ids.map(entityId => ({ entityId })),
    rankings,
    isRankingError
  ).map(row => row.entityId);
  const count = Math.max(CLAIM_RECORD_PAGE_SIZE, visibleCount);

  return { ids: ordered.slice(0, count), hasNextPage: count < ordered.length };
}

function useRankedRecordPage({
  ids,
  spaceId,
  idsReady,
  idsError,
  recordKey,
}: {
  ids: string[];
  spaceId: string;
  idsReady: boolean;
  idsError: boolean;
  recordKey: string;
}) {
  const scores = useEntityScores({ ids, enabled: idsReady && !idsError });
  const [page, setPage] = React.useState({ key: recordKey, visibleCount: CLAIM_RECORD_PAGE_SIZE });
  const visibleCount = page.key === recordKey ? page.visibleCount : CLAIM_RECORD_PAGE_SIZE;
  const visible = React.useMemo(
    () => rankedRecordPage(ids, scores.rankings, scores.isError, visibleCount),
    [ids, scores.isError, scores.rankings, visibleCount]
  );
  const rankingsReady = !scores.isLoading && !scores.isError;
  const canHydrate = idsReady && !idsError && rankingsReady;
  const rowsQuery = useClaimExploreRows(visible.ids, spaceId, canHydrate);
  const rowsError = rowsQuery.isError;
  const refetchRows = rowsQuery.refetch;

  const fetchNextPage = React.useCallback(() => {
    if (rowsError) {
      void refetchRows();
      return;
    }

    setPage(current => ({
      key: recordKey,
      visibleCount:
        (current.key === recordKey ? current.visibleCount : CLAIM_RECORD_PAGE_SIZE) + CLAIM_RECORD_PAGE_SIZE,
    }));
  }, [recordKey, refetchRows, rowsError]);

  return {
    rows: canHydrate && visible.ids.length > 0 ? (rowsQuery.data ?? NO_ROWS) : NO_ROWS,
    isLoading:
      !idsReady ||
      (!idsError && (scores.isLoading || (rowsQuery.isLoading && rowsQuery.data.length === 0 && !rowsQuery.isError))),
    isError: scores.isError || rowsError,
    isFetchingNextPage: canHydrate && rowsQuery.isFetching && rowsQuery.data.length > 0,
    hasNextPage: visible.hasNextPage,
    fetchNextPage,
  };
}

/**
 * The Debates and Related claims record shared by the claim Overview summary and its two full tabs.
 *
 * Related claims combine the canonical topic relation with every claim extracted from a direct
 * debate on this claim. The extracted branch follows the provenance Geo publishes on each claim
 * (`Sources` → Debate), so it includes factual/non-contestable statements as well as candidate
 * motions. Both branches exclude the current claim and are deduped by normalized entity id.
 *
 * The Debates record retains its existing scope: debates directly on this claim plus debates on
 * its topic-related candidate motions. Both row sets are hydrated through the explore card
 * projection so the summary and tabs render the same cards as the rest of the product.
 *
 * Overview reads exact counts and one Best-ranked page from the bounded server summary. The
 * exhaustive cursor and client-score path below stays disabled until a full record tab is opened;
 * completeness is worth paying for there, but not for every reader who only opens the claim.
 */
export function useClaimRecord({
  claimId,
  spaceId,
  topicIds,
  completeRecord = null,
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
  /** Exhaust and client-rank only the record represented by the open full tab. */
  completeRecord?: ClaimRecordKind | null;
}) {
  const plan = completeRecordQueryPlan(completeRecord);
  // Keep the small server summary active for both tab counts, but do not hydrate its hidden rows
  // while a full record owns the surface.
  const summary = useClaimRecordSummary({
    claimId,
    spaceId,
    topicIds,
    enabled: true,
    hydrateRows: completeRecord === null,
  });

  const related = useQueryAllEntities({
    where: relatedClaimsWhere({ spaceId, topicIds, requireTagId: DEBATE_TAG_ID }),
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: plan.loadRelatedClaims && topicIds.length > 0,
  });

  const topicRelatedIds = React.useMemo(() => relatedClaimIds(claimId, related.entities), [claimId, related.entities]);

  const claimDebates = useQueryAllEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [
        {
          typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } },
          toEntity: { id: { equals: claimId } },
          space: { equals: spaceId },
        },
      ],
    },
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: plan.loadDirectDebates,
  });

  const claimDebateIds = React.useMemo(() => entityIds(claimDebates.entities), [claimDebates.entities]);
  const extractedClaims = useQueryAllEntities({
    where: claimsExtractedFromDebatesWhere(spaceId, claimDebateIds),
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: plan.loadExtractedClaims && claimDebateIds.length > 0,
  });

  const relatedIds = React.useMemo(
    () => relatedClaimIds(claimId, related.entities, extractedClaims.entities),
    [claimId, extractedClaims.entities, related.entities]
  );

  const relatedDebates = useQueryAllEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [
        {
          typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } },
          toEntity: { id: { in: topicRelatedIds } },
          space: { equals: spaceId },
        },
      ],
    },
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: plan.loadRelatedDebates && topicRelatedIds.length > 0,
  });

  const debateIds = React.useMemo(
    () => entityIds([...claimDebates.entities, ...relatedDebates.entities]),
    [claimDebates.entities, relatedDebates.entities]
  );
  const claimsReady =
    plan.loadClaims && !related.isLoading && !claimDebates.isLoading && !extractedClaims.isLoading;
  const debatesReady =
    plan.loadDebates && !related.isLoading && !claimDebates.isLoading && !relatedDebates.isLoading;
  const recordKey = `${normId(spaceId)}:${normId(claimId)}`;
  const claimsCountUnavailable = plan.loadClaims && Boolean(related.error ?? claimDebates.error ?? extractedClaims.error);
  const debatesCountUnavailable =
    plan.loadDebates && Boolean(related.error ?? claimDebates.error ?? relatedDebates.error);
  // Candidate ids and scores remain complete so totals and Best order are exact. Only expensive
  // Explore-card hydration and DOM rendering are paged, which bounds work without changing rank.
  const claimsPage = useRankedRecordPage({
    ids: relatedIds,
    spaceId,
    idsReady: claimsReady,
    idsError: claimsCountUnavailable,
    recordKey,
  });
  const debatesPage = useRankedRecordPage({
    ids: debateIds,
    spaceId,
    idsReady: debatesReady,
    idsError: debatesCountUnavailable,
    recordKey,
  });

  return {
    relatedClaimIds: plan.loadClaims ? relatedIds : summary.relatedClaimIds,
    claimRows: plan.loadClaims ? claimsPage.rows : summary.claimRows,
    debateRows: plan.loadDebates ? debatesPage.rows : summary.debateRows,
    claimsTotal: plan.loadClaims ? relatedIds.length : summary.claimsTotal,
    debatesTotal: plan.loadDebates ? debateIds.length : summary.debatesTotal,
    claimsCountUnavailable: plan.loadClaims ? claimsCountUnavailable : summary.claimsCountUnavailable,
    debatesCountUnavailable: plan.loadDebates ? debatesCountUnavailable : summary.debatesCountUnavailable,
    claimsLoading: plan.loadClaims ? claimsPage.isLoading : summary.claimsLoading,
    debatesLoading: plan.loadDebates ? debatesPage.isLoading : summary.debatesLoading,
    claimsError: plan.loadClaims ? claimsCountUnavailable || claimsPage.isError : summary.claimsError,
    debatesError: plan.loadDebates ? debatesCountUnavailable || debatesPage.isError : summary.debatesError,
    claimsFetchingNextPage: plan.loadClaims ? claimsPage.isFetchingNextPage : summary.claimsFetchingNextPage,
    debatesFetchingNextPage: plan.loadDebates ? debatesPage.isFetchingNextPage : summary.debatesFetchingNextPage,
    claimsHasNextPage: plan.loadClaims ? claimsPage.hasNextPage : summary.claimsHasNextPage,
    debatesHasNextPage: plan.loadDebates ? debatesPage.hasNextPage : summary.debatesHasNextPage,
    fetchNextClaimsPage: plan.loadClaims ? claimsPage.fetchNextPage : summary.fetchNextClaimsPage,
    fetchNextDebatesPage: plan.loadDebates ? debatesPage.fetchNextPage : summary.fetchNextDebatesPage,
  };
}
