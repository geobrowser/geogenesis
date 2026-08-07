import { describe, expect, it } from 'vitest';

import {
  RANKING_END_TIME_PROPERTY_ID,
  RANKING_START_TIME_PROPERTY_ID,
  RANK_POSITION_PROPERTY_ID,
  RANK_TYPE_ID,
  RANK_VOTES_RELATION_TYPE_ID,
  SUBMITTED_TO_PROPERTY_ID,
} from '~/core/ranking-block-ids';
import type { Entity, Profile, Relation, Value } from '~/core/types';

import { getMyRankingOrderedEntityIds } from './my-ranking-entity';
import type { RankingOgCardData } from './ranking-og-data';
import { buildGlobalRankingOgVersion, buildRankingOgVersion } from './ranking-og-version';
import {
  type ResolveRankingShareDeps,
  resolveGlobalRankingShareImpl,
  resolvePersonalRankingShareImpl,
} from './resolve-ranking-share';

const AUTHOR_SPACE = 'author-space';
const OTHER_SPACE = 'other-space';
const BLOCK_SPACE = 'block-space';
const RANK_ID = 'aaaa1111bbbb2222cccc3333dddd4444';
const BLOCK_ID = 'bbbb1111cccc2222dddd3333eeee4444';
const PARENT_ID = 'parent-1';
const REL_ID = 'rel-1';
const START_DATE = '2024-01-01';
const END_DATE = '2024-02-01';

function rel(partial: Record<string, unknown>): Relation {
  return { isDeleted: false, position: null, toSpaceId: undefined, ...partial } as unknown as Relation;
}

function dateValue(propertyId: string, value: string): Value {
  return {
    id: `${propertyId}-v`,
    entity: { id: BLOCK_ID, name: null },
    property: { id: propertyId, name: null },
    value,
    spaceId: BLOCK_SPACE,
    isDeleted: false,
  } as unknown as Value;
}

const submittedRel = rel({
  id: 'sub-1',
  spaceId: AUTHOR_SPACE,
  type: { id: SUBMITTED_TO_PROPERTY_ID, name: 'Submitted to' },
  fromEntity: { id: RANK_ID, name: null },
  toEntity: { id: BLOCK_ID, name: null },
});
const voteRelA = rel({
  id: 'v-a',
  spaceId: AUTHOR_SPACE,
  position: 'a0',
  type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
  fromEntity: { id: RANK_ID, name: null },
  toEntity: { id: 'ent-a', name: null },
});
const voteRelB = rel({
  id: 'v-b',
  spaceId: AUTHOR_SPACE,
  position: 'a1',
  type: { id: RANK_VOTES_RELATION_TYPE_ID, name: null },
  fromEntity: { id: RANK_ID, name: null },
  toEntity: { id: 'ent-b', name: null },
});
const rankRelations = [submittedRel, voteRelA, voteRelB];

const rankEntity = {
  id: RANK_ID,
  name: 'Rank',
  description: null,
  spaces: [AUTHOR_SPACE],
  types: [{ id: RANK_TYPE_ID, name: 'Rank' }],
  relations: [],
  values: [],
} as unknown as Entity;

const blockUnscoped = {
  id: BLOCK_ID,
  name: 'My Ranking',
  description: null,
  spaces: [BLOCK_SPACE],
  types: [],
  relations: [],
  values: [],
} as unknown as Entity;

const blockScoped = {
  ...blockUnscoped,
  values: [dateValue(RANKING_START_TIME_PROPERTY_ID, START_DATE), dateValue(RANKING_END_TIME_PROPERTY_ID, END_DATE)],
} as unknown as Entity;

