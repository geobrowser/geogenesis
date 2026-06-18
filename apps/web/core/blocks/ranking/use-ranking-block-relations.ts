'use client';

import * as React from 'react';

import { RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useQueryEntity } from '~/core/sync/use-store';

import { useDataBlockInstance } from '../data/use-data-block';
import {
  buildLeaderboardFromOrderedEntityIds,
  getAggregatedRankingSubmissionCount,
  getAggregatedRankingSubmitterRefs,
  getOrderedRelationTargetIds,
} from './ranking-block-relations';
import { useResolvedRankingSubmitterSpaceIds } from './use-ranking-submitter-space-ids';

type Options = {
  blockId?: string;
  spaceId?: string;
};

export function useRankingBlockRelations(options: Options = {}) {
  const instance = useDataBlockInstance();
  const blockId = options.blockId ?? instance.entityId;
  const spaceId = options.spaceId ?? instance.spaceId;

  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === blockId) ?? null;

  const { entity: blockEntity } = useQueryEntity({
    spaceId,
    id: blockId,
  });

  const blockRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];

  const globalRankingEntityIds = React.useMemo(
    () => getOrderedRelationTargetIds(blockRelations, blockId, RANK_POSITION_PROPERTY_ID, spaceId),
    [blockId, blockRelations, spaceId]
  );

  const aggregatedSubmitterRefs = React.useMemo(
    () => getAggregatedRankingSubmitterRefs(blockRelations, blockId, spaceId),
    [blockId, blockRelations, spaceId]
  );

  const aggregatedSubmitterSpaceIds = useResolvedRankingSubmitterSpaceIds(aggregatedSubmitterRefs);

  const aggregatedRankingCount = React.useMemo(
    () => getAggregatedRankingSubmissionCount(blockRelations, blockId, spaceId),
    [blockId, blockRelations, spaceId]
  );

  const globalLeaderboard = React.useMemo(
    () => buildLeaderboardFromOrderedEntityIds(globalRankingEntityIds),
    [globalRankingEntityIds]
  );

  return {
    globalRankingEntityIds,
    globalLeaderboard,
    aggregatedSubmitterRefs,
    aggregatedSubmitterSpaceIds,
    aggregatedRankingCount,
  };
}
