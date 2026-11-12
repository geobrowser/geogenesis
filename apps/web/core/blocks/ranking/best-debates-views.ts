import { normId } from '~/core/utils/norm-id';

import { BEST_DEBATES_BLOCK_ID, DEBATES_SPACE_ID } from './best-debates';

/**
 * Day, This week and All time on the Debates space's Best debates block (GEO-3677).
 *
 * All three are cuts of one order: the team order the indexer projects onto the block as
 * RANK_POSITION relations. Day and This week only filter it by each debate's published date (its
 * entity `createdAt`, as a New York day), so a debate's place agrees across the views. Debates of
 * the period that nobody has ranked are listed separately, in Explore's Best order, and never in
 * All time.
 *
 * Everything here is pure; the reads live in `fetch-best-debates-window.ts` and the UI in
 * `partials/blocks/table/best-debates-block.tsx`.
 */

export type BestDebatesView = 'day' | 'week' | 'all';

export const BEST_DEBATES_VIEWS: ReadonlyArray<{ value: BestDebatesView; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
];

/** "Today" is the New York day (decided 11 Nov). */
export const BEST_DEBATES_TIME_ZONE = 'America/New_York';

/** The day strip and This week both cover today and the six days before it. */
export const BEST_DEBATES_WINDOW_DAYS = 7;

/**
 * The query string the "Rank the rest" link adds to the ranking screen, so it opens on the team
 * column's To rank list. GEO-3678 builds that list and reads this param.
 */
export const BEST_DEBATES_TEAM_VIEW_PARAM = 'team';
export const BEST_DEBATES_TEAM_VIEW_TO_RANK = 'to-rank';

/**
 * Whether a ranking block is the Debates space's Best debates block. Both ids must match, so
 * nothing new shows on any other block or in any other space, and nothing at all while the block
 * id is still null (GEO-3685 sets it). `bestDebatesBlockId` is injectable for tests.
 */
export function isBestDebatesBlock(
  blockId: string | null | undefined,
  spaceId: string | null | undefined,
  bestDebatesBlockId: string | null = BEST_DEBATES_BLOCK_ID
): boolean {
  if (!bestDebatesBlockId || !blockId || !spaceId) return false;
  return normId(blockId) === normId(bestDebatesBlockId) && normId(spaceId) === normId(DEBATES_SPACE_ID);
}

/**
 * The one rule for composing a ballot in edit mode on a ranking block (GEO-3677). On the Best
 * debates block it needs the `debateRankings` flag and membership of the Debates space (member or
 * editor); every other block is unaffected. Composing sends a background membership request
 * (#3099) and publishes a ballot, so every edit entry point checks this: the block's buttons,
 * `openRankingCompose`, and the compose screen itself (a pasted compose URL).
 */
export function canComposeEditBlock({
  blockId,
  spaceId,
  flagOn,
  canEdit,
  bestDebatesBlockId = BEST_DEBATES_BLOCK_ID,
}: {
  blockId: string | null | undefined;
  spaceId: string | null | undefined;
  /** The `debateRankings` feature flag. */
  flagOn: boolean;
  /** Member or editor of the block's space (`useAccessControl(spaceId).canEdit`). */
  canEdit: boolean;
  /** Tests only: stands in for `BEST_DEBATES_BLOCK_ID`. */
  bestDebatesBlockId?: string | null;
}): boolean {
  return !isBestDebatesBlock(blockId, spaceId, bestDebatesBlockId) || (flagOn && canEdit);
}

