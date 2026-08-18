'use client';

import * as React from 'react';

import { SUBMISSION_FREQUENCY_PROPERTY_ID } from '~/core/ranking-block-ids';
import { useEditorStoreLite } from '~/core/state/editor/use-editor';
import { useQueryEntity, useValues } from '~/core/sync/use-store';
import type { Value } from '~/core/types';

import { useDataBlockInstance } from '../data/use-data-block';
import { isRollingRankingBlock } from './ensure-ranking-type';

type Options = {
  blockId?: string;
  spaceId?: string;
};

/**
 * Submission frequency
 */
export function getRankingSubmissionFrequencyHours(values: Value[]): number | null {
  const raw = values.find(v => v.property.id === SUBMISSION_FREQUENCY_PROPERTY_ID && !v.isDeleted)?.value;
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function useRankingBlockConfig(options: Options = {}) {
  const instance = useDataBlockInstance();
  const blockId = options.blockId ?? instance.entityId;
  const spaceId = options.spaceId ?? instance.spaceId;

  const { initialBlockEntities } = useEditorStoreLite();
  const initialBlockEntity = initialBlockEntities.find(b => b.id === blockId) ?? null;

  const { entity: blockEntity } = useQueryEntity({ spaceId, id: blockId });
  const blockRelations = blockEntity?.relations ?? initialBlockEntity?.relations ?? [];

  const isRolling = React.useMemo(
    () => isRollingRankingBlock(blockRelations, blockId, spaceId),
    [blockRelations, blockId, spaceId]
  );

  const values = useValues({
    selector: v =>
      v.entity.id === blockId &&
      v.spaceId === spaceId &&
      !v.isDeleted &&
      v.property.id === SUBMISSION_FREQUENCY_PROPERTY_ID,
  });

  const submissionFrequencyHours = React.useMemo(() => getRankingSubmissionFrequencyHours(values), [values]);

  return { isRolling, submissionFrequencyHours };
}