const personalCardData: RankingOgCardData = {
  kind: 'personal',
  rankEntityId: RANK_ID,
  authorSpaceId: AUTHOR_SPACE,
  blockEntityId: BLOCK_ID,
  blockEntitySpaceId: BLOCK_SPACE,
  rankingName: 'My Ranking',
  title: 'My Ranking',
  periodLabel: null,
  author: { name: 'Alice', avatarUrl: null, avatarSeed: 'seed' },
  entries: [
    { entityId: 'ent-a', name: 'A', description: null, image: null },
    { entityId: 'ent-b', name: 'B', description: null, image: null },
  ],
};

const profile = {
  id: 'profile-1',
  spaceId: AUTHOR_SPACE,
  name: 'Alice',
  avatarUrl: null,
  coverUrl: null,
  profileLink: null,
  address: '0x0',
} as unknown as Profile;

function personalDeps(overrides: Partial<ResolveRankingShareDeps> = {}): ResolveRankingShareDeps {
  return {
    fetchEntity: async (id, spaceId) => {
      if (id === RANK_ID) return rankEntity;
      if (id === BLOCK_ID) return spaceId ? blockScoped : blockUnscoped;
      return null;
    },
    fetchEntityPage: async (id, spaceId) => {
      if (id === RANK_ID && spaceId === AUTHOR_SPACE) return { entity: rankEntity, relations: rankRelations };
      return null;
    },
    fetchRelationsByToEntity: async blockId =>
      blockId === BLOCK_ID ? [{ id: REL_ID, fromEntityId: PARENT_ID, toEntityId: BLOCK_ID, spaceId: BLOCK_SPACE }] : [],
    fetchProfile: async () => profile,
    fetchEntities: async () => [],
    fetchPersonalCardData: async () => personalCardData,
    fetchGlobalCardData: async () => null,
    ...overrides,
  };
}

