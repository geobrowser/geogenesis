'use client';

import { RANKING_END_TIME_PROPERTY_ID, RANKING_START_TIME_PROPERTY_ID } from '~/core/ranking-block-ids';
import { useValues } from '~/core/sync/use-store';

import { useDataBlockInstance } from '../data/use-data-block';

const RANKING_DATE_PROPERTY_IDS = new Set([RANKING_START_TIME_PROPERTY_ID, RANKING_END_TIME_PROPERTY_ID]);

export function useRankingBlockDates(fallback: { startDate: string; endDate: string }) {
  const { entityId, spaceId } = useDataBlockInstance();

  const values = useValues({
    selector: v =>
      v.entity.id === entityId && v.spaceId === spaceId && !v.isDeleted && RANKING_DATE_PROPERTY_IDS.has(v.property.id),
  });

  const startFromGraph = values.find(v => v.property.id === RANKING_START_TIME_PROPERTY_ID)?.value ?? '';
  const endFromGraph = values.find(v => v.property.id === RANKING_END_TIME_PROPERTY_ID)?.value ?? '';

  return {
    startDate: startFromGraph || fallback.startDate,
    endDate: endFromGraph || fallback.endDate,
  };
}
