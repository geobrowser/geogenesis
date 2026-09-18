import { describe, expect, it } from 'vitest';

import { decodeVoteOrder } from './person-position-order';
import { applyFilter, heldPositionsCount } from './use-person-positions';

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
const vote = (over: Partial<{ objectId: string; voteType: number; voteKind: number; spaceId: string }> = {}) => ({
  objectId: 'claim-1',
  voteType: 0,
  voteKind: 1,
  spaceId: 'space-1',
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
  });

  /**
   * And a retracted claim leaves the record rather than sitting in it blank.
   *
   * "Neither" is not something the controls offer — pressing your own side again
   * rewrites the row rather than deleting it — so a listed claim with no
   * indicator was a claim this person holds no position on, in a tab that exists
   * to list the ones they do. 17 of one reference account's 211, 12 of another's
   * 34.
   */
  it('drops a claim whose position was taken back', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'kept', voteType: 0 }),
      vote({ objectId: 'taken-back', voteType: 2 }),
    ]);

    expect(order.entityIds).toEqual(['kept']);
  });

  it('keeps a claim retracted for one question but answered for the other', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteKind: 1, voteType: 2 }),
      vote({ objectId: 'a', voteKind: 2, voteType: 0 }),
    ]);

    expect(order.entityIds).toEqual(['a']);
    expect(order.responseByClaimId).toEqual({ a: { veracity: 'agree' } });
  });

  it('does not let an older neutral vote clear the current side', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'claim1', voteType: 0 }),
      vote({ objectId: 'claim1', voteType: 2 }),
    ]);

    expect(order.responseByClaimId).toEqual({ claim1: { stance: 'agree' } });
  });

  /**
   * A position is held per space, and the two are independent.
   *
   * `userVotes` is unique per (user, claim, object type, space, kind), so a
   * claim answered in two spaces has two rows that can disagree. Settling the
   * kind on the newest row *anywhere* let a retraction in one space delete a
   * position still held in another — the claim vanished from the list and from
   * the count. Nobody in the graph has done this yet, so it was latent.
   */
  it('keeps a position held in one space when another space retracted it', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteType: 2, spaceId: 'personal' }),
      vote({ objectId: 'a', voteType: 0, spaceId: 'relationships' }),
    ]);

    expect(order.responseByClaimId).toEqual({ a: { stance: 'agree' } });
    expect(order.entityIds).toEqual(['a']);
    expect(order.spacesByClaimId).toEqual({ a: ['relationships'] });
  });

  it('still lets a retraction clear the side it was cast against', () => {
    // Same space, so this is the retraction doing its job rather than reaching
    // across into another space's answer.
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteType: 2, spaceId: 'relationships' }),
      vote({ objectId: 'a', voteType: 0, spaceId: 'relationships' }),
    ]);

    expect(order.responseByClaimId).toEqual({});
    expect(order.entityIds).toEqual([]);
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
 * Which space to show a claim in: the one they answered in.
 *
 * A claim can live in several spaces, and the card otherwise renders the first
 * one the entity lists — which put two claims on the reference account's first
 * screen into a stranger's personal space rather than the topic space they are
 * argued in. The vote says exactly which one this person was reading.
 */
describe('the space a position was taken in', () => {
  it('records the space of the vote', () => {
    const order = decodeVoteOrder([vote({ objectId: 'a', spaceId: 'relationships' })]);

    expect(order.spacesByClaimId).toEqual({ a: ['relationships'] });
  });

  it('normalises it, as the card ids are', () => {
    const order = decodeVoteOrder([vote({ objectId: 'a', spaceId: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' })]);

    expect(order.spacesByClaimId.a).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa']);
  });

  it('takes the space of the answer that stands, not of a retraction beside it', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteKind: 1, voteType: 2, spaceId: 'withdrawn' }),
      vote({ objectId: 'a', voteKind: 2, voteType: 0, spaceId: 'held' }),
    ]);

    expect(order.spacesByClaimId).toEqual({ a: ['held'] });
  });

  it('says nothing for a vote with no space on it', () => {
    const order = decodeVoteOrder([{ objectId: 'a', voteType: 0, voteKind: 1 }]);

    expect(order.spacesByClaimId).toEqual({});
  });

  /**
   * Somebody can answer the same claim in two spaces — 1 of the reference
   * account's 59 — and the two versions are not interchangeable: one of them
   * carried no Claim type, so picking it rendered a claim card with no response
   * controls on it at all.
   *
   * Both candidates go through, newest first, and `pickDisplaySpaceId` chooses
   * between them by where the entity is actually typed.
   */
  it('keeps every space a claim was answered in, newest first', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', spaceId: 'personal' }),
      vote({ objectId: 'a', voteKind: 2, spaceId: 'relationships' }),
    ]);

    expect(order.spacesByClaimId).toEqual({ a: ['personal', 'relationships'] });
  });

  it('lists a space once however many answers were given in it', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteKind: 1, spaceId: 'relationships' }),
      vote({ objectId: 'a', voteKind: 2, spaceId: 'relationships' }),
    ]);

    expect(order.spacesByClaimId).toEqual({ a: ['relationships'] });
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
  const order = { entityIds: ['a', 'b', 'c'], responseByClaimId: {}, spacesByClaimId: {} };

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
    const dashed = { entityIds: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'], responseByClaimId: {}, spacesByClaimId: {} };

    expect(applyFilter(dashed, ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'])).toHaveLength(1);
  });

  /*
   * Top's order arrives from a connection that cannot tell a held position from
   * a retracted one, so the vote table narrows it. The `new` order is already
   * narrowed, which is why this is a second argument rather than a property of
   * the order.
   */
  it('drops claims the vote table no longer counts as answered', () => {
    expect(applyFilter(order, null, new Set(['a', 'c']))).toEqual(['a', 'c']);
  });

  it('applies the filter and the answered set together', () => {
    expect(applyFilter(order, ['b', 'c'], new Set(['a', 'b']))).toEqual(['b']);
  });

  it('has nothing to give before the order arrives', () => {
    expect(applyFilter(undefined, null)).toEqual([]);
  });
});

/**
 * The number above the list counts the same claims the list shows.
 *
 * `entitiesConnection(votedBy:)` counts a retracted vote, because the row is
 * still there — 211 against 194 on one account. There is no server-side way to
 * ask it not to, so the vote table is what the number comes from.
 */
describe('heldPositionsCount', () => {
  it('prefers the vote table, which can tell the difference', () => {
    expect(heldPositionsCount({ total: 194, isError: false }, 211)).toBe(194);
  });

  it('counts an empty record as zero rather than falling through', () => {
    expect(heldPositionsCount({ total: 0, isError: false }, 3)).toBe(0);
  });

  it('says nothing while the vote table is still out', () => {
    // Rather than printing the server's number and correcting it a beat later.
    expect(heldPositionsCount({ total: null, isError: false }, 211)).toBeNull();
  });

  it('falls back to the server count when the vote read failed', () => {
    // Overstated, and better than a headline number that never arrives.
    expect(heldPositionsCount({ total: null, isError: true }, 211)).toBe(211);
  });
});
