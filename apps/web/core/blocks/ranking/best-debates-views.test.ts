import { describe, expect, it } from 'vitest';

import { DEBATES_SPACE_ID } from './best-debates';
import {
  type PeriodDebate,
  addDays,
  buildBestDebatesViewRows,
  buildDayCoverage,
  canComposeEditBlock,
  coverageSentence,
  dayLabel,
  isBestDebatesBlock,
  nyDayKey,
  nyDayStartMs,
  recentDayKeys,
} from './best-debates-views';

const BLOCK = 'b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0';

/** Noon in New York on a day key: inside the day whatever the offset. */
const noonNy = (key: string) => nyDayStartMs(key) + 12 * 3_600_000;

describe('isBestDebatesBlock', () => {
  it('matches only the injected block in the Debates space', () => {
    expect(isBestDebatesBlock(BLOCK, DEBATES_SPACE_ID, BLOCK)).toBe(true);
    // UUID formatting doesn't matter.
    expect(
      isBestDebatesBlock('b0b0b0b0-b0b0-b0b0-b0b0-b0b0b0b0b0b0', '9284477C-8FE7-4636-8698-994E2E517B32', BLOCK)
    ).toBe(true);
    expect(isBestDebatesBlock(BLOCK, 'another-space', BLOCK)).toBe(false);
    expect(isBestDebatesBlock('another-block', DEBATES_SPACE_ID, BLOCK)).toBe(false);
  });

  it('matches nothing while the block id is null (before GEO-3685)', () => {
    expect(isBestDebatesBlock(BLOCK, DEBATES_SPACE_ID)).toBe(false);
    expect(isBestDebatesBlock(BLOCK, DEBATES_SPACE_ID, null)).toBe(false);
  });
});

describe('canComposeEditBlock', () => {
  const on = { blockId: BLOCK, spaceId: DEBATES_SPACE_ID, bestDebatesBlockId: BLOCK };

  it('needs the flag and membership on the Best debates block', () => {
    expect(canComposeEditBlock({ ...on, flagOn: true, canEdit: true })).toBe(true);
    expect(canComposeEditBlock({ ...on, flagOn: false, canEdit: true })).toBe(false);
    expect(canComposeEditBlock({ ...on, flagOn: true, canEdit: false })).toBe(false);
  });

  it('allows every other block, and everything while the block id is null', () => {
    expect(canComposeEditBlock({ ...on, blockId: 'another', flagOn: false, canEdit: false })).toBe(true);
    expect(canComposeEditBlock({ blockId: BLOCK, spaceId: DEBATES_SPACE_ID, flagOn: false, canEdit: false })).toBe(
      true
    );
  });
});

