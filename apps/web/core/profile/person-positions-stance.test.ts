import { describe, expect, it } from 'vitest';

import { decodeVoteOrder } from './person-position-order';
import { applyFilter } from './use-person-positions';

/**
 * Which side a person came down on, read off their votes (GEO-2859).
 *
 * Two fields decide it and they are easy to confuse. `voteKind` says *which
 * question* was answered — 1 is a stance on the claim, 2 is a judgement about
 * whether it is true — and `voteType` says which way. Only the stance vote
 * carries a side; measured on the reference account, `voteType` is 0 for 100
 * agrees, 1 for 86 disagrees and 2 for four that are neither.
 */
const vote = (over: Partial<{ objectId: string; voteType: number; voteKind: number }> = {}) => ({
  objectId: 'claim-1',
  voteType: 0,
  voteKind: 1,
  ...over,
});

describe('the stance on a claim', () => {
  it('reads agree and disagree off the stance vote', () => {
    const order = decodeVoteOrder([vote({ objectId: 'a', voteType: 0 }), vote({ objectId: 'b', voteType: 1 })]);

    expect(order.stanceByClaimId).toEqual({ a: 'agree', b: 'disagree' });
  });

  it('gives no side to a vote that is neither', () => {
    expect(decodeVoteOrder([vote({ voteType: 2 })]).stanceByClaimId).toEqual({});
  });

  // The trap: a veracity vote is `voteType` 0 or 1 too, but it answers "is this
  // true", not "do I agree". Reading it as a stance would label a claim somebody
  // rated for accuracy as one they took a side on.
  it('ignores a veracity vote, whichever way it went', () => {
    expect(decodeVoteOrder([vote({ voteKind: 2, voteType: 1 })]).stanceByClaimId).toEqual({});
  });

  it('still lists a claim rated only for veracity, with no side', () => {
    const order = decodeVoteOrder([vote({ objectId: 'a', voteKind: 2 })]);

    expect(order.entityIds).toEqual(['a']);
    expect(order.stanceByClaimId).toEqual({});
  });

  it('keeps the newest stance when somebody voted twice', () => {
    // Rows arrive newest-first, so the first one seen is the current position.
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteType: 1 }),
      vote({ objectId: 'claim1', voteType: 0 }),
    ]);

    expect(order.stanceByClaimId).toEqual({ claim1: 'disagree' });
  });

  /**
   * Retracting a position is a vote, not the absence of one.
   *
   * `voteType` 2 is "neither", and it carries no side — so a decode that only
   * recorded sides skipped straight past it and let the *older* agree or
   * disagree fill the gap, badging the claim with a position its owner had
   * already taken back. The newest stance row settles the claim whether or not
   * it has a side to give.
   */
  it('lets a neutral vote clear a side recorded earlier', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteType: 2 }),
      vote({ objectId: 'claim1', voteType: 0 }),
    ]);

    expect(order.stanceByClaimId).toEqual({});
    // Still one of their positions — they answered it, they just answered
    // "neither".
    expect(order.entityIds).toEqual(['claim1']);
  });

  it('does not let an older neutral vote clear the current side', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteType: 0 }),
      vote({ objectId: 'claim1', voteType: 2 }),
    ]);

    expect(order.stanceByClaimId).toEqual({ claim1: 'agree' });
  });

  it('leaves a veracity vote out of settling the stance', () => {
    // Kind 2 answers a different question, so it neither sets a side nor stops
    // the stance vote behind it from being read.
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteKind: 2, voteType: 1 }),
      vote({ objectId: 'claim1', voteKind: 1, voteType: 0 }),
    ]);

    expect(order.stanceByClaimId).toEqual({ claim1: 'agree' });
  });
});

/**
 * The id list is deduped once, over everything.
 *
 * Stance and veracity are separate rows on the same claim. When this paged the
 * vote table directly, a claim whose two votes fell either side of a page
 * boundary escaped the per-page dedupe and rendered twice under one React key.
 * The list is now complete before anything is drawn, so no boundaries remain to
 * straddle — but the dedupe within the list still has to hold.
 */
describe('the claim order', () => {
  it('lists a claim once however many times it was voted on', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteKind: 1 }),
      vote({ objectId: 'a', voteKind: 2 }),
      vote({ objectId: 'b', voteKind: 1 }),
    ]);

    expect(order.entityIds).toEqual(['a', 'b']);
  });

  it('collapses the same claim spelled two ways', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
      vote({ objectId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
    ]);

    expect(order.entityIds).toHaveLength(1);
  });

  it('keeps vote order, which is the order the tab reads in', () => {
    const order = decodeVoteOrder([vote({ objectId: 'c' }), vote({ objectId: 'a' }), vote({ objectId: 'b' })]);

    expect(order.entityIds).toEqual(['c', 'a', 'b']);
  });

  it('skips a row with no claim on it', () => {
    expect(decodeVoteOrder([{ objectId: null }, vote({ objectId: 'a' })]).entityIds).toEqual(['a']);
  });
});

/**
 * Filtering meets ordering over the complete record.
 *
 * The two come from different connections — the vote table orders New, the
 * score-ordered entities connection orders Top — so they can only be combined by
 * intersection, and only correctly if both lists are whole.
 */
describe('applyFilter', () => {
  const order = { entityIds: ['a', 'b', 'c'], stanceByClaimId: {} };

  it('keeps the whole list when no filter is applied', () => {
    expect(applyFilter(order, null)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the order of the sort, not the order of the filter', () => {
    expect(applyFilter(order, ['c', 'a'])).toEqual(['a', 'c']);
  });

  it('answers nothing for a filter that matched nothing', () => {
    // Distinct from `null`, which means "no filter". A tab showing this renders
    // an empty list rather than the unfiltered record.
    expect(applyFilter(order, [])).toEqual([]);
  });

  it('matches ids however they are spelled', () => {
    const dashed = { entityIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], stanceByClaimId: {} };

    expect(applyFilter(dashed, ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'])).toHaveLength(1);
  });

  it('has nothing to give before the order arrives', () => {
    expect(applyFilter(undefined, null)).toEqual([]);
  });
});
