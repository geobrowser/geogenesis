'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { EntitiesOrderBy } from '~/core/gql/graphql';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { getAllEntities } from '~/core/io/queries';
import { RANK_TYPE_ID } from '~/core/ranking-block-ids';

import {
  buildMyRankingEntityFilter,
  getMyRankingOrderedEntityIds,
  pickMostRecentlyUpdatedRankingEntity,
} from './my-ranking-entity';

export function useMyRanking(blockId: string) {
  const { personalSpaceId } = usePersonalSpaceId();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-ranking-entity', personalSpaceId, blockId],
    enabled: Boolean(personalSpaceId && blockId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!personalSpaceId) {
        return { rankEntity: null, orderedEntityIds: [] as string[] };
      }

      const { entities } = await Effect.runPromise(
        getAllEntities({
          spaceId: personalSpaceId,
          typeId: RANK_TYPE_ID,
          filter: buildMyRankingEntityFilter(blockId),
          orderBy: [EntitiesOrderBy.UpdatedAtDesc],
          limit: 100,
        })
      );

      const rankEntity = pickMostRecentlyUpdatedRankingEntity(entities);
      if (!rankEntity) {
        return { rankEntity: null, orderedEntityIds: [] as string[] };
      }

      return {
        rankEntity,
        orderedEntityIds: getMyRankingOrderedEntityIds(rankEntity, personalSpaceId),
      };
    },
  });

  const myRankEntity = data?.rankEntity ?? null;
  const orderedEntityIds = data?.orderedEntityIds ?? [];

  return {
    myRankEntity,
    orderedEntityIds,
    isLoading,
    refetchMyRanking: React.useCallback(async () => {
      await refetch();
    }, [refetch]),
  };
}
