import { describe, expect, it } from 'vitest';

import { RANKING_TYPE_PROPERTY_ID, ROLLING_RANKING_TYPE_ID } from '~/core/ranking-block-ids';
import type { Relation } from '~/core/types';

import { isRollingRankingBlock } from './ensure-ranking-type';

const BLOCK = 'block-1';
const SPACE = 'space-1';

function rankingTypeRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: 'rel-1',
    entityId: 'rel-entity-1',
    spaceId: SPACE,
    renderableType: 'RELATION',
    type: { id: RANKING_TYPE_PROPERTY_ID, name: 'Ranking type' },
    toEntity: { id: ROLLING_RANKING_TYPE_ID, name: 'Rolling ranking', value: ROLLING_RANKING_TYPE_ID },
    fromEntity: { id: BLOCK, name: null },
    ...overrides,
  } as Relation;
}

describe('isRollingRankingBlock', () => {
  it('is true when the block has a Ranking type → Rolling relation', () => {
    expect(isRollingRankingBlock([rankingTypeRelation()], BLOCK, SPACE)).toBe(true);
  });

  it('is false when there is no ranking-type relation', () => {
    expect(isRollingRankingBlock([], BLOCK, SPACE)).toBe(false);
  });

  it('ignores a deleted rolling relation', () => {
    expect(isRollingRankingBlock([rankingTypeRelation({ isDeleted: true })], BLOCK, SPACE)).toBe(false);
  });

  it('ignores a relation pointing at a different ranking type', () => {
    expect(
      isRollingRankingBlock(
        [rankingTypeRelation({ toEntity: { id: 'some-other-type', name: 'Other', value: 'some-other-type' } })],
        BLOCK,
        SPACE
      )
    ).toBe(false);
  });

  it('ignores a relation from a different block', () => {
    expect(
      isRollingRankingBlock([rankingTypeRelation({ fromEntity: { id: 'other-block', name: null } })], BLOCK, SPACE)
    ).toBe(false);
  });

  it('ignores a relation in a different space', () => {
    expect(isRollingRankingBlock([rankingTypeRelation({ spaceId: 'space-2' })], BLOCK, SPACE)).toBe(false);
  });
});
