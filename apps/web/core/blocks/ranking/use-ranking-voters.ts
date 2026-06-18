'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { useSpacesByIds } from '~/core/hooks/use-spaces-by-ids';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import { useQueryEntities } from '~/core/sync/use-store';

import type { AggregatedRankingSubmitterRef } from './ranking-block-relations';

export type RankingVoter = {
  rankEntityId: string;
  spaceId: string;
  name: string | null;
  avatarUrl: string | null;
  fallbackSeed: string;
  address: string | null;
};

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

  const { data: profilesBySpaceId = new Map(), isLoading: isLoadingProfiles } = useQuery({
    queryKey: ['ranking-voter-profiles', spaceIds],
    enabled: spaceIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const profiles = await Effect.runPromise(fetchProfilesBySpaceIds(spaceIds));
      return new Map(spaceIds.map((spaceId, index) => [spaceId, profiles[index]!]));
    },
  });

  const { spacesById } = useSpacesByIds(spaceIds);

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
