'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { useSpace } from '~/core/hooks/use-space';

import { fetchRankingPendingProposalData } from './fetch-ranking-pending-proposals';
import {
  EMPTY_RANKING_PENDING_PROPOSAL_DATA,
  type RankingPendingProposalData,
  type RankingRelationConstraint,
} from './ranking-pending-proposal-entries';

type UseRankingPendingProposalsOptions = {
  targetSpaceId: string | null;
  proposedBy: string | null;
  relationConstraints: RankingRelationConstraint[];
};

export function useRankingPendingProposals({
  targetSpaceId,
  proposedBy,
  relationConstraints,
}: UseRankingPendingProposalsOptions) {
  const { space, isLoading: isLoadingSpace } = useSpace(targetSpaceId ?? undefined);

  const isDaoTarget = Boolean(targetSpaceId && space?.type === 'DAO');
  const enabled = isDaoTarget && Boolean(proposedBy);

  const constraintsKey = React.useMemo(
    () =>
      relationConstraints
        .map(constraint => `${constraint.typeId}:${constraint.toEntityId}`)
        .sort()
        .join('|'),
    [relationConstraints]
  );

  const { data } = useQuery({
    queryKey: ['ranking-pending-proposal-data', targetSpaceId, proposedBy, constraintsKey],
    enabled,
    staleTime: 30_000,
    queryFn: ({ signal }) => fetchRankingPendingProposalData(targetSpaceId!, proposedBy!, relationConstraints, signal),
  });

  const pendingData: RankingPendingProposalData = data ?? EMPTY_RANKING_PENDING_PROPOSAL_DATA;

  return React.useMemo(
    () => ({
      pendingEntityIds: pendingData.pendingEntityIds,
      pendingEntriesByEntityId: pendingData.entriesByEntityId,
      isLoadingPending: (enabled && !data) || (Boolean(targetSpaceId) && isLoadingSpace),
    }),
    [pendingData, enabled, data, targetSpaceId, isLoadingSpace]
  );
}
