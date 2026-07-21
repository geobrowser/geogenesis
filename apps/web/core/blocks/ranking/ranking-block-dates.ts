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

const LEGACY_DATE_PROPERTY_IDS: ReadonlySet<string> = new Set<string>([
  LEGACY_RANKING_START_DATE_PROPERTY_ID,
  LEGACY_RANKING_END_DATE_PROPERTY_ID,
]);

/**
 * A resolved ranking date paired with how it should be compared.
 */
export type RankingDate = {
  value: string;
  isDateOnly: boolean;
};

export const EMPTY_RANKING_DATE: RankingDate = { value: '', isDateOnly: false };

export function resolveRankingDateValue(
  propertyIds: readonly string[],
  readValue: (propertyId: string) => string | null | undefined
): RankingDate {
  for (const propertyId of propertyIds) {
    const value = readValue(propertyId)?.trim();
    if (value) return { value, isDateOnly: LEGACY_DATE_PROPERTY_IDS.has(propertyId) };
  }

  return EMPTY_RANKING_DATE;
}

// Legacy date-only values were stored either as a bare "YYYY-MM-DD" or as the midnight-UTC ISO string the old date picker serialized to.
const DATE_ONLY_STRING = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/;

export function toRankingDate(value: string): RankingDate {
  const trimmed = value.trim();
  return { value: trimmed, isDateOnly: DATE_ONLY_STRING.test(trimmed) };
}

export function resolveRankingDate(
  propertyIds: readonly string[],
  readValue: (propertyId: string) => string | null | undefined
): string {
  return resolveRankingDateValue(propertyIds, readValue).value;
}
