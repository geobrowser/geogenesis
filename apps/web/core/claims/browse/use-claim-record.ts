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
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';
import { normId } from '~/core/utils/norm-id';

import { useClaimExploreRows } from './use-claim-explore-rows';

/**
 * One bounded window is enough for the summary and covers the full record for ordinary claims.
 * The GEO-2975 claims feed will own paging when it lands; keeping the scope in this hook means that
 * feed can replace the transport without changing what this page considers related.
 */
const CLAIM_RECORD_LIMIT = 100;

/** Stable empty rows keep the query result from changing identity while it is disabled. */
const NO_ROWS: ExploreFeedRow[] = [];

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
    if (!entity.name || ID.equals(entity.id, claimId)) continue;
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
 */
export function useClaimRecord({
  claimId,
  spaceId,
  topicIds,
}: {
  claimId: string;
  spaceId: string;
  topicIds: string[];
}) {
  const related = useQueryEntities({
    where: relatedClaimsWhere({ spaceId, topicIds, requireTagId: DEBATE_TAG_ID }),
    first: CLAIM_RECORD_LIMIT,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: topicIds.length > 0,
    deferUntilFetched: true,
    prefetchNextPage: false,
  });

  const topicRelatedIds = React.useMemo(() => relatedClaimIds(claimId, related.entities), [claimId, related.entities]);

  const claimDebates = useQueryEntities({
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
    first: CLAIM_RECORD_LIMIT,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: true,
    deferUntilFetched: true,
    prefetchNextPage: false,
  });

  const claimDebateIds = React.useMemo(() => entityIds(claimDebates.entities), [claimDebates.entities]);
  const extractedClaims = useQueryEntities({
    where: claimsExtractedFromDebatesWhere(spaceId, claimDebateIds),
    first: CLAIM_RECORD_LIMIT,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: claimDebateIds.length > 0,
    deferUntilFetched: true,
    prefetchNextPage: false,
  });

  const relatedIds = React.useMemo(
    () => relatedClaimIds(claimId, related.entities, extractedClaims.entities),
    [claimId, extractedClaims.entities, related.entities]
  );

  const relatedDebates = useQueryEntities({
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
    first: CLAIM_RECORD_LIMIT,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: topicRelatedIds.length > 0,
    deferUntilFetched: true,
    prefetchNextPage: false,
  });

  const debateIds = React.useMemo(
    () => entityIds([...claimDebates.entities, ...relatedDebates.entities]),
    [claimDebates.entities, relatedDebates.entities]
  );
  const claimsReady = !related.isLoading && !claimDebates.isLoading && !extractedClaims.isLoading;
  const debatesReady = !related.isLoading && !claimDebates.isLoading && !relatedDebates.isLoading;
  const claimsRowsQuery = useClaimExploreRows(relatedIds, spaceId, claimsReady);
  const debatesRowsQuery = useClaimExploreRows(debateIds, spaceId, debatesReady);

  const claimScores = useEntityScores({ ids: relatedIds });
  const debateScores = useEntityScores({ ids: debateIds });

  const claimRanks = React.useMemo(
    () => ({ scores: claimScores.scores, rankings: claimScores.rankings }),
    [claimScores.rankings, claimScores.scores]
  );
  const debateRanks = React.useMemo(
    () => ({ scores: debateScores.scores, rankings: debateScores.rankings }),
    [debateScores.rankings, debateScores.scores]
  );

  const claimRows = React.useMemo(
    () => sortRows(claimsRowsQuery.data ?? NO_ROWS, 'best', claimRanks),
    [claimRanks, claimsRowsQuery.data]
  );
  const debateRows = React.useMemo(
    () => sortRows(debatesRowsQuery.data ?? NO_ROWS, 'best', debateRanks),
    [debateRanks, debatesRowsQuery.data]
  );

  return {
    relatedClaimIds: relatedIds,
    claimRows,
    debateRows,
    claimsTotal: relatedIds.length,
    debatesTotal: debateIds.length,
    claimsLoading: !claimsReady || claimsRowsQuery.isLoading || (claimScores.isLoading && !claimScores.isError),
    debatesLoading: !debatesReady || debatesRowsQuery.isLoading || (debateScores.isLoading && !debateScores.isError),
    claimsError: Boolean(related.error ?? claimDebates.error ?? extractedClaims.error ?? claimsRowsQuery.error),
    debatesError: Boolean(related.error ?? claimDebates.error ?? relatedDebates.error ?? debatesRowsQuery.error),
  };
}
