import { describe, expect, it } from 'vitest';

import { decodeVoteOrder } from './person-position-order';
import { applyFilter } from './use-person-positions';

/**
 * How a person answered each claim, read off their votes (GEO-2859).
 *
 * Two fields decide it and they are easy to confuse. `voteKind` says *which
 * question* was answered — 1 is a stance on the claim, 2 is a judgement about
 * whether it is true — and `voteType` says which way: 0 for, 1 against, 2
 * neither. Measured on the reference account: 100 agree, 86 disagree and 4
 * neither across 190 stance votes.
 *
 * **Both kinds are kept, apart.** They answer different questions, and which one
 * a card shows depends on the claim's own response kind — a property of the
 * claim *in a space*, which this decode cannot see. Keeping only the stance left
 * 18 of that account's 208 positions with no indicator anywhere.
 */
const vote = (over: Partial<{ objectId: string; voteType: number; voteKind: number }> = {}) => ({
  objectId: 'claim-1',
  voteType: 0,
  voteKind: 1,
  ...over,
});

describe('how a claim was answered', () => {
  it('reads agree and disagree off the stance vote', () => {
    const order = decodeVoteOrder([vote({ objectId: 'a', voteType: 0 }), vote({ objectId: 'b', voteType: 1 })]);

    expect(order.responseByClaimId).toEqual({ a: { stance: 'agree' }, b: { stance: 'disagree' } });
  });

  it('gives no side to a vote that is neither', () => {
    expect(decodeVoteOrder([vote({ voteType: 2 })]).responseByClaimId).toEqual({});
  });

  it('records a veracity vote under its own question', () => {
    // Not dropped: a factual claim asks Verify or Dispute, and throwing this
    // away is what left those claims with nothing to show.
    // Keyed normalised, so the default `claim-1` fixture lands as `claim1`.
    expect(decodeVoteOrder([vote({ voteKind: 2, voteType: 1 })]).responseByClaimId).toEqual({
      claim1: { veracity: 'disagree' },
    });
  });

  it('keeps both answers when somebody gave both', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteKind: 1, voteType: 0 }),
      vote({ objectId: 'a', voteKind: 2, voteType: 1 }),
    ]);

    expect(order.responseByClaimId).toEqual({ a: { stance: 'agree', veracity: 'disagree' } });
  });

  it('lists a claim answered only for veracity', () => {
    const order = decodeVoteOrder([vote({ objectId: 'a', voteKind: 2 })]);

    expect(order.entityIds).toEqual(['a']);
    expect(order.responseByClaimId).toEqual({ a: { veracity: 'agree' } });
  });

  it('keeps the newest answer when somebody voted twice', () => {
    // Rows arrive newest-first, so the first one seen is the current answer.
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteType: 1 }),
      vote({ objectId: 'claim1', voteType: 0 }),
    ]);

    expect(order.responseByClaimId).toEqual({ claim1: { stance: 'disagree' } });
  });

  /**
   * Retracting is a vote, not the absence of one.
   *
   * `voteType` 2 is "neither", and it is how somebody takes a position back — so
   * a decode that only recorded sides skipped past it and let an older answer
   * fill the gap, badging a claim with a position its owner had withdrawn.
   */
  it('lets a neutral vote clear a side recorded earlier', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteType: 2 }),
      vote({ objectId: 'claim1', voteType: 0 }),
    ]);

    expect(order.responseByClaimId).toEqual({});
    expect(order.entityIds).toEqual(['claim1']);
  });

  it('does not let an older neutral vote clear the current side', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteType: 0 }),
      vote({ objectId: 'claim1', voteType: 2 }),
    ]);

    expect(order.responseByClaimId).toEqual({ claim1: { stance: 'agree' } });
  });

  it('settles each question on its own newest vote', () => {
    // A neutral veracity answer must not clear the stance, and vice versa.
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteKind: 2, voteType: 2 }),
      vote({ objectId: 'claim1', voteKind: 1, voteType: 0 }),
      vote({ objectId: 'claim1', voteKind: 2, voteType: 1 }),
    ]);

    expect(order.responseByClaimId).toEqual({ claim1: { stance: 'agree' } });
  });
});

/**
 * The id list is deduped once, over everything.
 *
 * Stance and veracity are separate rows on the same claim. When this paged the
 * vote table directly, a claim whose two votes fell either side of a page
 * boundary escaped the per-page dedupe and rendered twice under one React key.
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
  const order = { entityIds: ['a', 'b', 'c'], responseByClaimId: {} };

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
    const dashed = { entityIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], responseByClaimId: {} };

    expect(applyFilter(dashed, ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'])).toHaveLength(1);
  });

  it('has nothing to give before the order arrives', () => {
    expect(applyFilter(undefined, null)).toEqual([]);
  });
});
