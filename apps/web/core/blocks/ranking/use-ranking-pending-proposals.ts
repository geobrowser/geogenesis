'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { fetchRankingPendingEntities } from './fetch-ranking-pending-proposals';
import {
  EMPTY_RANKING_PENDING_PROPOSAL_DATA,
  type RankingPendingProposalData,
} from './ranking-pending-proposal-entries';

type UseRankingPendingEntitiesOptions = {
  targetSpaceId: string | null;
  unresolvedEntityIds: string[];
  proposerSpaceIds: string[];
};

export function useRankingPendingEntities({
  targetSpaceId,
  unresolvedEntityIds,
  proposerSpaceIds,
}: UseRankingPendingEntitiesOptions) {
  const idsKey = React.useMemo(
    () => [...new Set(unresolvedEntityIds.filter(Boolean))].sort().join('|'),
    [unresolvedEntityIds]
  );

  const proposersKey = React.useMemo(
    () => [...new Set(proposerSpaceIds.filter(Boolean))].sort().join('|'),
    [proposerSpaceIds]
  );

  const enabled = Boolean(targetSpaceId) && idsKey.length > 0 && proposersKey.length > 0;

  const { data } = useQuery({
    queryKey: ['ranking-pending-entities', targetSpaceId, idsKey, proposersKey],
    enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      fetchRankingPendingEntities({
        spaceId: targetSpaceId!,
        unresolvedEntityIds: idsKey ? idsKey.split('|') : [],
        proposerSpaceIds: proposersKey ? proposersKey.split('|') : [],
        signal,
      }),
  });

  const pendingData: RankingPendingProposalData = data ?? EMPTY_RANKING_PENDING_PROPOSAL_DATA;

  return React.useMemo(
    () => ({
      pendingEntityIds: pendingData.pendingEntityIds,
      pendingEntriesByEntityId: pendingData.entriesByEntityId,
    }),
    [pendingData]
  );
}
