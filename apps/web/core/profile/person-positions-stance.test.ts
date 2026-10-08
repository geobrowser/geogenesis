import { print } from 'graphql';
import { describe, expect, it } from 'vitest';

import {
  decodeVoteOrder,
  personBestOrderDocument,
  personScoreOrderDocument,
  personVoteOrderDocument,
} from './person-position-order';
import { POSITION_VOTE_KINDS, POSITION_VOTE_TYPES } from './profile-facts';
import { personPositionIndexDocument } from './use-person-position-index';
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

  /**
   * These three used to assert the other half of a two-question record: a veracity vote decoded
   * under its own key, both answers kept side by side, and a claim listed on a veracity answer
   * alone. Nothing renders that key now, so a kind-2 row is not an answer this list can show —
   * and listing a claim on one would print a row with no verdict under either button, which is
   * the one thing the record exists to avoid.
   */
  it('gives no side to a retired veracity vote', () => {
    // Keyed normalised, so the default `claim-1` fixture lands as `claim1`.
    expect(decodeVoteOrder([vote({ voteKind: 2, voteType: 1 })]).responseByClaimId).toEqual({});
  });

  /**
   * Both kinds on one claim, disagreeing — and the veracity row is the newer one.
   *
   * Rows arrive newest-first and the decode takes the first it sees per field, so putting the
   * retired row first is the ordering that would win if it were still read at all. The stance is
   * the answer either way.
   *
   * Both directions, because "the stance wins" and "agree wins" only look the same in the first
   * case: a Verify sitting beside a Disagree must read as Disagree, not as the agreement the
   * verify row would otherwise imply.
   */
  it.each([
    ['a stance of agree under a dispute', 0, 1, 'agree'],
    ['a stance of disagree under a verify', 1, 0, 'disagree'],
  ] as const)('keeps only %s', (_case, stanceVoteType, veracityVoteType, expected) => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteKind: 2, voteType: veracityVoteType }),
      vote({ objectId: 'a', voteKind: 1, voteType: stanceVoteType }),
    ]);

    expect(order.responseByClaimId).toEqual({ a: { stance: expected } });
  });

  it('does not list a claim answered only for veracity', () => {
    const order = decodeVoteOrder([vote({ objectId: 'a', voteKind: 2 })]);

    expect(order.entityIds).toEqual([]);
    expect(order.responseByClaimId).toEqual({});
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

  // Retracting the stance retracts the record, even where a retired veracity answer sits beside it.
  it('drops a claim whose stance was retracted, whatever the old veracity row says', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteKind: 1, voteType: 2 }),
      vote({ objectId: 'a', voteKind: 2, voteType: 0 }),
    ]);

    expect(order.entityIds).toEqual([]);
    expect(order.responseByClaimId).toEqual({});
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

  it('settles the stance on its own newest vote, ignoring retired rows around it', () => {
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
      vote({ objectId: 'a', voteKind: 1, voteType: 0, spaceId: 'held' }),
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
      vote({ objectId: 'a', spaceId: 'relationships' }),
    ]);

    expect(order.spacesByClaimId).toEqual({ a: ['personal', 'relationships'] });
  });

  it('lists a space once however many answers were given in it', () => {
    const order = decodeVoteOrder([
      vote({ objectId: 'a', voteKind: 1, voteType: 0, spaceId: 'relationships' }),
      vote({ objectId: 'a', voteKind: 1, voteType: 1, spaceId: 'relationships' }),
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

  it('has nothing to give before the order arrives', () => {
    expect(applyFilter(undefined, null)).toEqual([]);
  });
});

/**
 * Every `votedBy` read that means "positions" asks for held positions only (GEO-2962).
 *
 * A retraction rewrites the vote row to "neither" rather than removing it, so without
 * `votedByTypes` the Top and Best orders and the filter index list claims the person no longer
 * holds a position on — 211 against 194 on one account. The New order drops them in its decode;
 * these three have to ask the server to, with the same kinds and types the count uses.
 */
describe('the votedBy reads', () => {
  it('leave retracted positions out, with the kinds and types the count uses', () => {
    expect(POSITION_VOTE_KINDS).toEqual([1]);
    expect(POSITION_VOTE_TYPES).toEqual([0, 1]);

    for (const document of [personBestOrderDocument, personScoreOrderDocument, personPositionIndexDocument]) {
      const source = print(document);
      expect(source).toContain('votedByKinds: $kinds');
      expect(source).toContain('votedByTypes: $types');
    }
  });
});

/**
 * GEO-2993. The decode ignores kind-2 rows, but ignoring them after they arrive is not enough.
 *
 * Every row that comes back takes a slot in the vote order and a slot in the page budget, whether
 * or not it becomes an answer. A claim answered Agree last month and Verified yesterday would sort
 * by yesterday's retired vote, and enough retired rows push real stance rows past `ORDER_MAX_PAGES`
 * and out of the list entirely. Asked for correctly, neither can happen.
 */
describe('the positions query', () => {
  const source = print(personVoteOrderDocument);

  it('asks only for stance votes', () => {
    // `print` normalises the document, so this is the filter as printed rather than as written.
    expect(source).toContain('voteKind: {is: 1}');
  });

  it('does not ask for the retired veracity kind', () => {
    expect(source).not.toContain('voteKind: {is: 2}');
  });
});
