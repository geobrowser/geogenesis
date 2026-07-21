'use client';

import { useValues } from '~/core/sync/use-store';

import { useDataBlockInstance } from '../data/use-data-block';
import {
  RANKING_DATE_PROPERTY_IDS,
  RANKING_END_PROPERTY_IDS,
  RANKING_START_PROPERTY_IDS,
  type RankingDate,
  resolveRankingDateValue,
  toRankingDate,
} from './ranking-block-dates';

export function useRankingBlockDates(fallback: { startDate: string; endDate: string }): {
  startDate: RankingDate;
  endDate: RankingDate;
} {
  const { entityId, spaceId } = useDataBlockInstance();

  const values = useValues({
    selector: v =>
      v.entity.id === entityId && v.spaceId === spaceId && !v.isDeleted && RANKING_DATE_PROPERTY_IDS.has(v.property.id),
  });

  const readValue = (propertyId: string) => values.find(v => v.property.id === propertyId)?.value;

  const startFromGraph = resolveRankingDateValue(RANKING_START_PROPERTY_IDS, readValue);
  const endFromGraph = resolveRankingDateValue(RANKING_END_PROPERTY_IDS, readValue);

  return {
    startDate: startFromGraph.value ? startFromGraph : toRankingDate(fallback.startDate),
    endDate: endFromGraph.value ? endFromGraph : toRankingDate(fallback.endDate),
  };
}
