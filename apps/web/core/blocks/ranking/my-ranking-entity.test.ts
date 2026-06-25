import { describe, expect, it } from 'vitest';

import { RANK_VOTES_RELATION_TYPE_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';

import { getMyRankingOrderedEntityIds, pickMostRecentlyUpdatedRankingEntity } from './my-ranking-entity';

function rankEntity({
  id,
  updatedAt,
  relations = [],
}: {
  id: string;
  updatedAt?: string | number;
  relations?: Entity['relations'];
}): Entity {
  return {
    id,
    name: null,
    types: [],
    values: [],
    relations,
    updatedAt,
  } as Entity;
}

describe('pickMostRecentlyUpdatedRankingEntity', () => {
  it('returns the entity with the latest updatedAt', () => {
    const picked = pickMostRecentlyUpdatedRankingEntity([
      rankEntity({ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' }),
      rankEntity({ id: 'new', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ]);

    expect(picked?.id).toBe('new');
  });
});

describe('getMyRankingOrderedEntityIds', () => {
  it('reads ordered rank vote relations from the rank entity', () => {
    const entity = rankEntity({
      id: 'rank-1',
      relations: [
        {
          id: 'rel-b',
          entityId: 'rank-1',
          isDeleted: false,
          type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
          fromEntity: { id: 'rank-1', name: null },
          toEntity: { id: 'b', name: null, value: 'b' },
          renderableType: 'RELATION',
          spaceId: 'personal-1',
          position: '00000000000000000000000000000001',
        },
        {
          id: 'rel-a',
          entityId: 'rank-1',
          isDeleted: false,
          type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
          fromEntity: { id: 'rank-1', name: null },
          toEntity: { id: 'a', name: null, value: 'a' },
          renderableType: 'RELATION',
          spaceId: 'personal-1',
          position: '00000000000000000000000000000000',
        },
      ] as Entity['relations'],
    });

    expect(getMyRankingOrderedEntityIds(entity, 'personal-1')).toEqual(['a', 'b']);
  });
});
