'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import type { RankingSubmissionRecord } from '~/core/blocks/ranking/ranking-submission-types';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getEntity } from '~/core/io/queries';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import type { Profile } from '~/core/types';

import { getMyRankingOrderedEntityIds, isRankSubmittedToBlock } from './my-ranking-entity';

type UseSharedRankingParams = {
  rankEntityId?: string;
  authorSpaceId?: string;
  blockEntityId: string;
  blockEntitySpaceId: string;
};

function authorFromProfile(profile: Profile, authorSpaceId: string): RankingSubmissionRecord['author'] {
  const avatarUrl = profile.avatarUrl && profile.avatarUrl !== PLACEHOLDER_SPACE_IMAGE ? profile.avatarUrl : null;

  return {
    spaceId: authorSpaceId,
    address: profile.address ?? authorSpaceId,
    name: profile.name ?? null,
    avatarUrl,
  };
}

export function useSharedRanking({
  rankEntityId = '',
  authorSpaceId = '',
  blockEntityId,
  blockEntitySpaceId,
}: UseSharedRankingParams) {
  const enabled = Boolean(rankEntityId && authorSpaceId && blockEntityId && blockEntitySpaceId);
  const { data, isLoading } = useQuery({
    queryKey: ['shared-ranking', rankEntityId, authorSpaceId, blockEntityId, blockEntitySpaceId],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<RankingSubmissionRecord | null> => {
      const rankEntity = await Effect.runPromise(getEntity(rankEntityId, authorSpaceId));
      if (!rankEntity || !isRankSubmittedToBlock(rankEntity, authorSpaceId, blockEntityId)) return null;

      const profile = await Effect.runPromise(fetchProfileBySpaceId(authorSpaceId));

      return {
        id: rankEntity.id,
        authorSpaceId,
        targetBlockId: blockEntityId,
        targetBlockSpaceId: blockEntitySpaceId,
        orderedEntityIds: getMyRankingOrderedEntityIds(rankEntity, authorSpaceId),
        createdAt: String(rankEntity.updatedAt ?? rankEntity.createdAt ?? ''),
        author: authorFromProfile(profile, authorSpaceId),
      };
    },
  });

  return React.useMemo(
    () => ({
      sharedSubmission: data ?? null,
      isLoadingSharedSubmission: enabled && isLoading,
    }),
    [data, enabled, isLoading]
  );
}
