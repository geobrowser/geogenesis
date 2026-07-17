import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { ROLLING_RANKING_TYPE_ID } from '~/core/ranking-block-ids';
import type { Relation } from '~/core/types';

import { isRollingRankingBlock, makeRollingRankingTypeRelation } from './ensure-ranking-type';

const BLOCK = 'block-1';
const SPACE = 'space-1';

const LEGACY_RANKING_TYPE_PROPERTY_ID = '48e01bc8324e48c2a6c9cab3f49290c6';

function rollingTypeRelation(overrides: Partial<Relation> = {}): Relation {
  return {
    id: 'rel-1',
    entityId: 'rel-entity-1',
    spaceId: SPACE,
    renderableType: 'RELATION',
    type: { id: SystemIds.TYPES_PROPERTY, name: 'Types' },
    toEntity: { id: ROLLING_RANKING_TYPE_ID, name: 'Rolling ranking', value: ROLLING_RANKING_TYPE_ID },
    fromEntity: { id: BLOCK, name: null },
    ...overrides,
  } as Relation;
}

describe('isRollingRankingBlock', () => {
  it('is true when the block has a Types → Rolling relation', () => {
    expect(isRollingRankingBlock([rollingTypeRelation()], BLOCK, SPACE)).toBe(true);
  });

  it('is false when there is no rolling type relation', () => {
    expect(isRollingRankingBlock([], BLOCK, SPACE)).toBe(false);
  });

  it('ignores a deleted rolling relation', () => {
    expect(isRollingRankingBlock([rollingTypeRelation({ isDeleted: true })], BLOCK, SPACE)).toBe(false);
  });

  it('ignores a Types relation pointing at a different type', () => {
    expect(
      isRollingRankingBlock(
        [rollingTypeRelation({ toEntity: { id: 'some-other-type', name: 'Other', value: 'some-other-type' } })],
        BLOCK,
        SPACE
      )
    ).toBe(false);
  });

  it('ignores a relation from a different block', () => {
    expect(
      isRollingRankingBlock([rollingTypeRelation({ fromEntity: { id: 'other-block', name: null } })], BLOCK, SPACE)
    ).toBe(false);
  });

  it('ignores a relation in a different space', () => {
    expect(isRollingRankingBlock([rollingTypeRelation({ spaceId: 'space-2' })], BLOCK, SPACE)).toBe(false);
  });

  it('ignores the legacy Ranking type property relation', () => {
    const legacyRelation = rollingTypeRelation({
      type: { id: LEGACY_RANKING_TYPE_PROPERTY_ID, name: 'Ranking type' },
    });

    expect(isRollingRankingBlock([legacyRelation], BLOCK, SPACE)).toBe(false);
  });
});

describe('makeRollingRankingTypeRelation', () => {
  it('creates an additional Types relation to Rolling', () => {
    const relation = makeRollingRankingTypeRelation(BLOCK, SPACE);

    expect(relation.type).toEqual({ id: SystemIds.TYPES_PROPERTY, name: 'Types' });
    expect(relation.fromEntity.id).toBe(BLOCK);
    expect(relation.toEntity.id).toBe(ROLLING_RANKING_TYPE_ID);
  });
});
