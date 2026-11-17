import { describe, expect, it } from 'vitest';

import {
  DEBATE_CLAIMS_PROPERTY_ID,
  DEBATE_OPPOSED_BY_PROPERTY_ID,
  DEBATE_SUPPORTED_BY_PROPERTY_ID,
} from '~/core/debates/ontology';

import {
  NO_RANKING_FILTERS,
  createdAtClause,
  hasRankingFilters,
  parseRecorded,
  rankDayParams,
  rankingFilterEntityClauses,
  readRankingFilters,
  recordedLabel,
  recordedPhrase,
  recordedRangeMs,
  writeRankingFilters,
} from './best-debates-ranking-filters';
import { nyDayStartMs } from './best-debates-views';

const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DASHED_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TODAY = '2026-11-16';

describe('recorded param', () => {
  it('reads a day, This week and a range, and writes them back the same', () => {
    for (const raw of ['2026-11-12', 'week', '2026-10-01..2026-10-31']) {
      const params = writeRankingFilters(new URLSearchParams(), {
        ...NO_RANKING_FILTERS,
        recorded: parseRecorded(raw),
      });
      expect(params.get('recorded')).toBe(raw);
    }
  });

  it('turns a backwards range round and a one-day range into that day', () => {
    expect(parseRecorded('2026-11-09..2026-11-01')).toEqual({
      kind: 'range',
      fromKey: '2026-11-01',
      toKey: '2026-11-09',
    });
    expect(parseRecorded('2026-11-09..2026-11-09')).toEqual({ kind: 'day', dayKey: '2026-11-09' });
  });

  it('drops anything malformed rather than guessing', () => {
    for (const raw of [
      '',
      'yesterday',
      '2026-02-30',
      '2026-11-1',
      '2026-11-01..',
      '..2026-11-01',
      '2026-13-01..2026-11-01',
    ]) {
      expect(parseRecorded(raw)).toBeNull();
    }
  });
});

describe('readRankingFilters / writeRankingFilters', () => {
  it('reads debaters (deduped, normalized) and a claim, dropping ids that are not ids', () => {
    const filters = readRankingFilters(
      new URLSearchParams(`debaters=${DASHED_A},${A},nope,${B}&claim=${B}&recorded=week`)
    );
    expect(filters).toEqual({ recorded: { kind: 'week' }, debaterIds: [A, B], claimId: B });
    expect(readRankingFilters(new URLSearchParams('claim=../../etc'))).toEqual(NO_RANKING_FILTERS);
  });

  it('keeps the other params and takes off the filters that are off', () => {
    const start = new URLSearchParams(`team=to-rank&debaters=${A}&claim=${B}&recorded=week&blockId=x`);
    const next = writeRankingFilters(start, { recorded: null, debaterIds: [], claimId: null });
    expect(next.toString()).toBe('team=to-rank&blockId=x');
  });

  it('says whether any filter is on', () => {
    expect(hasRankingFilters(NO_RANKING_FILTERS)).toBe(false);
    expect(hasRankingFilters({ ...NO_RANKING_FILTERS, claimId: A })).toBe(true);
    expect(hasRankingFilters({ ...NO_RANKING_FILTERS, debaterIds: [A] })).toBe(true);
  });

  it('gives the block’s Rank this day link its params', () => {
    expect(rankDayParams('2026-11-12')).toEqual({ recorded: '2026-11-12' });
  });
});

describe('recordedRangeMs', () => {
  it('covers a New York day, midnight to midnight', () => {
    expect(recordedRangeMs({ kind: 'day', dayKey: '2026-11-12' }, TODAY)).toEqual({
      fromMs: Date.UTC(2026, 10, 12, 5),
      toMs: Date.UTC(2026, 10, 13, 5),
    });
  });

  it('is 25 hours on the day the clocks go back', () => {
    const { fromMs, toMs } = recordedRangeMs({ kind: 'day', dayKey: '2026-11-01' }, TODAY);
    expect(toMs - fromMs).toBe(25 * 3_600_000);
  });

  it('makes This week today and the six days before it, as the block does', () => {
    expect(recordedRangeMs({ kind: 'week' }, TODAY)).toEqual({
      fromMs: nyDayStartMs('2026-11-10'),
      toMs: nyDayStartMs('2026-11-17'),
    });
  });

  it('includes both ends of a range', () => {
    expect(recordedRangeMs({ kind: 'range', fromKey: '2026-10-01', toKey: '2026-10-31' }, TODAY)).toEqual({
      fromMs: nyDayStartMs('2026-10-01'),
      toMs: nyDayStartMs('2026-11-01'),
    });
  });
});

describe('labels', () => {
  it('names the filter for the menu and for a sentence', () => {
    expect(recordedLabel({ kind: 'day', dayKey: TODAY }, TODAY)).toBe('Today');
    expect(recordedLabel({ kind: 'week' }, TODAY)).toBe('This week');
    expect(recordedLabel({ kind: 'range', fromKey: '2026-11-03', toKey: '2026-11-09' }, TODAY)).toBe('Nov 3 – Nov 9');
    expect(recordedPhrase({ kind: 'day', dayKey: '2026-11-15' }, TODAY)).toBe('yesterday');
    expect(recordedPhrase({ kind: 'day', dayKey: '2026-11-09' }, TODAY)).toBe('on Mon, Nov 9');
    expect(recordedPhrase({ kind: 'range', fromKey: '2026-11-03', toKey: '2026-11-09' }, TODAY)).toBe(
      'between Nov 3 and Nov 9'
    );
  });
});

describe('rankingFilterEntityClauses', () => {
  const filters = { recorded: { kind: 'week' as const }, debaterIds: [A, B], claimId: B };
  const window = { fromMs: 1_000_000, toMs: 2_000_000 };

  it('ANDs the window, any of the debaters on either side, and the claim', () => {
    expect(rankingFilterEntityClauses({ filters, window })).toEqual([
      { createdAt: { greaterThanOrEqualTo: '1000', lessThan: '2000' } },
      {
        relations: {
          some: {
            typeId: { in: [DEBATE_SUPPORTED_BY_PROPERTY_ID, DEBATE_OPPOSED_BY_PROPERTY_ID] },
            toEntityId: { in: [A, B] },
          },
        },
      },
      { relations: { some: { typeId: { is: DEBATE_CLAIMS_PROPERTY_ID }, toEntityId: { is: B } } } },
    ]);
  });

  it('leaves a menu’s own dimension out of its counts', () => {
    expect(rankingFilterEntityClauses({ filters, window: null, omit: 'debaters' })).toHaveLength(1);
    expect(rankingFilterEntityClauses({ filters, window: null, omit: 'claim' })).toHaveLength(1);
  });

  it('leaves an open window without an upper bound', () => {
    expect(createdAtClause({ fromMs: 5000, toMs: Infinity })).toEqual({ createdAt: { greaterThanOrEqualTo: '5' } });
  });
});