// ---------------------------------------------------------------------------------------------
// New York days. A day key is 'YYYY-MM-DD'.

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BEST_DEBATES_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const wallClockFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BEST_DEBATES_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** The New York day an instant falls on. */
export function nyDayKey(ms: number): string {
  const parts = dayKeyFormatter.formatToParts(new Date(ms));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseDayKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

/** The day `days` after `key` (negative for before). Calendar arithmetic, no time zone involved. */
export function addDays(key: string, days: number): string {
  const { y, m, d } = parseDayKey(key);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** New York's offset from UTC at an instant, in ms (negative: behind UTC). */
function nyOffsetMs(ms: number): number {
  const parts = wallClockFormatter.formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wallAsUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant a New York day starts (local midnight), DST included. */
export function nyDayStartMs(key: string): number {
  const { y, m, d } = parseDayKey(key);
  const midnightAsUtc = Date.UTC(y, m - 1, d);
  // Midnight is never inside a DST change (New York changes at 2am), so two passes settle it.
  let start = midnightAsUtc - nyOffsetMs(midnightAsUtc);
  start = midnightAsUtc - nyOffsetMs(start);
  return start;
}

/** Today and the days before it, newest first. */
export function recentDayKeys(todayKey: string, count = BEST_DEBATES_WINDOW_DAYS): string[] {
  return Array.from({ length: count }, (_, index) => addDays(todayKey, -index));
}

const shortDayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

/** "Today", "Yesterday", then "Mon, Nov 9". */
export function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today';
  if (key === addDays(todayKey, -1)) return 'Yesterday';
  const { y, m, d } = parseDayKey(key);
  return shortDayFormatter.format(new Date(Date.UTC(y, m - 1, d)));
}

// ---------------------------------------------------------------------------------------------
// The views.

/** A debate published in the period, as the Best-ordered window read returns it. */
export type PeriodDebate = {
  /** Normalized entity id. */
  id: string;
  name: string | null;
  createdAtMs: number;
};

export type BestDebatesPeriod = { view: 'all' } | { view: 'week'; todayKey: string } | { view: 'day'; dayKey: string };

export function periodContains(period: BestDebatesPeriod, createdAtMs: number): boolean {
  if (period.view === 'all') return true;
  const key = nyDayKey(createdAtMs);
  if (period.view === 'day') return key === period.dayKey;
  return key <= period.todayKey && key > addDays(period.todayKey, -BEST_DEBATES_WINDOW_DAYS);
}

export type BestDebatesViewRows = {
  /** Debates with a team place, in team order. Their 1-based place within the view is index + 1. */
  ranked: string[];
  /**
   * Debates someone has ranked whose team place hasn't been projected yet (the indexer runs
   * behind a fresh ballot). Listed after `ranked`, unnumbered, in Best order.
   */
  awaitingPlace: string[];
  /** Debates nobody has ranked, in Best order. Always empty for All time. */
  notRanked: string[];
  /**
   * Debates with no team place whose ranker count isn't known (the ballot reader is loading or
   * failed), in Best order. Never shown as "Not ranked yet": that needs a ready read.
   */
  unplacedUnknown: string[];
};

/**
 * Splits a period's debates into the three lists.
 *
 * @param teamOrder the block's RANK_POSITION order (all time).
 * @param periodDebates the period's debates in Best order (ignored for All time).
 * @param rankerCount from the shared ballot reader: null until its read is ready, so a debate is
 *   only called "Not ranked yet" on a ready read that found no ranker.
 */
export function buildBestDebatesViewRows({
  period,
  teamOrder,
  periodDebates,
  rankerCount,
}: {
  period: BestDebatesPeriod;
  teamOrder: readonly string[];
  periodDebates: readonly PeriodDebate[];
  rankerCount: (entityId: string) => number | null;
}): BestDebatesViewRows {
  const team = dedupeNormalized(teamOrder);

  if (period.view === 'all') return { ranked: team, awaitingPlace: [], notRanked: [], unplacedUnknown: [] };

  const inPeriod = periodDebates.filter(debate => periodContains(period, debate.createdAtMs));
  const inPeriodIds = new Set(inPeriod.map(debate => normId(debate.id)));
  const placed = new Set(team);

  const ranked = team.filter(id => inPeriodIds.has(id));
  const awaitingPlace: string[] = [];
  const notRanked: string[] = [];
  const unplacedUnknown: string[] = [];
  const seen = new Set<string>();
  for (const debate of inPeriod) {
    const id = normId(debate.id);
    if (seen.has(id) || placed.has(id)) continue;
    seen.add(id);
    const count = rankerCount(id);
    if (count == null) unplacedUnknown.push(id);
    else if (count > 0) awaitingPlace.push(id);
    else notRanked.push(id);
  }

  return { ranked, awaitingPlace, notRanked, unplacedUnknown };
}

export type DayCoverage = { dayKey: string; ranked: number; total: number };

/**
 * "N of M ranked" for each day: M is the day's debates, N those with a team place or at least one
 * ranker. Only meaningful on a ready ballot read; callers show M alone otherwise.
 */
export function buildDayCoverage({
  dayKeys,
  teamOrder,
  periodDebates,
  rankerCount,
}: {
  dayKeys: readonly string[];
  teamOrder: readonly string[];
  periodDebates: readonly PeriodDebate[];
  rankerCount: (entityId: string) => number | null;
}): DayCoverage[] {
  const placed = new Set(dedupeNormalized(teamOrder));
  const byDay = new Map<string, { ranked: number; total: number }>(dayKeys.map(key => [key, { ranked: 0, total: 0 }]));
  const seen = new Set<string>();
  for (const debate of periodDebates) {
    const id = normId(debate.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const day = byDay.get(nyDayKey(debate.createdAtMs));
    if (!day) continue;
    day.total += 1;
    if (placed.has(id) || (rankerCount(id) ?? 0) > 0) day.ranked += 1;
  }
  return dayKeys.map(dayKey => ({ dayKey, ...byDay.get(dayKey)! }));
}

/** "3 of 6 debates from today are ranked". */
export function coverageSentence({ ranked, total }: { ranked: number; total: number }): string {
  if (total === 0) return 'No debates from today yet';
  if (total === 1) return `${ranked} of 1 debate from today is ranked`;
  return `${ranked} of ${total} debates from today are ranked`;
}

export function rankerCountLabel(count: number): string {
  return count === 1 ? '1 ranker' : `${count} rankers`;
}

function dedupeNormalized(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = normId(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
