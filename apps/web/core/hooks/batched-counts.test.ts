import { describe, expect, it } from 'vitest';

import { batchedCounts, countFor } from './batched-counts';

/**
 * The three states a batched aggregate can be in, and why the third one is not zero.
 *
 * The rows that read these counts hide their branch when the number is zero. Reading an absent entry
 * as zero therefore hid a debate's extracted claims and its whole discussion — a flash while the
 * request was in flight, and permanently once it failed, with no control left to expand them.
 */
describe('countFor', () => {
  const answered = batchedCounts(new Map([['aa', 18]]), false);

  it('answers with the number the aggregate reported', () => {
    expect(countFor(answered, 'aa')).toBe(18);
  });

  it('normalizes the id, so a hyphenated caller finds a canonical entry', () => {
    const counts = batchedCounts(new Map([['3e4a0955699a4c8f813fcc803a3335ba', 4]]), false);

    expect(countFor(counts, '3e4a0955-699a-4c8f-813f-cc803a3335ba')).toBe(4);
  });

  // Bounded by one request, and it only ever corrects upward. Failing open here instead would mount
  // every debate's branch on every page load, fetching the transcript of a claimless debate — the
  // work this aggregate was added to avoid.
  it('reads as zero while the request is still in flight', () => {
    expect(countFor(batchedCounts(undefined, false), 'aa')).toBe(0);
  });

  // The one that matters: nothing is coming, so the caller must not conclude "empty".
  it('is null when the request failed, not zero', () => {
    expect(countFor(batchedCounts(undefined, true), 'aa')).toBeNull();
  });

  it('is null for a row the failed request never answered for, and the number for one it did', () => {
    const stale = batchedCounts(undefined, true);

    expect(countFor(stale, 'bb')).toBeNull();
  });

  // React Query keeps the last payload through a failed *refetch*. Numbers a minute old beat
  // "unknown", and treating them as unknown would pop every branch open on a background failure.
  it('prefers data it already has over a refetch error', () => {
    const refetchFailed = batchedCounts(new Map([['aa', 18]]), true);

    expect(countFor(refetchFailed, 'aa')).toBe(18);
    expect(refetchFailed.isUnavailable).toBe(false);
  });

  it('answers zero for an id a successful response simply did not include', () => {
    expect(countFor(answered, 'bb')).toBe(0);
  });
});
