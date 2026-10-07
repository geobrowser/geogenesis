'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { GEO_CHAT_AUTHORIZATION_HEADER } from '~/core/explore/fresh-slot/ranking-lab-types';
import { normId } from '~/core/utils/norm-id';

import { adminScheduleOverlaps, getGeoChatSession } from '../api';
import { debateQueryNetworkOptions, useGeoChatAuth } from '../hooks';
import { ADMIN_MATCH_DAYS } from './admin-hooks';
import { type AdminPairFitResponse, MAX_PAIR_FIT_CANDIDATES, type PairFitItem } from './pair-fit';

/** geo-chat answers at most this many candidates per overlaps request. */
const OVERLAP_BATCH = 100;

const EMPTY_FIT: ReadonlyMap<string, PairFitItem> = new Map();
const EMPTY_SLOTS: ReadonlyMap<string, number> = new Map();

/**
 * Pair fit of debater 1 with each candidate (GEO-3224), keyed by normalized personal space id.
 * `available` is false until it arrives, and stays false if the server could not get it, which
 * leaves New match in its existing order.
 */
export function useAdminPairFit(anchorProfileSpaceId: string | null, candidateProfileSpaceIds: readonly string[]) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const anchor = anchorProfileSpaceId ? normId(anchorProfileSpaceId) : null;
  const candidates = React.useMemo(
    () =>
      [...new Set(candidateProfileSpaceIds.map(normId))].filter(id => id !== anchor).slice(0, MAX_PAIR_FIT_CANDIDATES),
    [anchor, candidateProfileSpaceIds]
  );
  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: ['debates', 'admin-pair-fit', anchor, candidates.join(','), accountKey] as const,
    queryFn: async ({ signal }): Promise<AdminPairFitResponse> => {
      const identity = await getPrivyIdentityToken();
      if (!identity || !accountKey) return { available: false, items: [] };
      const session = await getGeoChatSession(getPrivyIdentityToken, accountKey);
      const response = await fetch('/api/debates/admin/pair-fit', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${identity}`,
          [GEO_CHAT_AUTHORIZATION_HEADER]: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: anchor, candidateIds: candidates }),
        cache: 'no-store',
        signal,
      });
      if (!response.ok) return { available: false, items: [] };
      return (await response.json()) as AdminPairFitResponse;
    },
    enabled: authenticated && Boolean(anchor) && candidates.length > 0,
    staleTime: 60_000,
  });

  const byProfile = React.useMemo(() => {
    if (!query.data?.available) return EMPTY_FIT;
    return new Map(query.data.items.map(item => [normId(item.userId), item]));
  }, [query.data]);

  return { available: query.data?.available === true, byProfile, isPending: query.isPending && Boolean(anchor) };
}

/**
 * How many half-hours each candidate shares with debater 1 over the next two weeks, keyed by
 * normalized geo-chat user id. A candidate missing from the map is unknown (not loaded, or
 * geo-chat failed), which costs them nothing in the order.
 */
export function useAdminSharedFreeSlots(firstUserId: string | null, candidateUserIds: readonly string[]) {
  const { accountKey, authenticated, getPrivyIdentityToken } = useGeoChatAuth();
  const candidates = React.useMemo(
    () => [...new Set(candidateUserIds.map(normId))].filter(id => !firstUserId || id !== normId(firstUserId)),
    [candidateUserIds, firstUserId]
  );
  const query = useQuery({
    ...debateQueryNetworkOptions,
    queryKey: ['debates', 'admin-shared-free-slots', firstUserId, candidates.join(','), accountKey] as const,
    queryFn: async ({ signal }) => {
      const batches: string[][] = [];
      for (let i = 0; i < candidates.length; i += OVERLAP_BATCH) batches.push(candidates.slice(i, i + OVERLAP_BATCH));
      const answers = await Promise.all(
        batches.map(users =>
          adminScheduleOverlaps(
            { of: firstUserId!, users, days: ADMIN_MATCH_DAYS },
            getPrivyIdentityToken,
            accountKey,
            signal
          ).catch(() => null)
        )
      );
      const slots = new Map<string, number>();
      for (const answer of answers) {
        for (const candidate of answer?.candidates ?? []) slots.set(normId(candidate.with), candidate.slots.length);
      }
      return slots;
    },
    enabled: authenticated && Boolean(firstUserId) && candidates.length > 0,
    staleTime: 60_000,
  });
  return query.data ?? EMPTY_SLOTS;
}
