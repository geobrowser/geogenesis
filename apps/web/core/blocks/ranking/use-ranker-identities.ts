'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import type { Space } from '~/core/io/dto/spaces';
import { getSpaces } from '~/core/io/queries';
import { fetchProfilesBySpaceIds } from '~/core/io/subgraph/fetch-profile';
import type { Profile } from '~/core/types';
import { chunk } from '~/core/utils/chunk';
import { normId } from '~/core/utils/norm-id';

/**
 * Who a ranker is, for every ranking surface: the voters popover (`useRankingVoters`) and the
 * ranker lists (`useBlockRankers`). One resolution, so a person's name and avatar match on every
 * screen.
 *
 * The profile comes first. The personal space's image is used only when the profile has no
 * avatar. `fallbackSeed` is what an avatar fallback should be drawn from: the profile's address,
 * else the space id.
 */
export type RankerIdentity = {
  name: string | null;
  avatarUrl: string | null;
  fallbackSeed: string;
  address: string | null;
};

const SPACE_ID_REQUEST_LIMIT = 100;
const IDENTITY_STALE_TIME = 60_000;

const EMPTY_PROFILE_MAP = new Map<string, Profile>();
const EMPTY_SPACE_MAP = new Map<string, Space>();

export function usableAvatarUrl(url: string | null | undefined): string | null {
  return url && url !== PLACEHOLDER_SPACE_IMAGE ? url : null;
}

export function resolveRankerIdentity(
  spaceId: string,
  profile: Profile | undefined,
  space: Space | undefined
): RankerIdentity {
  return {
    name: profile?.name ?? null,
    avatarUrl: usableAvatarUrl(profile?.avatarUrl) ?? usableAvatarUrl(space?.entity?.image),
    fallbackSeed: profile?.address ?? spaceId,
    address: profile?.address ?? null,
  };
}

/**
 * Identities for a set of personal space ids. `identityOf` answers for any id (dashed or not); an
 * id whose profile hasn't loaded yet gets the space-id fallback. `isLoading` is true while the
 * profiles are loading; the space-image top-up never holds it.
 */
export function useRankerIdentities(spaceIds: string[], enabled = true) {
  const { data: profiles = EMPTY_PROFILE_MAP, isLoading: isLoadingProfiles } = useQuery({
    queryKey: ['ranking-voter-profiles', spaceIds],
    enabled: enabled && spaceIds.length > 0,
    staleTime: IDENTITY_STALE_TIME,
    queryFn: async () => {
      const batches = chunk(spaceIds, SPACE_ID_REQUEST_LIMIT);
      const results = await Promise.all(batches.map(batch => Effect.runPromise(fetchProfilesBySpaceIds(batch))));
      const map = new Map<string, Profile>();
      for (const batch of results) {
        for (const profile of batch) map.set(normId(profile.spaceId), profile);
      }
      return map;
    },
  });

  // A space is only fetched to borrow its image, and that image is only reached
  // for when the profile didn't supply an avatar.
  const spaceIdsNeedingImage = React.useMemo(
    () =>
      isLoadingProfiles ? [] : spaceIds.filter(spaceId => !usableAvatarUrl(profiles.get(normId(spaceId))?.avatarUrl)),
    [isLoadingProfiles, spaceIds, profiles]
  );

  const { data: spaces = EMPTY_SPACE_MAP } = useQuery({
    queryKey: ['ranking-voter-spaces', spaceIdsNeedingImage],
    enabled: enabled && !isLoadingProfiles && spaceIdsNeedingImage.length > 0,
    staleTime: IDENTITY_STALE_TIME,
    queryFn: async ({ signal }) => {
      const batches = chunk(spaceIdsNeedingImage, SPACE_ID_REQUEST_LIMIT);
      const results = await Promise.all(
        batches.map(batch => Effect.runPromise(getSpaces({ spaceIds: batch }, signal)))
      );
      const map = new Map<string, Space>();
      for (const batch of results) {
        for (const space of batch) map.set(normId(space.id), space);
      }
      return map;
    },
  });

  const identityOf = React.useCallback(
    (spaceId: string) => resolveRankerIdentity(spaceId, profiles.get(normId(spaceId)), spaces.get(normId(spaceId))),
    [profiles, spaces]
  );

  return { identityOf, isLoading: enabled && spaceIds.length > 0 && isLoadingProfiles };
}
