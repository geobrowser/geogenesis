'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import type { RankingSubmissionRecord } from '~/core/blocks/ranking/ranking-submission-types';
import { PLACEHOLDER_SPACE_IMAGE } from '~/core/constants';
import { getEntity, getEntityRelationsByType, getRelationsByToEntityIds } from '~/core/io/queries';
import { fetchProfileBySpaceId } from '~/core/io/subgraph/fetch-profile';
import { RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Profile } from '~/core/types';

import { getMyRankingOrderedEntityIds, isRankSubmittedToBlockFromBlockLookup } from './my-ranking-entity';

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
    queryFn: async ({ signal }): Promise<RankingSubmissionRecord | null> => {
      const [rankEntity, submittedToBlockRelations, voteRelations] = await Promise.all([
        Effect.runPromise(getEntity(rankEntityId, authorSpaceId, signal)),
        Effect.runPromise(getRelationsByToEntityIds([blockEntityId], SUBMITTED_TO_PROPERTY_ID, authorSpaceId, signal)),
        Effect.runPromise(getEntityRelationsByType(rankEntityId, authorSpaceId, RANK_VOTES_RELATION_TYPE_ID, signal)),
      ]);

      if (
        !rankEntity ||
        !isRankSubmittedToBlockFromBlockLookup(rankEntityId, authorSpaceId, blockEntityId, submittedToBlockRelations)
      ) {
        return null;
      }

      const profile = await Effect.runPromise(fetchProfileBySpaceId(authorSpaceId));

      return {
        id: rankEntity.id,
        authorSpaceId,
        targetBlockId: blockEntityId,
        targetBlockSpaceId: blockEntitySpaceId,
        orderedEntityIds: getMyRankingOrderedEntityIds(
          rankEntityId,
          voteRelations.filter((relation): relation is NonNullable<typeof relation> => relation !== null),
          authorSpaceId
        ),
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