describe('New York days', () => {
  it('puts late evening in New York on that day, not the UTC one', () => {
    // 11 Nov 2026 23:30 EST is 12 Nov 04:30 UTC.
    expect(nyDayKey(Date.UTC(2026, 10, 12, 4, 30))).toBe('2026-11-11');
    expect(nyDayKey(Date.UTC(2026, 10, 12, 5, 0))).toBe('2026-11-12');
  });

  it('starts each day at local midnight across DST changes', () => {
    expect(nyDayStartMs('2026-11-11')).toBe(Date.UTC(2026, 10, 11, 5)); // EST
    expect(nyDayStartMs('2026-07-04')).toBe(Date.UTC(2026, 6, 4, 4)); // EDT
    // Spring forward (8 Mar 2026): midnight is still EST; the next day starts on EDT.
    expect(nyDayStartMs('2026-03-08')).toBe(Date.UTC(2026, 2, 8, 5));
    expect(nyDayStartMs('2026-03-09')).toBe(Date.UTC(2026, 2, 9, 4));
    // Fall back (1 Nov 2026).
    expect(nyDayStartMs('2026-11-01')).toBe(Date.UTC(2026, 10, 1, 4));
    expect(nyDayStartMs('2026-11-02')).toBe(Date.UTC(2026, 10, 2, 5));
  });

  it('lists the last seven days newest first, across a month end', () => {
    expect(recentDayKeys('2026-12-03')).toEqual([
      '2026-12-03',
      '2026-12-02',
      '2026-12-01',
      '2026-11-30',
      '2026-11-29',
      '2026-11-28',
      '2026-11-27',
    ]);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('labels Today, Yesterday, then the date', () => {
    expect(dayLabel('2026-11-11', '2026-11-11')).toBe('Today');
    expect(dayLabel('2026-11-10', '2026-11-11')).toBe('Yesterday');
    expect(dayLabel('2026-11-09', '2026-11-11')).toBe('Mon, Nov 9');
  });
});

describe('buildBestDebatesViewRows', () => {
  const today = '2026-11-11';
  // Team order across all time: d-old was published 20 days ago.
  const teamOrder = ['d_old', 'd_today_b', 'd_yesterday', 'd_today_a'];
  // The window read, in Best order.
  const periodDebates: PeriodDebate[] = [
    { id: 'd_today_unranked_1', name: 'U1', createdAtMs: noonNy(today) },
    { id: 'd_today_a', name: 'A', createdAtMs: noonNy(today) },
    { id: 'd_yesterday', name: 'Y', createdAtMs: noonNy(addDays(today, -1)) },
    { id: 'd_today_unranked_2', name: 'U2', createdAtMs: noonNy(today) },
    { id: 'd_today_b', name: 'B', createdAtMs: noonNy(today) },
    { id: 'd_week_unranked', name: 'W', createdAtMs: noonNy(addDays(today, -6)) },
    // Published eight days ago: outside This week.
    { id: 'd_eight_days', name: 'E', createdAtMs: noonNy(addDays(today, -7)) },
  ];
  const ranked = new Set(teamOrder);
  const ready = (id: string) => (ranked.has(id) ? 1 : 0);

  it('keeps the team order in every view, so places agree', () => {
    const day = buildBestDebatesViewRows({
      period: { view: 'day', dayKey: today },
      teamOrder,
      periodDebates,
      rankerCount: ready,
    });
    const week = buildBestDebatesViewRows({
      period: { view: 'week', todayKey: today },
      teamOrder,
      periodDebates,
      rankerCount: ready,
    });
    const all = buildBestDebatesViewRows({ period: { view: 'all' }, teamOrder, periodDebates, rankerCount: ready });

    expect(day.ranked).toEqual(['d_today_b', 'd_today_a']);
    expect(week.ranked).toEqual(['d_today_b', 'd_yesterday', 'd_today_a']);
    expect(all.ranked).toEqual(teamOrder);
    // Relative order agrees: b above a everywhere.
    for (const view of [day.ranked, week.ranked, all.ranked]) {
      expect(view.indexOf('d_today_b')).toBeLessThan(view.indexOf('d_today_a'));
    }
  });

  it('lists the unranked debates of the day and week in Best order, never in All time', () => {
    const day = buildBestDebatesViewRows({
      period: { view: 'day', dayKey: today },
      teamOrder,
      periodDebates,
      rankerCount: ready,
    });
    const week = buildBestDebatesViewRows({
      period: { view: 'week', todayKey: today },
      teamOrder,
      periodDebates,
      rankerCount: ready,
    });
    const all = buildBestDebatesViewRows({ period: { view: 'all' }, teamOrder, periodDebates, rankerCount: ready });

    expect(day.notRanked).toEqual(['d_today_unranked_1', 'd_today_unranked_2']);
    expect(week.notRanked).toEqual(['d_today_unranked_1', 'd_today_unranked_2', 'd_week_unranked']);
    expect(all.notRanked).toEqual([]);
    expect(all.ranked).not.toContain('d_today_unranked_1');
  });

  it('never calls a debate unranked off a read that is not ready', () => {
    const day = buildBestDebatesViewRows({
      period: { view: 'day', dayKey: today },
      teamOrder,
      periodDebates,
      rankerCount: () => null,
    });

    expect(day.notRanked).toEqual([]);
    expect(day.unplacedUnknown).toEqual(['d_today_unranked_1', 'd_today_unranked_2']);
    // The team order still stands on its own.
    expect(day.ranked).toEqual(['d_today_b', 'd_today_a']);
  });

  it('holds a debate someone ranked but the indexer has not placed yet apart from Not ranked yet', () => {
    const day = buildBestDebatesViewRows({
      period: { view: 'day', dayKey: today },
      teamOrder,
      periodDebates,
      rankerCount: id => (id === 'd_today_unranked_2' || ranked.has(id) ? 1 : 0),
    });

    expect(day.awaitingPlace).toEqual(['d_today_unranked_2']);
    expect(day.notRanked).toEqual(['d_today_unranked_1']);
  });

  it('matches ids whatever their formatting', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const day = buildBestDebatesViewRows({
      period: { view: 'day', dayKey: today },
      teamOrder: [id.toUpperCase()],
      periodDebates: [{ id: 'aaaaaaaabbbbccccddddeeeeeeeeeeee', name: 'X', createdAtMs: noonNy(today) }],
      rankerCount: () => 1,
    });
    expect(day.ranked).toEqual(['aaaaaaaabbbbccccddddeeeeeeeeeeee']);
    expect(day.notRanked).toEqual([]);
  });
});

describe('coverage', () => {
  it('counts each day of the strip', () => {
    const today = '2026-11-11';
    const coverage = buildDayCoverage({
      dayKeys: recentDayKeys(today),
      teamOrder: ['a'],
      periodDebates: [
        { id: 'a', name: null, createdAtMs: noonNy(today) },
        { id: 'b', name: null, createdAtMs: noonNy(today) },
        { id: 'c', name: null, createdAtMs: noonNy(today) },
        { id: 'd', name: null, createdAtMs: noonNy(addDays(today, -2)) },
      ],
      // b has a ranker but no place yet: it still counts as covered.
      rankerCount: id => (id === 'a' || id === 'b' ? 1 : 0),
    });

    expect(coverage[0]).toEqual({ dayKey: today, ranked: 2, total: 3 });
    expect(coverage[1]).toEqual({ dayKey: addDays(today, -1), ranked: 0, total: 0 });
    expect(coverage[2]).toEqual({ dayKey: addDays(today, -2), ranked: 0, total: 1 });
    expect(coverage).toHaveLength(7);
  });

  it('reads like the spec', () => {
    expect(coverageSentence({ ranked: 3, total: 6 })).toBe('3 of 6 debates from today are ranked');
    expect(coverageSentence({ ranked: 0, total: 1 })).toBe('0 of 1 debate from today is ranked');
    expect(coverageSentence({ ranked: 0, total: 0 })).toBe('No debates from today yet');
  });
});
