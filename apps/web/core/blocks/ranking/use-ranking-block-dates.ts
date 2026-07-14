'use client';

import { useValues } from '~/core/sync/use-store';

import { useDataBlockInstance } from '../data/use-data-block';
import {
  RANKING_DATE_PROPERTY_IDS,
  RANKING_END_PROPERTY_IDS,
  RANKING_START_PROPERTY_IDS,
  resolveRankingDate,
} from './ranking-block-dates';

export function useRankingBlockDates(fallback: { startDate: string; endDate: string }) {
  const { entityId, spaceId } = useDataBlockInstance();

  const values = useValues({
    selector: v =>
      v.entity.id === entityId && v.spaceId === spaceId && !v.isDeleted && RANKING_DATE_PROPERTY_IDS.has(v.property.id),
  });

  const readValue = (propertyId: string) => values.find(v => v.property.id === propertyId)?.value;

  const startFromGraph = resolveRankingDate(RANKING_START_PROPERTY_IDS, readValue);
  const endFromGraph = resolveRankingDate(RANKING_END_PROPERTY_IDS, readValue);

  return {
    startDate: startFromGraph || fallback.startDate,
    endDate: endFromGraph || fallback.endDate,
  };
}
