'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { type WinnerShare, useWinnerSharesWithStatus } from '~/core/claims/browse/claim-debates';

import { canonicalizeWinnerShares } from './matchmaking/person-record';
import { fetchParticipantPositions } from './participant-positions';
import { type PersonDebateStats, derivePersonDebateStats, fetchPersonDebates } from './person-debate-stats';

const STALE_TIME = 5 * 60_000;

export function usePersonPositions(personId: string) {
  return useQuery({
    queryKey: ['debates', 'person-positions', personId],
    enabled: Boolean(personId),
    staleTime: STALE_TIME,
    queryFn: ({ signal }) => fetchParticipantPositions([personId], signal),
  });
}

export function usePersonDebates(personId: string) {
  return useQuery({
    queryKey: ['debates', 'person-debates', personId],
    enabled: Boolean(personId),
    staleTime: STALE_TIME,
    queryFn: ({ signal }) => fetchPersonDebates(personId, signal),
  });
}

export type PersonDebateStatsResult = {
  stats: PersonDebateStats | null;
  isLoading: boolean;
  isWinRateLoading: boolean;
  winnerShares: Map<string, WinnerShare>;
};

/**
 * The four figures for a person's Debates tab, from three sources joined here.
 */
export function usePersonDebateStats(personId: string): PersonDebateStatsResult {
  const positionsQuery = usePersonPositions(personId);
  const debatesQuery = usePersonDebates(personId);

  const debateIds = React.useMemo(
    () => [...new Set((debatesQuery.data ?? []).map(debate => debate.debateId))].sort(),
    [debatesQuery.data]
  );

  const { shares, isStale } = useWinnerSharesWithStatus(debateIds, { keepPreviousWhileLoading: true });
  const sharesByDebateId = React.useMemo(() => canonicalizeWinnerShares(shares), [shares]);

  const sharesReady = debateIds.length === 0 || !isStale;

  const stats = React.useMemo(() => {
    if (!positionsQuery.data || !debatesQuery.data) return null;
    return derivePersonDebateStats({
      personId,
      positions: positionsQuery.data,
      debates: debatesQuery.data,
      winnerShares: sharesReady ? sharesByDebateId : new Map(),
    });
  }, [personId, positionsQuery.data, debatesQuery.data, sharesByDebateId, sharesReady]);

  return {
    stats,
    isLoading: positionsQuery.isLoading || debatesQuery.isLoading,
    isWinRateLoading: Boolean(stats) && !sharesReady,
    winnerShares: sharesByDebateId,
  };
}