describe('resolvePersonalRankingShareImpl', () => {
  it('resolves all coordinates from the rank entity id', async () => {
    const resolved = await resolvePersonalRankingShareImpl(RANK_ID, personalDeps());

    expect(resolved).not.toBeNull();
    expect(resolved?.kind).toBe('personal');
    expect(resolved?.authorSpaceId).toBe(AUTHOR_SPACE);
    expect(resolved?.blockEntityId).toBe(BLOCK_ID);
    expect(resolved?.blockEntitySpaceId).toBe(BLOCK_SPACE);
    expect(resolved?.parentEntityId).toBe(PARENT_ID);
    expect(resolved?.relationId).toBe(REL_ID);
    expect(resolved?.rankingStartDate).toBe(START_DATE);
    expect(resolved?.rankingEndDate).toBe(END_DATE);
    expect(resolved?.rankingName).toBe('My Ranking');
    expect(resolved?.authorName).toBe('Alice');
  });

  it('recomputes ogVersion to match the publish-flow inputs (drift guard)', async () => {
    const resolved = await resolvePersonalRankingShareImpl(RANK_ID, personalDeps());

    const orderedEntityIds = getMyRankingOrderedEntityIds({ ...rankEntity, relations: rankRelations }, AUTHOR_SPACE);
    expect(orderedEntityIds).toEqual(['ent-a', 'ent-b']);

    const expectedVersion = buildRankingOgVersion({
      rankEntityId: RANK_ID,
      orderedEntityIds,
      rankingName: 'My Ranking',
      rankingStartDate: START_DATE,
      rankingEndDate: END_DATE,
      authorName: 'Alice',
      authorAvatarUrl: null,
    });

    expect(resolved?.ogVersion).toBe(expectedVersion);
  });

  it('returns null for a non-RANK entity', async () => {
    const notRank = { ...rankEntity, types: [{ id: 'something-else', name: 'Other' }] } as unknown as Entity;
    const resolved = await resolvePersonalRankingShareImpl(RANK_ID, personalDeps({ fetchEntity: async () => notRank }));
    expect(resolved).toBeNull();
  });

  it('returns null when the rank was not submitted to a block', async () => {
    const resolved = await resolvePersonalRankingShareImpl(
      RANK_ID,
      personalDeps({
        fetchEntityPage: async () => ({ entity: rankEntity, relations: [voteRelA, voteRelB] }),
      })
    );
    expect(resolved).toBeNull();
  });

  it('picks the author space that actually carries the SUBMITTED_TO relation (tie-break)', async () => {
    const multiSpaceRank = { ...rankEntity, spaces: [OTHER_SPACE, AUTHOR_SPACE] } as unknown as Entity;
    const resolved = await resolvePersonalRankingShareImpl(
      RANK_ID,
      personalDeps({
        fetchEntity: async (id, spaceId) => {
          if (id === RANK_ID) return multiSpaceRank;
          if (id === BLOCK_ID) return spaceId ? blockScoped : blockUnscoped;
          return null;
        },
        fetchEntityPage: async (id, spaceId) => {
          // OTHER_SPACE has no submitted-to relation; AUTHOR_SPACE does.
          if (id === RANK_ID && spaceId === AUTHOR_SPACE) return { entity: multiSpaceRank, relations: rankRelations };
          if (id === RANK_ID && spaceId === OTHER_SPACE) return { entity: multiSpaceRank, relations: [voteRelA] };
          return null;
        },
      })
    );

    expect(resolved?.authorSpaceId).toBe(AUTHOR_SPACE);
    expect(resolved?.blockEntityId).toBe(BLOCK_ID);
  });

  it('degrades to empty placement when no BLOCKS relation is found', async () => {
    const resolved = await resolvePersonalRankingShareImpl(
      RANK_ID,
      personalDeps({ fetchRelationsByToEntity: async () => [] })
    );
    expect(resolved).not.toBeNull();
    expect(resolved?.parentEntityId).toBe('');
    expect(resolved?.relationId).toBe('');
  });

  it('handles an empty date window', async () => {
    const noDates = { ...blockUnscoped } as unknown as Entity;
    const resolved = await resolvePersonalRankingShareImpl(
      RANK_ID,
      personalDeps({
        fetchEntity: async (id, spaceId) => {
          if (id === RANK_ID) return rankEntity;
          if (id === BLOCK_ID) return spaceId ? noDates : blockUnscoped;
          return null;
        },
        fetchPersonalCardData: async () => ({ ...personalCardData, periodLabel: null }),
      })
    );
    expect(resolved?.rankingStartDate).toBe('');
    expect(resolved?.rankingEndDate).toBe('');
  });

  it('resolves the full ordered list with display data to seed first paint', async () => {
    const resolved = await resolvePersonalRankingShareImpl(
      RANK_ID,
      personalDeps({
        fetchEntities: async ids =>
          ids.map(id => ({
            id,
            name: id === 'ent-a' ? 'Alpha' : 'Beta',
            description: id === 'ent-a' ? 'first' : null,
            relations: [],
            values: [],
          })) as unknown as Entity[],
      })
    );

    expect(resolved?.orderedEntityIds).toEqual(['ent-a', 'ent-b']);
    expect(resolved?.entries).toEqual([
      { entityId: 'ent-a', name: 'Alpha', description: 'first', image: null },
      { entityId: 'ent-b', name: 'Beta', description: null, image: null },
    ]);
  });

  it('falls back to "Untitled" entries when entity details are missing', async () => {
    const resolved = await resolvePersonalRankingShareImpl(RANK_ID, personalDeps({ fetchEntities: async () => [] }));

    expect(resolved?.orderedEntityIds).toEqual(['ent-a', 'ent-b']);
    expect(resolved?.entries).toEqual([
      { entityId: 'ent-a', name: 'Untitled', description: null, image: null },
      { entityId: 'ent-b', name: 'Untitled', description: null, image: null },
    ]);
  });

  it('returns null for an invalid id', async () => {
    const resolved = await resolvePersonalRankingShareImpl('not-a-uuid', personalDeps());
    expect(resolved).toBeNull();
  });
});

