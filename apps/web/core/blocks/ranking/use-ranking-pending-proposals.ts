'use client';

import { useQuery } from '@tanstack/react-query';
import { useAtomValue } from 'jotai';

import * as React from 'react';

import { rankingPendingPublishedAtAtom } from '~/atoms';

import { fetchRankingPendingEntities } from './fetch-ranking-pending-proposals';
import {
  EMPTY_RANKING_PENDING_PROPOSAL_DATA,
  type RankingPendingProposalData,
} from './ranking-pending-proposal-entries';

// After a "Create new" publish the proposal takes a few seconds to index, so we
// poll briefly to catch it once it surfaces. The window self-terminates and the
// entry drops out naturally once the proposal is no longer PROPOSED.
const PENDING_POLL_WINDOW_MS = 15_000;
const PENDING_POLL_INTERVAL_MS = 2_500;

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

  const publishedAt = useAtomValue(rankingPendingPublishedAtAtom);

  const { data } = useQuery({
    queryKey: ['ranking-pending-entities', targetSpaceId, idsKey, proposersKey],
    enabled,
    staleTime: 30_000,
    // Poll only within the post-publish window; otherwise stay idle.
    refetchInterval: () =>
      publishedAt && Date.now() - publishedAt < PENDING_POLL_WINDOW_MS ? PENDING_POLL_INTERVAL_MS : false,
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
