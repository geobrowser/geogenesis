/**
 * Bounty review entity builder. A review lives in the REVIEWER'S personal
 * space (like comments and votes) and points at the reviewed proposals with
 * `toSpaceId` = the bounty's space, matching curator-app's `review.ts`.
 * Ratings are 0..1 floats (the UI's 1–5 stars ÷ 5).
 */
import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { createEntityId, createValueId } from '~/core/id/create-id';
import type { DataType, Relation, Value } from '~/core/types';

import {
  BOUNTY_REVIEW_TYPE_ID,
  REVIEW_ACCURACY_RATING_PROPERTY_ID,
  REVIEW_COMMENT_PROPERTY_ID,
  REVIEW_COMPLETENESS_RATING_PROPERTY_ID,
  REVIEW_EFFORT_RATING_PROPERTY_ID,
  REVIEW_PASS_PROPERTY_ID,
  REVIEW_PROPOSALS_PROPERTY_ID,
  REVIEW_SKILL_RATING_PROPERTY_ID,
} from './ontology';

export type ReviewRatings = { completeness: number; accuracy: number; skill: number; effort: number };

export type ReviewInput = {
  /** The reviewer's personal space — where the review entity is published. */
  reviewerSpaceId: string;
  /** The bounty's space — the proposals' `toSpaceId`. */
  bountySpaceId: string;
  name: string;
  proposalIds: string[];
  pass: boolean;
  comment: string;
  ratings: ReviewRatings;
};

export function assertRating(label: string, value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} rating must be between 0 and 1`);
  }
  return value;
}

/** 1–5 stars → 0..1 float, the on-chain encoding both apps use. */
export function starsToRating(stars: number): number {
  return Math.min(1, Math.max(0, stars / 5));
}

export function buildCreateReviewOps(input: ReviewInput): { reviewId: string; values: Value[]; relations: Relation[] } {
  const reviewId = createEntityId();
  const entityRef = { id: reviewId, name: input.name };
  const spaceId = input.reviewerSpaceId;

  const value = (propertyId: string, propertyName: string, dataType: DataType, v: string): Value => ({
    id: createValueId({ entityId: reviewId, propertyId, spaceId }),
    entity: entityRef,
    property: { id: propertyId, name: propertyName, dataType },
    value: v,
    spaceId,
    isLocal: true,
  });

  const values: Value[] = [
    value(SystemIds.NAME_PROPERTY, 'Name', 'TEXT', input.name),
    value(REVIEW_PASS_PROPERTY_ID, 'Pass', 'BOOLEAN', input.pass ? 'true' : 'false'),
    value(
      REVIEW_COMPLETENESS_RATING_PROPERTY_ID,
      'Completeness rating',
      'FLOAT',
      String(assertRating('Completeness', input.ratings.completeness))
    ),
    value(
      REVIEW_ACCURACY_RATING_PROPERTY_ID,
      'Accuracy rating',
      'FLOAT',
      String(assertRating('Accuracy', input.ratings.accuracy))
    ),
    value(REVIEW_SKILL_RATING_PROPERTY_ID, 'Skill rating', 'FLOAT', String(assertRating('Skill', input.ratings.skill))),
    value(
      REVIEW_EFFORT_RATING_PROPERTY_ID,
      'Effort rating',
      'FLOAT',
      String(assertRating('Effort', input.ratings.effort))
    ),
  ];
  if (input.comment.trim()) values.push(value(REVIEW_COMMENT_PROPERTY_ID, 'Comment', 'TEXT', input.comment.trim()));

  const relations: Relation[] = [
    {
      id: createEntityId(),
      entityId: createEntityId(),
      spaceId,
      renderableType: 'RELATION',
      fromEntity: entityRef,
      toEntity: { id: BOUNTY_REVIEW_TYPE_ID, name: 'Bounty review', value: BOUNTY_REVIEW_TYPE_ID },
      type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
      isLocal: true,
    },
    ...input.proposalIds.map((proposalId): Relation => ({
      id: createEntityId(),
      entityId: createEntityId(),
      spaceId,
      toSpaceId: input.bountySpaceId,
      renderableType: 'RELATION',
      fromEntity: entityRef,
      toEntity: { id: proposalId, name: null, value: proposalId },
      type: { id: REVIEW_PROPOSALS_PROPERTY_ID, name: 'Proposals' },
      isLocal: true,
    })),
  ];

  return { reviewId, values, relations };
}
