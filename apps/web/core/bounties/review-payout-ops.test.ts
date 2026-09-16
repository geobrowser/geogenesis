import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import {
  BOUNTY_REVIEW_TYPE_ID,
  PAYOUT_AMOUNT_PROPERTY_ID,
  PAYOUT_BOUNTY_PROPERTY_ID,
  PAYOUT_PROPOSALS_PROPERTY_ID,
  PAYOUT_RECIPIENT_PROPERTY_ID,
  PAYOUT_TYPE_ID,
  REVIEW_COMMENT_PROPERTY_ID,
  REVIEW_EFFORT_RATING_PROPERTY_ID,
  REVIEW_PASS_PROPERTY_ID,
  REVIEW_PROPOSALS_PROPERTY_ID,
} from './ontology';
import { buildPayoutOps } from './payout-ops';
import { buildCreateReviewOps, starsToRating } from './review-ops';

describe('buildCreateReviewOps', () => {
  const input = {
    reviewerSpaceId: 'reviewer-space',
    bountySpaceId: 'dao-1',
    name: 'Review of Alice',
    proposalIds: ['p1', 'p2'],
    pass: true,
    comment: '  Solid work  ',
    ratings: { completeness: 1, accuracy: 0.8, skill: 0.6, effort: 1 },
  };

  it('publishes the review into the reviewer space with typed values and toSpaceId on proposal links', () => {
    const { reviewId, values, relations } = buildCreateReviewOps(input);
    expect(values.every(v => v.entity.id === reviewId && v.spaceId === 'reviewer-space')).toBe(true);
    const byProp = Object.fromEntries(values.map(v => [v.property.id, v.value]));
    expect(byProp[REVIEW_PASS_PROPERTY_ID]).toBe('true');
    expect(byProp[REVIEW_COMMENT_PROPERTY_ID]).toBe('Solid work');
    expect(byProp[REVIEW_EFFORT_RATING_PROPERTY_ID]).toBe('1');
    expect(values.find(v => v.property.id === REVIEW_PASS_PROPERTY_ID)?.property.dataType).toBe('BOOLEAN');

    expect(relations.find(r => r.type.id === SystemIds.TYPES_PROPERTY)?.toEntity.id).toBe(BOUNTY_REVIEW_TYPE_ID);
    const links = relations.filter(r => r.type.id === REVIEW_PROPOSALS_PROPERTY_ID);
    expect(links.map(r => r.toEntity.id)).toEqual(['p1', 'p2']);
    expect(links.every(r => r.toSpaceId === 'dao-1' && r.spaceId === 'reviewer-space')).toBe(true);
  });

  it('omits an empty comment and rejects out-of-range ratings', () => {
    const { values } = buildCreateReviewOps({ ...input, comment: '  ' });
    expect(values.some(v => v.property.id === REVIEW_COMMENT_PROPERTY_ID)).toBe(false);
    expect(() => buildCreateReviewOps({ ...input, ratings: { ...input.ratings, skill: 1.2 } })).toThrow(/Skill/);
  });

  it('maps stars to the 0..1 encoding', () => {
    expect(starsToRating(5)).toBe(1);
    expect(starsToRating(1)).toBe(0.2);
    expect(starsToRating(0)).toBe(0);
  });
});

describe('buildPayoutOps', () => {
  it('builds the outer recipient relation whose relation-entity is the typed Payout with amount, bounty and proposals', () => {
    const { payoutRelationId, payoutEntityId, values, relations } = buildPayoutOps({
      spaceId: 'dao-1',
      bounty: { id: 'bounty-1', name: 'Bounty' },
      recipient: { id: 'recipient-space', name: 'Alice' },
      amount: 199.6,
      proposalIds: ['p1'],
    });

    const outer = relations.find(r => r.id === payoutRelationId)!;
    expect(outer).toMatchObject({
      spaceId: 'dao-1',
      entityId: payoutEntityId,
      fromEntity: { id: 'dao-1' },
      toEntity: { id: 'recipient-space' },
      type: { id: PAYOUT_RECIPIENT_PROPERTY_ID },
    });

    const fromPayout = relations.filter(r => r.fromEntity.id === payoutEntityId);
    expect(fromPayout.find(r => r.type.id === SystemIds.TYPES_PROPERTY)?.toEntity.id).toBe(PAYOUT_TYPE_ID);
    expect(fromPayout.find(r => r.type.id === PAYOUT_BOUNTY_PROPERTY_ID)?.toEntity.id).toBe('bounty-1');
    expect(fromPayout.filter(r => r.type.id === PAYOUT_PROPOSALS_PROPERTY_ID).map(r => r.toEntity.id)).toEqual(['p1']);

    expect(values.every(v => v.entity.id === payoutEntityId && v.spaceId === 'dao-1')).toBe(true);
    const amount = values.find(v => v.property.id === PAYOUT_AMOUNT_PROPERTY_ID)!;
    expect(amount.value).toBe('200');
    expect(amount.property.dataType).toBe('DECIMAL');
    expect(values.find(v => v.property.id === SystemIds.NAME_PROPERTY)?.value).toBe('Payout to Alice');
  });

  it('rejects non-positive amounts', () => {
    expect(() =>
      buildPayoutOps({
        spaceId: 's',
        bounty: { id: 'b', name: null },
        recipient: { id: 'r', name: null },
        amount: 0,
        proposalIds: [],
      })
    ).toThrow();
  });
});