describe('resolveGlobalRankingShareImpl', () => {
  const globalRelA = rel({
    id: 'g-a',
    spaceId: BLOCK_SPACE,
    position: 'a0',
    type: { id: RANK_POSITION_PROPERTY_ID, name: null },
    fromEntity: { id: BLOCK_ID, name: null },
    toEntity: { id: 'ent-a', name: null },
  });
  const globalRelB = rel({
    id: 'g-b',
    spaceId: BLOCK_SPACE,
    position: 'a1',
    type: { id: RANK_POSITION_PROPERTY_ID, name: null },
    fromEntity: { id: BLOCK_ID, name: null },
    toEntity: { id: 'ent-b', name: null },
  });
  const globalRelations = [globalRelA, globalRelB];

  const globalCardData: RankingOgCardData = {
    kind: 'global',
    rankEntityId: '',
    authorSpaceId: '',
    blockEntityId: BLOCK_ID,
    blockEntitySpaceId: BLOCK_SPACE,
    rankingName: 'My Ranking',
    title: 'My Ranking',
    periodLabel: null,
    author: { name: '', avatarUrl: null, avatarSeed: BLOCK_ID },
    entries: [
      { entityId: 'ent-a', name: 'A', description: null, image: null },
      { entityId: 'ent-b', name: 'B', description: null, image: null },
    ],
  };

  function globalDeps(overrides: Partial<ResolveRankingShareDeps> = {}): ResolveRankingShareDeps {
    return {
      fetchEntity: async (id, spaceId) => (id === BLOCK_ID ? (spaceId ? blockScoped : blockUnscoped) : null),
      fetchEntityPage: async (id, spaceId) =>
        id === BLOCK_ID && spaceId === BLOCK_SPACE ? { entity: blockScoped, relations: globalRelations } : null,
      fetchRelationsByToEntity: async () => [
        { id: REL_ID, fromEntityId: PARENT_ID, toEntityId: BLOCK_ID, spaceId: BLOCK_SPACE },
      ],
      fetchProfile: async () => null,
      fetchEntities: async () =>
        [
          { id: 'ent-a', name: 'A', description: null, relations: [], values: [] },
          { id: 'ent-b', name: 'B', description: null, relations: [], values: [] },
        ] as unknown as Entity[],
      fetchPersonalCardData: async () => null,
      fetchGlobalCardData: async () => globalCardData,
      ...overrides,
    };
  }

  it('resolves global coordinates and ogVersion from the block id', async () => {
    const resolved = await resolveGlobalRankingShareImpl(BLOCK_ID, globalDeps());

    expect(resolved?.kind).toBe('global');
    expect(resolved?.blockEntitySpaceId).toBe(BLOCK_SPACE);
    expect(resolved?.parentEntityId).toBe(PARENT_ID);
    expect(resolved?.relationId).toBe(REL_ID);
    expect(resolved?.rankingStartDate).toBe(START_DATE);
    expect(resolved?.rankingEndDate).toBe(END_DATE);

    const expectedVersion = buildGlobalRankingOgVersion({
      blockEntityId: BLOCK_ID,
      orderedEntityIds: ['ent-a', 'ent-b'],
      rankingName: 'My Ranking',
      rankingStartDate: START_DATE,
      rankingEndDate: END_DATE,
    });
    expect(resolved?.globalOgVersion).toBe(expectedVersion);
  });

  it('resolves the full ordered list with display data to seed first paint', async () => {
    const resolved = await resolveGlobalRankingShareImpl(BLOCK_ID, globalDeps());

    expect(resolved?.orderedEntityIds).toEqual(['ent-a', 'ent-b']);
    expect(resolved?.entries).toEqual([
      { entityId: 'ent-a', name: 'A', description: null, image: null },
      { entityId: 'ent-b', name: 'B', description: null, image: null },
    ]);
  });

  it('returns null when the block is missing', async () => {
    const resolved = await resolveGlobalRankingShareImpl(BLOCK_ID, globalDeps({ fetchEntity: async () => null }));
    expect(resolved).toBeNull();
  });
});
