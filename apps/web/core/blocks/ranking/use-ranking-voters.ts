'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { useQueryEntities } from '~/core/sync/use-store';
import type { Profile } from '~/core/types';

import type { AggregatedRankingSubmitterRef } from './ranking-block-relations';

export type RankingVoter = {
  rankEntityId: string;
  spaceId: string;
  name: string | null;
  avatarUrl: string | null;
  fallbackSeed: string;
  address: string | null;
};

const SPACE_ID_REQUEST_LIMIT = 100;

const EMPTY_PROFILE_MAP = new Map<string, Profile>();
const EMPTY_SPACE_MAP = new Map<string, Space>();

function chunkSpaceIds(spaceIds: string[]): string[][] {
  const batches: string[][] = [];
  for (let start = 0; start < spaceIds.length; start += SPACE_ID_REQUEST_LIMIT) {
    batches.push(spaceIds.slice(start, start + SPACE_ID_REQUEST_LIMIT));
  }
  return batches;
}

export function useRankingVoters(refs: AggregatedRankingSubmitterRef[]) {
  const rankEntityIdsNeedingSpace = React.useMemo(
    () => refs.filter(ref => !ref.spaceId).map(ref => ref.rankEntityId),
    [refs]
  );

  const { entities } = useQueryEntities({
    enabled: rankEntityIdsNeedingSpace.length > 0,
    where: { id: { in: rankEntityIdsNeedingSpace } },
    first: rankEntityIdsNeedingSpace.length || undefined,
  });

  const rankEntitySpaceById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const entity of entities) {
      const homeSpaceId = entity.spaces?.[0];
      if (homeSpaceId) map.set(entity.id, homeSpaceId);
    }
    return map;
  }, [entities]);

  const resolvedRefs = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { rankEntityId: string; spaceId: string }[] = [];
    for (const ref of refs) {
      const spaceId = ref.spaceId ?? rankEntitySpaceById.get(ref.rankEntityId);
      if (!spaceId || seen.has(spaceId)) continue;
      seen.add(spaceId);
      out.push({ rankEntityId: ref.rankEntityId, spaceId });
    }
    return out;
  }, [refs, rankEntitySpaceById]);

  const spaceIds = React.useMemo(() => resolvedRefs.map(ref => ref.spaceId), [resolvedRefs]);

  const { data: profilesBySpaceId = EMPTY_PROFILE_MAP, isLoading: isLoadingProfiles } = useQuery({
    queryKey: ['ranking-voter-profiles', spaceIds],
    enabled: spaceIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const batches = chunkSpaceIds(spaceIds);
      const results = await Promise.all(batches.map(batch => Effect.runPromise(fetchProfilesBySpaceIds(batch))));
      const map = new Map<string, Profile>();
      for (const profiles of results) {
        for (const profile of profiles) map.set(profile.spaceId, profile);
      }
      return map;
    },
  });

  const { data: spacesById = EMPTY_SPACE_MAP } = useQuery({
    queryKey: ['ranking-voter-spaces', spaceIds],
    enabled: spaceIds.length > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const batches = chunkSpaceIds(spaceIds);
      const results = await Promise.all(
        batches.map(batch => Effect.runPromise(getSpaces({ spaceIds: batch }, signal)))
      );
      const map = new Map<string, Space>();
      for (const spaces of results) {
        for (const space of spaces) map.set(space.id, space);
      }
      return map;
    },
  });

  const voters: RankingVoter[] = React.useMemo(
    () =>
      resolvedRefs.map(ref => {
        const profile = profilesBySpaceId.get(ref.spaceId);
        const profileAvatarUrl =
          profile?.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;
        const spaceImage = spacesById.get(ref.spaceId)?.entity.image;
        const spaceAvatarUrl = spaceImage && spaceImage !== PLACEHOLDER_SPACE_IMAGE ? spaceImage : null;
        return {
          rankEntityId: ref.rankEntityId,
          spaceId: ref.spaceId,
          name: profile?.name ?? null,
          avatarUrl: profileAvatarUrl ?? spaceAvatarUrl,
          fallbackSeed: profile?.address ?? ref.spaceId,
          address: profile?.address ?? null,
        };
      }),
    [resolvedRefs, profilesBySpaceId, spacesById]
  );

  const isLoading = spaceIds.length > 0 && isLoadingProfiles;

  return { voters, isLoading };
}
