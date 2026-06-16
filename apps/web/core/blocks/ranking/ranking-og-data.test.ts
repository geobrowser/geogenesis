import { describe, expect, it } from 'vitest';

import {
  RANK_POSITION_PROPERTY_ID,
  RANK_TYPE_ID,
  RANK_VOTES_RELATION_TYPE_ID,
  SUBMITTED_TO_PROPERTY_ID,
} from '~/core/ranking-block-ids';
import type { Entity, Profile } from '~/core/types';

import { isRankSubmittedToBlock } from './my-ranking-entity';
import { getGlobalRankingOgCardData, getRankingOgCardData } from './ranking-og-data';

function entity(partial: Partial<Entity> & { id: string }): Entity {
  return {
    name: null,
    description: null,
    spaces: [],
    types: [],
    values: [],
    relations: [],
    ...partial,
  };
}

const profile: Profile = {
  id: 'author-space',
  spaceId: 'author-space',
  name: 'Alice',
  avatarUrl: null,
  coverUrl: null,
  profileLink: null,
  address: '0x1111111111111111111111111111111111111111',
};

describe('isRankSubmittedToBlock', () => {
  it('requires a non-deleted submitted-to relation in the author space', () => {
    const rank = entity({
      id: 'rank-1',
      relations: [
        {
          id: 'submitted',
          entityId: 'rank-1',
          isDeleted: false,
          type: { id: SUBMITTED_TO_PROPERTY_ID, name: null },
          fromEntity: { id: 'rank-1', name: null },
          toEntity: { id: 'block-1', name: null, value: 'block-1' },
          renderableType: 'RELATION',
          spaceId: 'author-space',
        },
      ],
    });

    expect(isRankSubmittedToBlock(rank, 'author-space', 'block-1')).toBe(true);
    expect(isRankSubmittedToBlock(rank, 'other-space', 'block-1')).toBe(false);
  });
});

describe('getRankingOgCardData', () => {
  it('normalizes rank, author, period, and ordered entry data', async () => {
    const rank = entity({
      id: 'rank-1',
      name: 'Rank entity name',
      types: [{ id: RANK_TYPE_ID, name: 'Rank' }],
      relations: [
        {
          id: 'submitted',
          entityId: 'rank-1',
          isDeleted: false,
          type: { id: SUBMITTED_TO_PROPERTY_ID, name: null },
          fromEntity: { id: 'rank-1', name: null },
          toEntity: { id: 'block-1', name: null, value: 'block-1' },
          renderableType: 'RELATION',
          spaceId: 'author-space',
        },
        {
          id: 'vote-b',
          entityId: 'rank-1',
          isDeleted: false,
          type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
          fromEntity: { id: 'rank-1', name: null },
          toEntity: { id: 'entry-b', name: null, value: 'entry-b' },
          renderableType: 'RELATION',
          spaceId: 'author-space',
          position: '00000000000000000000000000000001',
        },
        {
          id: 'vote-a',
          entityId: 'rank-1',
          isDeleted: false,
          type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
          fromEntity: { id: 'rank-1', name: null },
          toEntity: { id: 'entry-a', name: null, value: 'entry-a' },
          renderableType: 'RELATION',
          spaceId: 'author-space',
          position: '00000000000000000000000000000000',
        },
      ],
    });
    const block = entity({ id: 'block-1', name: 'Top projects' });
    const entries = [
      entity({ id: 'entry-a', name: 'Entry A', description: 'First' }),
      entity({ id: 'entry-b', name: 'Entry B', description: 'Second' }),
    ];

    const data = await getRankingOgCardData(
      {
        rankEntityId: 'rank-1',
        authorSpaceId: 'author-space',
        blockEntityId: 'block-1',
        blockEntitySpaceId: 'block-space',
        rankingEndDate: '2026-06-30',
      },
      {
        fetchEntity: async id => (id === 'rank-1' ? rank : block),
        fetchEntityPage: async id => (id === 'rank-1' ? { entity: rank, relations: rank.relations } : null),
        fetchEntities: async () => entries,
        fetchProfile: async () => profile,
      }
    );

    expect(data?.title).toBe('My Top projects');
    expect(data?.author.name).toBe('Alice');
    expect(data?.periodLabel).toMatch(/^Ends in \d+ days$|^Ended$/);
    expect(data?.entries.map(entry => entry.entityId)).toEqual(['entry-a', 'entry-b']);
  });

  it('rejects ranks that were not submitted to the requested block', async () => {
    const data = await getRankingOgCardData(
      {
        rankEntityId: 'rank-1',
        authorSpaceId: 'author-space',
        blockEntityId: 'block-1',
        blockEntitySpaceId: 'block-space',
      },
      {
        fetchEntity: async () => entity({ id: 'rank-1', types: [{ id: RANK_TYPE_ID, name: 'Rank' }] }),
        fetchEntityPage: async () => ({
          entity: entity({ id: 'rank-1', types: [{ id: RANK_TYPE_ID, name: 'Rank' }] }),
          relations: [],
        }),
        fetchEntities: async () => [],
        fetchProfile: async () => profile,
      }
    );

    expect(data).toBeNull();
  });
});

describe('getGlobalRankingOgCardData', () => {
  it('uses the block name and global rank positions for the card', async () => {
    const block = entity({
      id: 'block-1',
      name: 'Top projects',
      relations: [
        {
          id: 'rank-b',
          entityId: 'block-1',
          isDeleted: false,
          type: { id: RANK_POSITION_PROPERTY_ID, name: null },
          fromEntity: { id: 'block-1', name: null },
          toEntity: { id: 'entry-b', name: null, value: 'entry-b' },
          renderableType: 'RELATION',
          spaceId: 'block-space',
          position: '00000000000000000000000000000001',
        },
        {
          id: 'rank-a',
          entityId: 'block-1',
          isDeleted: false,
          type: { id: RANK_POSITION_PROPERTY_ID, name: null },
          fromEntity: { id: 'block-1', name: null },
          toEntity: { id: 'entry-a', name: null, value: 'entry-a' },
          renderableType: 'RELATION',
          spaceId: 'block-space',
          position: '00000000000000000000000000000000',
        },
      ],
    });
    const entries = [
      entity({ id: 'entry-a', name: 'Entry A', description: 'First' }),
      entity({ id: 'entry-b', name: 'Entry B', description: 'Second' }),
    ];

    const data = await getGlobalRankingOgCardData(
      {
        blockEntityId: 'block-1',
        blockEntitySpaceId: 'block-space',
        rankingEndDate: '2026-06-30',
      },
      {
        fetchEntity: async id => (id === 'block-1' ? block : null),
        fetchEntityPage: async id => (id === 'block-1' ? { entity: block, relations: block.relations } : null),
        fetchEntities: async () => entries,
        fetchProfile: async () => profile,
      }
    );

    expect(data?.kind).toBe('global');
    expect(data?.title).toBe('Top projects');
    expect(data?.entries.map(entry => entry.entityId)).toEqual(['entry-a', 'entry-b']);
  });
});
