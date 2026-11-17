import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
} from '~/core/debates/ontology';
import { normId } from '~/core/utils/norm-id';

import { BEST_DEBATES_WINDOW_DAYS, addDays, dayLabel, nyDayStartMs } from './best-debates-views';

/**
 * The Best debates ranking screen's narrowing filters (GEO-3774): when a debate was recorded, who
 * debated it, and which claim it was on. They only narrow what the team column lists; placing or
 * grading a debate always works on the ranker's whole ranking.
 *
 * They live in the URL (reload and share keep them), next to `?team=to-rank`. Pure, so the block's
 * "Rank this day" link, the screen and the tests share one reading of them.
 *
 * "Recorded" is the debate entity's `createdAt` as a New York day, the same rule as the block's day
 * strip and This week (`best-debates-views.ts`).
 */

export const BEST_DEBATES_RECORDED_PARAM = 'recorded';
export const BEST_DEBATES_DEBATERS_PARAM = 'debaters';
export const BEST_DEBATES_CLAIM_PARAM = 'claim';

/** `recorded=week` */
const RECORDED_WEEK = 'week';
/** `recorded=2026-11-01..2026-11-09`, both days included. */
const RANGE_SEPARATOR = '..';

export type RecordedFilter =
  | { kind: 'day'; dayKey: string }
  /** Today and the six days before it, as on the block. */
  | { kind: 'week' }
  | { kind: 'range'; fromKey: string; toKey: string };

export type RankingFilters = {
  recorded: RecordedFilter | null;
  /** Any of these people took part (OR). Normalized personal space ids. */
  debaterIds: string[];
  /** Every debate on this claim. Normalized entity id. */
  claimId: string | null;
};

export const NO_RANKING_FILTERS: RankingFilters = { recorded: null, debaterIds: [], claimId: null };

export function hasRankingFilters(filters: RankingFilters): boolean {
  return Boolean(filters.recorded) || filters.debaterIds.length > 0 || Boolean(filters.claimId);
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const ENTITY_ID = /^[0-9a-f]{32}$/;

/** A real calendar day written as 'YYYY-MM-DD' (rejects 2026-02-30 and the like). */
export function isDayKey(value: string): boolean {
  if (!DAY_KEY.test(value)) return false;
  return addDays(value, 0) === value;
}

function cleanId(raw: string | null | undefined): string | null {
  const id = normId((raw ?? '').trim());
  return ENTITY_ID.test(id) ? id : null;
}

/** Reads a `recorded` value; anything malformed is no filter. A range written backwards is turned round. */
export function parseRecorded(raw: string | null | undefined): RecordedFilter | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  if (value === RECORDED_WEEK) return { kind: 'week' };
  if (value.includes(RANGE_SEPARATOR)) {
    const [from, to] = value.split(RANGE_SEPARATOR);
    if (!from || !to || !isDayKey(from) || !isDayKey(to)) return null;
    return recordedBetween(from, to);
  }
  return isDayKey(value) ? { kind: 'day', dayKey: value } : null;
}

/** A filter covering both days: one day when they are the same, the earlier day first otherwise. */
export function recordedBetween(a: string, b: string): RecordedFilter {
  if (a === b) return { kind: 'day', dayKey: a };
  return a < b ? { kind: 'range', fromKey: a, toKey: b } : { kind: 'range', fromKey: b, toKey: a };
}

export function formatRecorded(filter: RecordedFilter): string {
  if (filter.kind === 'week') return RECORDED_WEEK;
  if (filter.kind === 'day') return filter.dayKey;
  return `${filter.fromKey}${RANGE_SEPARATOR}${filter.toKey}`;
}

export function sameRecorded(a: RecordedFilter | null, b: RecordedFilter | null): boolean {
  if (!a || !b) return a === b;
  return formatRecorded(a) === formatRecorded(b);
}

type ParamReader = { get: (name: string) => string | null };

