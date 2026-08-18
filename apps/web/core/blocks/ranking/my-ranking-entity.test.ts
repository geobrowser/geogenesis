import { describe, expect, it } from 'vitest';

import { RANK_VOTES_RELATION_TYPE_ID, SUBMITTED_TO_PROPERTY_ID } from '~/core/ranking-block-ids';
import type { Entity } from '~/core/types';

import {
  buildMyRankingEntityFilter,
  getMyRankingOrderedEntityIds,
  pickMostRecentlyCreatedRankingEntity,
} from './my-ranking-entity';

function rankEntity({
  id,
  createdAt,
  updatedAt,
  relations = [],
}: {
  id: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  relations?: Entity['relations'];
}): Entity {
  return {
    id,
    name: null,
    description: null,
    spaces: [],
    types: [],
    values: [],
    relations,
    createdAt,
    updatedAt,
  } as Entity;
}

describe('buildMyRankingEntityFilter', () => {
  it('filters Rank entities submitted to the ranking block', () => {
    expect(buildMyRankingEntityFilter('block-1')).toEqual({
      relations: {
        some: {
          typeId: { is: SUBMITTED_TO_PROPERTY_ID },
          toEntityId: { is: 'block-1' },
        },
      },
    });
  });
});

describe('pickMostRecentlyCreatedRankingEntity', () => {
  it('returns the entity with the latest createdAt', () => {
    const picked = pickMostRecentlyCreatedRankingEntity([
      rankEntity({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      rankEntity({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z' }),
    ]);

    expect(picked?.id).toBe('new');
  });

  it('prefers the newest ballot even when an older one was edited more recently', () => {
    const picked = pickMostRecentlyCreatedRankingEntity([
      rankEntity({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z' }),
      rankEntity({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' }),
    ]);

    expect(picked?.id).toBe('new');
  });

  it('falls back to updatedAt for entities without a createdAt', () => {
    const picked = pickMostRecentlyCreatedRankingEntity([
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
