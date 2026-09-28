'use client';

import * as React from 'react';

import { RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useQueryEntity } from '~/core/sync/use-store';
import type { Relation } from '~/core/types';

import { useDataBlockInstance } from '../data/use-data-block';
import {
  buildLeaderboardFromOrderedEntityIds,
  getAggregatedRankingSubmissionCount,
  getAggregatedRankingSubmitterRefs,
  getOrderedRelationTargetIds,
} from './ranking-block-relations';
import { useResolvedRankingSubmitterSpaceIds } from './use-ranking-submitter-space-ids';

/**
 * A stable empty list, so the fallback below does not mint a new array on every render.
 *
 * `a ?? b ?? []` looks harmless and is not: when neither side has relations yet, each render
 * produces a fresh `[]`, every memo keyed on it recomputes, and anything downstream keyed on
 * *those* results churns too. Naming the empty case keeps the reference stable, which is what the
 * memos were written to rely on.
 */
const NO_RELATIONS: Relation[] = [];

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

  const blockRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? NO_RELATIONS;

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
