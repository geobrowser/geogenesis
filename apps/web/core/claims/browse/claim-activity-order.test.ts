import { describe, expect, it } from 'vitest';

import type { ClaimTiming } from '~/core/debates/claim-timing';
import type { TranscriptClaim } from '~/core/debates/transcript-claims';

import { activityTime, mergeActivityRows, orderExtractedClaims } from './claim-activity-order';

function claim(id: string, overrides: Partial<TranscriptClaim> = {}): TranscriptClaim {
  return {
    id,
    text: `claim ${id}`,
    spaceId: 'space',
    blockId: 'block',
    publishedTiming: null,
    relationEntityId: null,
    restated: false,
    ...overrides,
  };
}

function timing(startMs: number, overrides: Partial<ClaimTiming> = {}): ClaimTiming {
  return { startMs, endMs: startMs + 1_000, confidence: 1, source: 'published', ...overrides };
}

describe('orderExtractedClaims', () => {
  it('orders timed claims by when they were said, not by arrival', () => {
    const claims = [claim('aa'), claim('bb'), claim('cc')];
    const timings = new Map([
      ['aa', timing(30_000)],
      ['bb', timing(10_000)],
      ['cc', timing(20_000)],
    ]);

    const { timed, untimed } = orderExtractedClaims(claims, timings);

    expect(timed.map(c => c.id)).toEqual(['bb', 'cc', 'aa']);
    expect(untimed).toEqual([]);
  });

  it('puts claims with no moment after the timed ones, in arrival order', () => {
    const claims = [claim('aa'), claim('bb'), claim('cc'), claim('dd')];
    const timings = new Map([
      ['cc', timing(20_000)],
      ['dd', timing(10_000)],
    ]);

    const { timed, untimed } = orderExtractedClaims(claims, timings);

    expect(timed.map(c => c.id)).toEqual(['dd', 'cc']);
    // Not sorted among themselves — there is nothing to sort them by.
    expect(untimed.map(c => c.id)).toEqual(['aa', 'bb']);
  });

  it('carries the timing onto the row so a caller need not look it up again', () => {
    const { timed } = orderExtractedClaims([claim('aa')], new Map([['aa', timing(5_000, { confidence: 0.6 })]]));

    expect(timed[0]!.timing).toEqual({ startMs: 5_000, endMs: 6_000, confidence: 0.6, source: 'published' });
  });

  it('gives an untimed row a null timing rather than leaving the field off', () => {
    const { untimed } = orderExtractedClaims([claim('aa')], new Map());

    expect(untimed[0]!.timing).toBeNull();
  });

  // `resolveClaimTimings` declines to time a restated claim, so it reaches here with no entry.
  it('leaves a restated claim in the tail', () => {
    const claims = [claim('aa', { restated: true }), claim('bb')];
    const { timed, untimed } = orderExtractedClaims(claims, new Map([['bb', timing(1_000)]]));

    expect(timed.map(c => c.id)).toEqual(['bb']);
    expect(untimed.map(c => c.id)).toEqual(['aa']);
  });

  it('matches timings keyed by canonical id regardless of the id format on the claim', () => {
    const hyphenated = '3e4a0955-699a-4c8f-813f-cc803a3335ba';
    const { timed } = orderExtractedClaims([claim(hyphenated)], new Map([['3e4a0955699a4c8f813fcc803a3335ba', timing(7_000)]]));

    expect(timed).toHaveLength(1);
    expect(timed[0]!.timing?.startMs).toBe(7_000);
  });

  it('breaks a shared start on id so the order does not shuffle between renders', () => {
    const claims = [claim('bb'), claim('aa')];
    const timings = new Map([
      ['aa', timing(10_000)],
      ['bb', timing(10_000)],
    ]);

    expect(orderExtractedClaims(claims, timings).timed.map(c => c.id)).toEqual(['aa', 'bb']);
  });
});

describe('mergeActivityRows', () => {
  const comments = [
    { id: 'c1', createdAt: '2026-09-20T10:00:00Z' },
    { id: 'c2', createdAt: '2026-09-22T10:00:00Z' },
  ];
  const debates = [
    { id: 'd1', createdAt: '2026-09-21T10:00:00Z' },
    { id: 'd2', createdAt: '2026-09-23T10:00:00Z' },
  ];

  it('interleaves both kinds newest first', () => {
    expect(mergeActivityRows(comments, debates, 'newest').map(entry => entry.row.id)).toEqual(['d2', 'c2', 'd1', 'c1']);
  });

  it('interleaves both kinds oldest first', () => {
    expect(mergeActivityRows(comments, debates, 'oldest').map(entry => entry.row.id)).toEqual(['c1', 'd1', 'c2', 'd2']);
  });

  it('tags each row so a caller can render the right component', () => {
    const merged = mergeActivityRows(comments, debates, 'newest');

    expect(merged.map(entry => entry.kind)).toEqual(['extra', 'comment', 'extra', 'comment']);
  });

  it('is a plain sort of one side when the other is empty', () => {
    expect(mergeActivityRows(comments, [], 'newest').map(entry => entry.row.id)).toEqual(['c2', 'c1']);
    expect(mergeActivityRows([], debates, 'oldest').map(entry => entry.row.id)).toEqual(['d1', 'd2']);
  });

  it('keeps comments ahead of extras published at the same instant', () => {
    const merged = mergeActivityRows(
      [{ id: 'c1', createdAt: '2026-09-20T10:00:00Z' }],
      [{ id: 'd1', createdAt: '2026-09-20T10:00:00Z' }],
      'newest'
    );

    expect(merged.map(entry => entry.row.id)).toEqual(['c1', 'd1']);
  });

  // A row with no usable date is not the newest thing that ever happened.
  it('sorts a row with an unreadable date to the end of a newest-first list', () => {
    const merged = mergeActivityRows(comments, [{ id: 'dx', createdAt: 'not a date' }], 'newest');

    expect(merged.map(entry => entry.row.id)).toEqual(['c2', 'c1', 'dx']);
  });
});

describe('activityTime', () => {
  it('reads an ISO timestamp', () => {
    expect(activityTime({ id: 'a', createdAt: '2026-09-20T10:00:00Z' })).toBe(Date.parse('2026-09-20T10:00:00Z'));
  });

  it('answers -Infinity rather than NaN for an unreadable one', () => {
    expect(activityTime({ id: 'a', createdAt: 'nope' })).toBe(Number.NEGATIVE_INFINITY);
  });
});
