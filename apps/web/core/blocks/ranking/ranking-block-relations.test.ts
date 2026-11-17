import { Position } from '@geoprotocol/geo-sdk/lite';

import { describe, expect, it } from 'vitest';

import { AGGREGATED_RANKINGS_PROPERTY_ID, RANK_POSITION_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Relation } from '~/core/types';

import {
  buildLeaderboardFromOrderedEntityIds,
  compareRankingPositions,
  getAggregatedRankingSubmissionCount,
  getAggregatedRankingSubmitterRefs,
  getAggregatedRankingSubmitterSpaceIds,
  getOrderedRelationTargetIds,
} from './ranking-block-relations';

function relation({
  blockId,
  propertyId,
  toEntityId,
  toSpaceId,
  position,
  isDeleted = false,
  spaceId = 'space-1',
}: {
  blockId: string;
  propertyId: string;
  toEntityId: string;
  toSpaceId?: string;
  position?: string;
  isDeleted?: boolean;
  spaceId?: string;
}): Relation {
  return {
    id: `rel-${toEntityId}`,
    entityId: blockId,
    isDeleted,
    type: { id: propertyId, name: null },
    fromEntity: { id: blockId, name: null },
    toEntity: { id: toEntityId, name: null, value: toEntityId },
    renderableType: 'RELATION',
    spaceId,
    toSpaceId,
    position,
  } as Relation;
}

describe('compareRankingPositions', () => {
  it('orders mixed-case keys by character code, as the indexer does', () => {
    expect(['a0a', 'aB', 'a0Z', 'aa', null, 'a05Fl'].sort(compareRankingPositions)).toEqual([
      'a05Fl',
      'a0Z',
      'a0a',
      'aB',
      'aa',
      null,
    ]);
  });

  it('reads a long ballot written with SDK positions back in the order it was written', () => {
    const keys: string[] = [];
    let last: string | null = null;
    for (let i = 0; i < 120; i++) {
      last = Position.generateBetween(last, null);
      keys.push(last);
    }
    // The SDK's keys mix case past a dozen or so; localeCompare scrambles them.
    expect([...keys].sort((a, b) => Position.compare(a, b))).not.toEqual(keys);
    const relations = [...keys]
      .reverse()
      .map((position, i) =>
        relation({ blockId: 'rank', propertyId: 'votes', toEntityId: `e${keys.length - 1 - i}`, position })
      );
    expect(getOrderedRelationTargetIds(relations, 'rank', 'votes', 'space-1')).toEqual(keys.map((_, i) => `e${i}`));
  });
});

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

describe('aggregated rankings submissions', () => {
  const blockId = 'block-1';

  it('counts all Aggregated rankings relations in the block space', () => {
    const relations = [
      relation({
        blockId,
        propertyId: AGGREGATED_RANKINGS_PROPERTY_ID,
        toEntityId: 'rank-1',
        toSpaceId: 'personal-a',
        position: '00000000000000000000000000000000',
      }),
      relation({
        blockId,
        propertyId: AGGREGATED_RANKINGS_PROPERTY_ID,
        toEntityId: 'rank-2',
        toSpaceId: 'personal-b',
        position: '00000000000000000000000000000001',
      }),
      relation({
        blockId,
        propertyId: AGGREGATED_RANKINGS_PROPERTY_ID,
        toEntityId: 'rank-3',
        toSpaceId: 'personal-a',
        position: '00000000000000000000000000000002',
        isDeleted: true,
      }),
    ];

    expect(getAggregatedRankingSubmissionCount(relations, blockId, 'space-1')).toBe(2);
  });

  it('returns submitter personal spaces from to_space in relation order', () => {
    const relations = [
      relation({
        blockId,
        propertyId: AGGREGATED_RANKINGS_PROPERTY_ID,
        toEntityId: 'rank-2',
        toSpaceId: 'personal-b',
        position: '00000000000000000000000000000001',
      }),
      relation({
        blockId,
        propertyId: AGGREGATED_RANKINGS_PROPERTY_ID,
        toEntityId: 'rank-1',
        toSpaceId: 'personal-a',
        position: '00000000000000000000000000000000',
      }),
      relation({
        blockId,
        propertyId: AGGREGATED_RANKINGS_PROPERTY_ID,
        toEntityId: 'rank-3',
        position: '00000000000000000000000000000002',
      }),
    ];

    expect(getAggregatedRankingSubmitterSpaceIds(relations, blockId, 'space-1')).toEqual(['personal-a', 'personal-b']);
  });

  it('returns submitter refs with rank entity ids in relation order', () => {
    const relations = [
      relation({
        blockId,
        propertyId: AGGREGATED_RANKINGS_PROPERTY_ID,
        toEntityId: 'rank-2',
        toSpaceId: 'personal-b',
        position: '00000000000000000000000000000001',
      }),
      relation({
        blockId,
        propertyId: AGGREGATED_RANKINGS_PROPERTY_ID,
        toEntityId: 'rank-1',
        toSpaceId: 'personal-a',
        position: '00000000000000000000000000000000',
      }),
    ];

    expect(getAggregatedRankingSubmitterRefs(relations, blockId, 'space-1')).toEqual([
      { rankEntityId: 'rank-1', spaceId: 'personal-a' },
      { rankEntityId: 'rank-2', spaceId: 'personal-b' },
    ]);
  });
});