/** The filters a URL carries. Junk (bad dates, ids that aren't ids) is dropped, never guessed at. */
export function readRankingFilters(params: ParamReader | null | undefined): RankingFilters {
  if (!params) return NO_RANKING_FILTERS;
  const debaterIds = [
    ...new Set(
      (params.get(BEST_DEBATES_DEBATERS_PARAM) ?? '')
        .split(',')
        .map(cleanId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
  return {
    recorded: parseRecorded(params.get(BEST_DEBATES_RECORDED_PARAM)),
    debaterIds,
    claimId: cleanId(params.get(BEST_DEBATES_CLAIM_PARAM)),
  };
}

/** `params` with the filters written in (and the ones that are off taken out). Other params are kept. */
export function writeRankingFilters(params: URLSearchParams, filters: RankingFilters): URLSearchParams {
  const next = new URLSearchParams(params);
  if (filters.recorded) next.set(BEST_DEBATES_RECORDED_PARAM, formatRecorded(filters.recorded));
  else next.delete(BEST_DEBATES_RECORDED_PARAM);
  const debaterIds = [...new Set(filters.debaterIds.map(normId).filter(Boolean))];
  if (debaterIds.length > 0) next.set(BEST_DEBATES_DEBATERS_PARAM, debaterIds.join(','));
  else next.delete(BEST_DEBATES_DEBATERS_PARAM);
  if (filters.claimId) next.set(BEST_DEBATES_CLAIM_PARAM, normId(filters.claimId));
  else next.delete(BEST_DEBATES_CLAIM_PARAM);
  return next;
}

/** The extra params the block's "Rank this day" link adds to the ranking screen's URL. */
export function rankDayParams(dayKey: string): Record<string, string> {
  return { [BEST_DEBATES_RECORDED_PARAM]: formatRecorded({ kind: 'day', dayKey }) };
}

export type MsRange = { fromMs: number; toMs: number };

/** The instants a filter covers, [fromMs, toMs): New York midnights, DST included. */
export function recordedRangeMs(filter: RecordedFilter, todayKey: string): MsRange {
  if (filter.kind === 'day')
    return { fromMs: nyDayStartMs(filter.dayKey), toMs: nyDayStartMs(addDays(filter.dayKey, 1)) };
  if (filter.kind === 'week') {
    return {
      fromMs: nyDayStartMs(addDays(todayKey, -(BEST_DEBATES_WINDOW_DAYS - 1))),
      toMs: nyDayStartMs(addDays(todayKey, 1)),
    };
  }
  return { fromMs: nyDayStartMs(filter.fromKey), toMs: nyDayStartMs(addDays(filter.toKey, 1)) };
}

const monthDayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

function monthDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return monthDayFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Today", "Mon, Nov 9", "This week", "Nov 3 – Nov 9". */
export function recordedLabel(filter: RecordedFilter, todayKey: string): string {
  if (filter.kind === 'week') return 'This week';
  if (filter.kind === 'day') return dayLabel(filter.dayKey, todayKey);
  return `${monthDay(filter.fromKey)} – ${monthDay(filter.toKey)}`;
}

/**
 * The `createdAt` clause for a range: unix seconds as strings, as the API takes them. An open end
 * (`toMs: Infinity`, To rank's own "the last 7 days") has no upper bound.
 */
export function createdAtClause({ fromMs, toMs }: MsRange): Record<string, unknown> {
  return {
    createdAt: {
      greaterThanOrEqualTo: String(Math.floor(fromMs / 1000)),
      ...(Number.isFinite(toMs) ? { lessThan: String(Math.ceil(toMs / 1000)) } : {}),
    },
  };
}

export const DEBATER_PROPERTY_IDS: readonly string[] = [DEBATE_SUPPORTED_BY_PROPERTY_ID, DEBATE_OPPOSED_BY_PROPERTY_ID];

/** Took part in the debate: a Supported by or Opposed by relation to any of `debaterIds`. */
export function debatersClause(debaterIds: readonly string[]): Record<string, unknown> {
  return {
    relations: {
      some: { typeId: { in: [...DEBATER_PROPERTY_IDS] }, toEntityId: { in: debaterIds.map(normId) } },
    },
  };
}

/** Debated this claim: any of the debate's Claims relations points at it. */
export function claimClause(claimId: string): Record<string, unknown> {
  return { relations: { some: { typeId: { is: DEBATE_CLAIMS_PROPERTY_ID }, toEntityId: { is: normId(claimId) } } } };
}

/**
 * The filters as entity clauses (AND), for the team column's server reads and facet counts.
 * `window` is the recorded range to apply (the caller decides: the filter's range, or To rank's
 * own window); `omit` leaves one dimension out, for that dimension's own menu counts.
 */
export function rankingFilterEntityClauses({
  filters,
  window,
  omit,
}: {
  filters: RankingFilters;
  window: MsRange | null;
  omit?: 'debaters' | 'claim';
}): Record<string, unknown>[] {
  const and: Record<string, unknown>[] = [];
  if (window) and.push(createdAtClause(window));
  if (omit !== 'debaters' && filters.debaterIds.length > 0) and.push(debatersClause(filters.debaterIds));
  if (omit !== 'claim' && filters.claimId) and.push(claimClause(filters.claimId));
  return and;
}

/** For a sentence: "today", "yesterday", "on Mon, Nov 9", "this week", "between Nov 3 and Nov 9". */
export function recordedPhrase(filter: RecordedFilter, todayKey: string): string {
  if (filter.kind === 'week') return 'this week';
  if (filter.kind === 'range') return `between ${monthDay(filter.fromKey)} and ${monthDay(filter.toKey)}`;
  if (filter.dayKey === todayKey) return 'today';
  if (filter.dayKey === addDays(todayKey, -1)) return 'yesterday';
  return `on ${dayLabel(filter.dayKey, todayKey)}`;
}

/**
 * The window To rank reads under the screen's filters: the recorded range when one is picked (older
 * than 7 days too), else To rank's own last 7 days, open-ended.
 */
export function toRankWindow(filters: RankingFilters, todayKey: string, nowMs: number): MsRange {
  if (filters.recorded) return recordedRangeMs(filters.recorded, todayKey);
  return { fromMs: nowMs - BEST_DEBATES_WINDOW_DAYS * 24 * 60 * 60 * 1000, toMs: Infinity };
}
