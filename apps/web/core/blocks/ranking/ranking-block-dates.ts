import {
  LEGACY_RANKING_END_DATE_PROPERTY_ID,
  LEGACY_RANKING_START_DATE_PROPERTY_ID,
  RANKING_END_TIME_PROPERTY_ID,
  RANKING_START_TIME_PROPERTY_ID,
} from '~/core/ranking-block-ids';

export const RANKING_START_PROPERTY_IDS = [
  RANKING_START_TIME_PROPERTY_ID,
  LEGACY_RANKING_START_DATE_PROPERTY_ID,
] as const;

export const RANKING_END_PROPERTY_IDS = [RANKING_END_TIME_PROPERTY_ID, LEGACY_RANKING_END_DATE_PROPERTY_ID] as const;

export const RANKING_DATE_PROPERTY_IDS: ReadonlySet<string> = new Set<string>([
  ...RANKING_START_PROPERTY_IDS,
  ...RANKING_END_PROPERTY_IDS,
]);

export function resolveRankingDate(
  propertyIds: readonly string[],
  readValue: (propertyId: string) => string | null | undefined
): string {
  for (const propertyId of propertyIds) {
    const value = readValue(propertyId)?.trim();
    if (value) return value;
  }

  return '';
}
