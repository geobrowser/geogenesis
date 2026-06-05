'use client';

import { RANKING_END_DATE_PROPERTY_ID, RANKING_START_DATE_PROPERTY_ID } from '~/core/ranking-block-ids';
import { useValues } from '~/core/sync/use-store';

import { useDataBlockInstance } from '../data/use-data-block';

export function useRankingBlockDates(fallback: { startDate: string; endDate: string }) {
  const { entityId, spaceId } = useDataBlockInstance();

  const values = useValues({
    selector: v =>
      v.entity.id === entityId &&
      v.spaceId === spaceId &&
      !v.isDeleted &&
      (v.property.id === RANKING_START_DATE_PROPERTY_ID || v.property.id === RANKING_END_DATE_PROPERTY_ID),
  });

  const startFromGraph =
    RANKING_START_DATE_PROPERTY_ID != null
      ? (values.find(v => v.property.id === RANKING_START_DATE_PROPERTY_ID)?.value ?? '')
      : '';
  const endFromGraph =
    RANKING_END_DATE_PROPERTY_ID != null
      ? (values.find(v => v.property.id === RANKING_END_DATE_PROPERTY_ID)?.value ?? '')
      : '';

  return {
    startDate: startFromGraph || fallback.startDate,
    endDate: endFromGraph || fallback.endDate,
  };
}
