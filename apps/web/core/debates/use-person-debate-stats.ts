'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { type WinnerShare, useWinnerSharesWithStatus } from '~/core/claims/browse/claim-debates';
import { useQueryEntities } from '~/core/sync/use-store';
import { resolveEntitySpaceId } from '~/core/utils/space/entity-home-space';

import { canonicalizeWinnerShares } from './matchmaking/person-record';
import { DEBATE_TYPE_ID } from './ontology';
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
  // Spaces is taken from `resolveEntitySpaceId` on these entities so the strip and the section's Space filter can't disagree on where a debate lives.

  const { entities: debateEntities } = useQueryEntities({
    where: { id: { in: debateIds }, types: [{ id: { equals: DEBATE_TYPE_ID } }] },
    first: Math.max(debateIds.length, 1),
    enabled: debateIds.length > 0,
  });

  const debateSpaceIds = React.useMemo(
    () => debateEntities.map(debate => resolveEntitySpaceId(debate, personId)),
    [debateEntities, personId]
  );

  const debatesHydrated = debateIds.length === 0 || debateEntities.length > 0;

  const { shares, isStale } = useWinnerSharesWithStatus(debateIds, { keepPreviousWhileLoading: true });
  const sharesByDebateId = React.useMemo(() => canonicalizeWinnerShares(shares), [shares]);

  const sharesReady = debateIds.length === 0 || !isStale;

  const stats = React.useMemo(() => {
    if (!positionsQuery.data || !debatesQuery.data || !debatesHydrated) return null;
    return derivePersonDebateStats({
      personId,
      positions: positionsQuery.data,
      debates: debatesQuery.data,
      debateSpaceIds,
      winnerShares: sharesReady ? sharesByDebateId : new Map(),
    });
  }, [
    personId,
    positionsQuery.data,
    debatesQuery.data,
    debatesHydrated,
    debateSpaceIds,
    sharesByDebateId,
    sharesReady,
  ]);

  return {
    stats,
    isLoading: positionsQuery.isLoading || debatesQuery.isLoading || !debatesHydrated,
    isWinRateLoading: Boolean(stats) && !sharesReady,
    winnerShares: sharesByDebateId,
  };
}
