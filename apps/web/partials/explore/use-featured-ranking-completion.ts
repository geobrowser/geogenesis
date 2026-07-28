'use client';

import * as React from 'react';

import { isRollingRankingBlock } from '~/core/blocks/ranking/ensure-ranking-type';
import { getAggregatedRankingSubmitterRefs } from '~/core/blocks/ranking/ranking-block-relations';
import { isRollingSubmissionLive, parseTimestampMs } from '~/core/blocks/ranking/ranking-rolling';
import { useMyRanking } from '~/core/blocks/ranking/use-my-ranking';
import { getRankingSubmissionFrequencyHours } from '~/core/blocks/ranking/use-ranking-block-config';
import { usePersonalSpaceId } from '~/core/hooks/use-personal-space-id';
import { ID } from '~/core/id';
import { SUBMISSION_FREQUENCY_PROPERTY_ID } from '~/core/ranking-block-ids';
import { useQueryEntity, useValues } from '~/core/sync/use-store';

const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Whether the current user has a live ranking for this featured block.
 * Matches ranking-block CTA gating: rolled-off rolling rankings are incomplete.
 */
export function useFeaturedRankingCompletion(
  blockId: string,
  spaceId: string
): {
  hasCompleted: boolean;
  isLoading: boolean;
} {
  const { personalSpaceId } = usePersonalSpaceId();
  const { myRankEntity, orderedEntityIds, isLoading } = useMyRanking(blockId);
  const { entity: blockEntity } = useQueryEntity({ id: blockId, spaceId });
  const blockRelations = blockEntity?.relations ?? [];

  const isRolling = React.useMemo(
    () => isRollingRankingBlock(blockRelations, blockId, spaceId),
    [blockRelations, blockId, spaceId]
  );

  const frequencyValues = useValues({
    selector: v =>
      ID.equals(v.entity.id, blockId) &&
      ID.equals(v.spaceId, spaceId) &&
      !v.isDeleted &&
      v.property.id === SUBMISSION_FREQUENCY_PROPERTY_ID,
  });
  const submissionFrequencyHours = React.useMemo(
    () => getRankingSubmissionFrequencyHours(frequencyValues),
    [frequencyValues]
  );

  const aggregatedSubmitterRefs = React.useMemo(
    () => getAggregatedRankingSubmitterRefs(blockRelations, blockId, spaceId),
    [blockRelations, blockId, spaceId]
  );

  const submittedAtMs = React.useMemo(
    () => (myRankEntity ? parseTimestampMs(myRankEntity.updatedAt) : 0),
    [myRankEntity]
  );

  const isSubmissionLive = React.useMemo(() => {
    if (!isRolling || !myRankEntity) return true;
    const windowElapsed =
      submissionFrequencyHours != null &&
      submittedAtMs > 0 &&
      Date.now() >= submittedAtMs + submissionFrequencyHours * MS_PER_HOUR;
    if (!windowElapsed) return true;
    return isRollingSubmissionLive({
      personalSpaceId,
      myRankEntityId: myRankEntity.id,
      aggregatedSubmitterRefs,
    });
  }, [aggregatedSubmitterRefs, isRolling, myRankEntity, personalSpaceId, submissionFrequencyHours, submittedAtMs]);

  const hasRolledOff = isRolling && Boolean(myRankEntity) && !isSubmissionLive;
  const hasCompleted = !hasRolledOff && orderedEntityIds.length > 0;

  return { hasCompleted, isLoading };
}
