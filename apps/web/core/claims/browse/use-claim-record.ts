'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { relatedClaimsWhere } from '~/core/claims/related-claims';
import { DEBATE_CLAIMS_PROPERTY_ID, DEBATE_TAG_ID, DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedRow } from '~/core/explore/explore-card-item';
import { EntitiesOrderBy } from '~/core/gql/graphql';
import { ID } from '~/core/id';
import { fetchExploreRowsByIds } from '~/core/profile/explore-rows-by-ids';
import { sortRows } from '~/core/profile/record-client-filter';
import { useEntityScores } from '~/core/profile/use-entity-scores';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Entity } from '~/core/types';

/**
 * One bounded window is enough for the summary and covers the full record for ordinary claims.
 * The GEO-2975 claims feed will own paging when it lands; keeping the scope in this hook means that
 * feed can replace the transport without changing what this page considers related.
 */
const CLAIM_RECORD_LIMIT = 100;

/** Stable empty rows keep the query result from changing identity while it is disabled. */
const NO_ROWS: ExploreFeedRow[] = [];

/**
 * The current claim followed by its drawable neighbours.
 *
 * The source matches its own `relatedClaimsWhere` clause, so it must be removed before the related
 * count is observed. This helper owns that ordering and is exported for the regression test: doing
 * the subtraction after counting is the GEO-2758 bug the ticket explicitly calls out.
 */
export function claimRecordIds(claimId: string, related: Pick<Entity, 'id' | 'name'>[]): string[] {
  return [
    claimId,
    ...related.filter(entity => Boolean(entity.name) && !ID.equals(entity.id, claimId)).map(entity => entity.id),
  ];
}

function useExploreRows(ids: string[], spaceId: string, enabled: boolean) {
  const normalizedIds = React.useMemo(() => ids.map(ID.uuidToHex), [ids]);

  return useQuery({
    queryKey: ['claim-record', 'explore-rows', spaceId, normalizedIds],
    queryFn: ({ signal }) => {
      const preferredSpaces = new Map(ids.map(id => [ID.uuidToHex(id), [spaceId]]));
      return fetchExploreRowsByIds(ids, signal, preferredSpaces);
    },
    enabled: enabled && ids.length > 0,
    staleTime: 30_000,
  });
}

/**
 * The Debates and Claims record shared by the claim Overview summary and its two full tabs.
 *
 * Related claims use the canonical clause and require the debate tag. Debates then point at any
 * claim in that exact scope, while both row sets are hydrated through the explore card projection
 * so the summary and tabs render the same cards as the rest of the product.
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

  const claimIds = React.useMemo(() => claimRecordIds(claimId, related.entities), [claimId, related.entities]);

  const debates = useQueryEntities({
    where: {
      types: [{ id: { equals: DEBATE_TYPE_ID } }],
      spaces: [{ equals: spaceId }],
      relations: [
        {
          typeOf: { id: { equals: DEBATE_CLAIMS_PROPERTY_ID } },
          toEntity: { id: { in: claimIds } },
        },
      ],
    },
    first: CLAIM_RECORD_LIMIT,
    orderBy: [EntitiesOrderBy.UpdatedAtDesc],
    enabled: claimIds.length > 0,
    deferUntilFetched: true,
    prefetchNextPage: false,
  });

  const debateIds = React.useMemo(() => debates.entities.map(entity => entity.id), [debates.entities]);
  const claimsRowsQuery = useExploreRows(claimIds, spaceId, !related.isLoading);
  const debatesRowsQuery = useExploreRows(debateIds, spaceId, !debates.isLoading);

  const claimScores = useEntityScores({ ids: claimIds });
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
    claimIds,
    claimRows,
    debateRows,
    claimsTotal: claimIds.length,
    debatesTotal: debateIds.length,
    claimsLoading: related.isLoading || claimsRowsQuery.isLoading || (claimScores.isLoading && !claimScores.isError),
    debatesLoading:
      related.isLoading ||
      debates.isLoading ||
      debatesRowsQuery.isLoading ||
      (debateScores.isLoading && !debateScores.isError),
    claimsError: Boolean(related.error ?? claimsRowsQuery.error),
    debatesError: Boolean(related.error ?? debates.error ?? debatesRowsQuery.error),
  };
}
