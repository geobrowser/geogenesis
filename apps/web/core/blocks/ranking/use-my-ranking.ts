'use client';

import { useQuery } from '@tanstack/react-query';

import * as React from 'react';

import { Effect } from 'effect';

import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { getEntity, getRelationsByToEntityIds } from '~/core/io/queries';
import { SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';

import { getMyRankingOrderedEntityIds, pickMostRecentlyUpdatedRankingEntity } from './my-ranking-entity';

export function useMyRanking(blockId: string) {
  const { personalSpaceId } = usePersonalSpaceId();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-ranking-entity', personalSpaceId, blockId],
    enabled: Boolean(personalSpaceId && blockId),
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!personalSpaceId) {
        return { rankEntity: null, orderedEntityIds: [] as string[] };
      }

      const submittedToRelations = await Effect.runPromise(
        getRelationsByToEntityIds([blockId], SUBMITTED_TO_PROPERTY_ID, personalSpaceId, signal)
      );

      const rankEntityIds = [
        ...new Set(
          submittedToRelations.map(relation => relation.fromEntityId).filter((id): id is string => Boolean(id))
        ),
      ];

      if (rankEntityIds.length === 0) {
        return { rankEntity: null, orderedEntityIds: [] as string[] };
      }

      const rankEntities = (
        await Promise.all(rankEntityIds.map(id => Effect.runPromise(getEntity(id, personalSpaceId, signal))))
      ).filter((entity): entity is Entity => entity !== null);

      const rankEntity = pickMostRecentlyUpdatedRankingEntity(rankEntities);
      if (!rankEntity) {
        return { rankEntity: null, orderedEntityIds: [] as string[] };
      }

      return {
        rankEntity,
        orderedEntityIds: getMyRankingOrderedEntityIds(rankEntity.id, rankEntity.relations ?? [], personalSpaceId),
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
      const result = await refetch();
      if (result.isError) {
        throw result.error ?? new Error('Failed to refetch my ranking');
      }
      return {
        myRankEntity: result.data?.rankEntity ?? null,
        orderedEntityIds: result.data?.orderedEntityIds ?? [],
      };
    }, [refetch]),
  };
}
