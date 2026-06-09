import { describe, expect, it } from 'vitest';

import { AGGREGATED_RANKINGS_PROPERTY_ID, RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Relation } from '~/core/types';

import { buildLeaderboardFromOrderedEntityIds, getOrderedRelationTargetIds } from './ranking-block-relations';

function relation({
  blockId,
  propertyId,
  toEntityId,
  position,
  isDeleted = false,
}: {
  blockId: string;
  propertyId: string;
  toEntityId: string;
  position?: string;
  isDeleted?: boolean;
}): Relation {
  return {
    id: `rel-${toEntityId}`,
    entityId: blockId,
    isDeleted,
    type: { id: propertyId, name: null },
    fromEntity: { id: blockId, name: null },
    toEntity: { id: toEntityId, name: null, value: toEntityId },
    renderableType: 'RELATION',
    spaceId: 'space-1',
    position,
  } as Relation;
}

describe('getOrderedRelationTargetIds', () => {
  it('returns rank position targets in relation position order', () => {
    const blockId = 'block-1';
    const relations = [
      relation({
        blockId,
        propertyId: RANK_POSITION_PROPERTY_ID,
        toEntityId: 'c',
        position: '00000000000000000000000000000002',
      }),
      relation({
        blockId,
        propertyId: RANK_POSITION_PROPERTY_ID,
        toEntityId: 'a',
        position: '00000000000000000000000000000000',
      }),
      relation({
        blockId,
        propertyId: RANK_POSITION_PROPERTY_ID,
        toEntityId: 'b',
        position: '00000000000000000000000000000001',
      }),
      relation({ blockId, propertyId: AGGREGATED_RANKINGS_PROPERTY_ID, toEntityId: 'rank-1' }),
    ];

    expect(getOrderedRelationTargetIds(relations, blockId, RANK_POSITION_PROPERTY_ID, 'space-1')).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('dedupes targets and skips deleted relations', () => {
    const blockId = 'block-1';
    const relations = [
      relation({
        blockId,
        propertyId: RANK_POSITION_PROPERTY_ID,
        toEntityId: 'a',
        position: '00000000000000000000000000000000',
      }),
      relation({
        blockId,
        propertyId: RANK_POSITION_PROPERTY_ID,
        toEntityId: 'a',
        position: '00000000000000000000000000000001',
        isDeleted: true,
      }),
      relation({
        blockId,
        propertyId: RANK_POSITION_PROPERTY_ID,
        toEntityId: 'b',
        position: '00000000000000000000000000000002',
      }),
    ];

    expect(getOrderedRelationTargetIds(relations, blockId, RANK_POSITION_PROPERTY_ID, 'space-1')).toEqual(['a', 'b']);
  });

  it('only includes relations in the requested space', () => {
    const blockId = 'block-1';
    const relations = [
      relation({
        blockId,
        propertyId: RANK_POSITION_PROPERTY_ID,
        toEntityId: 'a',
        position: '00000000000000000000000000000000',
      }),
      {
        ...relation({
          blockId,
          propertyId: RANK_POSITION_PROPERTY_ID,
          toEntityId: 'b',
          position: '00000000000000000000000000000001',
        }),
        spaceId: 'space-2',
      },
    ];

    expect(getOrderedRelationTargetIds(relations, blockId, RANK_POSITION_PROPERTY_ID, 'space-1')).toEqual(['a']);
  });
});

describe('buildLeaderboardFromOrderedEntityIds', () => {
  it('assigns ranks from list order', () => {
    expect(buildLeaderboardFromOrderedEntityIds(['b', 'a'])).toEqual([
      { entityId: 'b', rank: 1 },
      { entityId: 'a', rank: 2 },
    ]);
  });
});
