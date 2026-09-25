import { describe, expect, it } from 'vitest';

import { decodeDebateClaimCounts } from './use-debate-claim-counts';

/**
 * This aggregate replaced reading the count off each debate's transcript, which is the expensive
 * fetch the collapse control exists to avoid and which ran whether or not the row was expanded. The
 * two agree: measured against testnet on 2026-09-25, 27 of 27 debates across the fifteen busiest
 * claims reported the same number from `Sources` as from the transcript.
 */
describe('decodeDebateClaimCounts', () => {
  it('keys counts by canonical id, so a hyphenated lookup still finds them', () => {
    const counts = decodeDebateClaimCounts({
      entities: [{ id: '3e4a0955-699a-4c8f-813f-cc803a3335ba', extracted: { totalCount: 22 } }],
    });

    expect(counts.get('3e4a0955699a4c8f813fcc803a3335ba')).toBe(22);
  });

  it('reads a debate that produced no claims as zero rather than leaving it out', () => {
    const counts = decodeDebateClaimCounts({ entities: [{ id: 'aa', extracted: { totalCount: 0 } }] });

    expect(counts.get('aa')).toBe(0);
  });

  // A missing aggregate is the server declining to count, not a claim that there are none — but a
  // row has to render something, and zero is what it already shows while it waits.
  it('falls back to zero when the aggregate is absent', () => {
    const counts = decodeDebateClaimCounts({ entities: [{ id: 'aa', extracted: null }, { id: 'bb' }] });

    expect(counts.get('aa')).toBe(0);
    expect(counts.get('bb')).toBe(0);
  });

  it('skips rows the API returned as null', () => {
    const counts = decodeDebateClaimCounts({
      entities: [null, { id: null }, { id: 'aa', extracted: { totalCount: 2 } }],
    });

    expect([...counts.keys()]).toEqual(['aa']);
  });

  it('is an empty map when nothing came back', () => {
    expect(decodeDebateClaimCounts({}).size).toBe(0);
    expect(decodeDebateClaimCounts({ entities: null }).size).toBe(0);
  });
});
