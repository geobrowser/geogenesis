'use client';

import { useQuery } from '@tanstack/react-query';
import { createAtom } from '@xstate/store';
import { useSelector } from '@xstate/store/react';

import * as React from 'react';

import { Effect } from 'effect';
import equal from 'fast-deep-equal';

import { getEntityRelationsByType } from '~/core/io/queries';
import { AGGREGATED_RANKINGS_PROPERTY_ID, RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { reactiveRelations, reactiveValues } from '~/core/sync/store';
import { useSyncEngine } from '~/core/sync/use-sync-engine';

import { useDataBlockInstance } from '../data/use-data-block';
import {
  buildLeaderboardFromOrderedEntityIds,
  filterEntityRelationsByType,
  getAggregatedRankingSubmissionCount,
  getAggregatedRankingSubmitterRefs,
  getOrderedRelationTargetIds,
  mergeEntityRelationsById,
} from './ranking-block-relations';
import { useResolvedRankingSubmitterSpaceIds } from './use-ranking-submitter-space-ids';

const reactive = createAtom(() => {
  reactiveValues.get();
  reactiveRelations.get();
});

type Options = {
  blockId?: string;
  spaceId?: string;
};

export function useRankingBlockRelations(options: Options = {}) {
  const instance = useDataBlockInstance();
  const blockId = options.blockId ?? instance.entityId;
  const spaceId = options.spaceId ?? instance.spaceId;

  const { store } = useSyncEngine();
  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === blockId) ?? null;

  const localEntityRelations = useSelector(
    reactive,
    () => (blockId ? (store.getEntity(blockId, { spaceId })?.relations ?? []) : []),
    equal
  );

  const localOverlayRelations = React.useMemo(
    () => mergeEntityRelationsById([], [...(initialBlockEntity?.relations ?? []), ...localEntityRelations]),
    [initialBlockEntity, localEntityRelations]
  );

  const { data: serverRankPositions = [] } = useQuery({
    queryKey: ['entity-relations-by-type', blockId, spaceId, RANK_POSITION_PROPERTY_ID],
    enabled: Boolean(blockId && spaceId),
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      Effect.runPromise(getEntityRelationsByType(blockId, spaceId, RANK_POSITION_PROPERTY_ID, signal)),
  });

  const { data: serverAggregatedRelations = [] } = useQuery({
    queryKey: ['entity-relations-by-type', blockId, spaceId, AGGREGATED_RANKINGS_PROPERTY_ID],
    enabled: Boolean(blockId && spaceId),
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      Effect.runPromise(getEntityRelationsByType(blockId, spaceId, AGGREGATED_RANKINGS_PROPERTY_ID, signal)),
  });

  const rankPositionRelations = React.useMemo(() => {
    const local = filterEntityRelationsByType(localOverlayRelations, blockId, RANK_POSITION_PROPERTY_ID, spaceId);
    return mergeEntityRelationsById(serverRankPositions, local);
  }, [serverRankPositions, localOverlayRelations, blockId, spaceId]);

  const aggregatedRelations = React.useMemo(() => {
    const local = filterEntityRelationsByType(localOverlayRelations, blockId, AGGREGATED_RANKINGS_PROPERTY_ID, spaceId);
    return mergeEntityRelationsById(serverAggregatedRelations, local);
  }, [serverAggregatedRelations, localOverlayRelations, blockId, spaceId]);

  const globalRankingEntityIds = React.useMemo(
    () => getOrderedRelationTargetIds(rankPositionRelations, blockId, RANK_POSITION_PROPERTY_ID, spaceId),
    [rankPositionRelations, blockId, spaceId]
  );

  const aggregatedSubmitterRefs = React.useMemo(
    () => getAggregatedRankingSubmitterRefs(aggregatedRelations, blockId, spaceId),
    [aggregatedRelations, blockId, spaceId]
  );

  const aggregatedSubmitterSpaceIds = useResolvedRankingSubmitterSpaceIds(aggregatedSubmitterRefs);

  const aggregatedRankingCount = React.useMemo(
    () => getAggregatedRankingSubmissionCount(aggregatedRelations, blockId, spaceId),
    [aggregatedRelations, blockId, spaceId]
  );

  const globalLeaderboard = React.useMemo(
    () => buildLeaderboardFromOrderedEntityIds(globalRankingEntityIds),
    [globalRankingEntityIds]
  );

  return {
    globalRankingEntityIds,
    globalLeaderboard,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
  };
}
