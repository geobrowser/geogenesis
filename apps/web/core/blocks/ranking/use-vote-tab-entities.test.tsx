import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_IS_FACTUAL_PROPERTY_ID, CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { ID } from '~/core/id';

import { useVoteTabEntities } from './use-vote-tab-entities';

type QueryEntitiesArgs = {
  where: { id?: { in?: string[] } };
  first: number;
  enabled: boolean;
  deferUntilFetched?: boolean;
};

type TestEntity = { id: string; relations: unknown[]; values: unknown[] };

const ENTITY_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
];
const [FIRST, SECOND, THIRD] = ENTITY_IDS;
const SPACE_ID = '44444444-4444-4444-4444-444444444444';
const hex = (uuid: string) => ID.uuidToHex(uuid);

const CURATION = 0;
const STANCE = 1;
const VERACITY = 2;

/** A plain entity: not a claim, so it's answered with an ordinary upvote. */
const plainEntity = (id: string): TestEntity => ({ id, relations: [], values: [] });

const claimEntity = (id: string, { isFactual }: { isFactual: boolean }): TestEntity => ({
  id,
  relations: [{ type: { id: SystemIds.TYPES_PROPERTY }, toEntity: { id: CLAIM_TYPE_ID }, isDeleted: false }],
  values: isFactual
    ? [{ spaceId: SPACE_ID, property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, value: '1', isDeleted: false }]
    : [],
});

const mocks = vi.hoisted(() => ({
  idPages: [] as string[][],
  queryEntitiesCalls: [] as unknown[],
  entitiesById: new Map<string, { id: string }>(),
  voteKindById: new Map<string, number>(),
}));

vi.mock('~/core/blocks/data/use-data-block', () => ({
  useDataBlock: () => ({ filterState: [], filterMode: 'AND', spaceId: '44444444-4444-4444-4444-444444444444' }),
  filterStateToWhere: () => ({ types: [{ is: 'type-id' }] }),
}));

vi.mock('~/core/hooks/use-user-voted-entity-ids', () => ({
  useUserVotedEntityIds: () => ({
    ids: mocks.idPages.flat(),
    idPages: mocks.idPages,
    voteKindById: mocks.voteKindById,
    isLoading: false,
    hasNextPage: true,
    isFetchingNextPage: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: (args: QueryEntitiesArgs) => {
    mocks.queryEntitiesCalls.push(args);
    const requested = args.where.id?.in ?? [];
    return {
      entities: requested.map(id => mocks.entitiesById.get(id)).filter(Boolean),
      isLoading: false,
      isFetched: requested.length > 0,
      isPlaceholderData: false,
    };
  },
}));

beforeEach(() => {
  mocks.idPages = [];
  mocks.queryEntitiesCalls = [];
  mocks.entitiesById = new Map(ENTITY_IDS.map(id => [hex(id), plainEntity(id)]));
  mocks.voteKindById = new Map(ENTITY_IDS.map(id => [hex(id), CURATION]));
});

const lastCall = () => mocks.queryEntitiesCalls[mocks.queryEntitiesCalls.length - 1] as QueryEntitiesArgs;

describe('useVoteTabEntities', () => {
  it('hydrates only the newest page of voted ids, not the accumulated list', () => {
    mocks.idPages = [[hex(FIRST), hex(SECOND)]];
    const { rerender } = renderHook(() => useVoteTabEntities('up'));

    expect(lastCall().where.id?.in).toEqual([hex(FIRST), hex(SECOND)]);

    mocks.idPages = [[hex(FIRST), hex(SECOND)], [hex(THIRD)]];
    rerender();

    expect(lastCall().where.id?.in).toEqual([hex(THIRD)]);
    expect(lastCall().first).toBe(1);
  });

  it('keeps earlier pages in the result once a later page is hydrated', () => {
    mocks.idPages = [[hex(FIRST), hex(SECOND)]];
    const { result, rerender } = renderHook(() => useVoteTabEntities('up'));

    expect(result.current.orderedIds).toEqual([FIRST, SECOND]);

    mocks.idPages = [[hex(FIRST), hex(SECOND)], [hex(THIRD)]];
    rerender();

    expect(result.current.orderedIds).toEqual([FIRST, SECOND, THIRD]);
  });

  it('catches up page by page when several pages arrive at once, as on a cached revisit', () => {
    mocks.idPages = [[hex(FIRST), hex(SECOND)], [hex(THIRD)]];
    const { result } = renderHook(() => useVoteTabEntities('up'));

    expect(result.current.orderedIds).toEqual([FIRST, SECOND, THIRD]);
    expect(mocks.queryEntitiesCalls.length).toBeGreaterThanOrEqual(2);
    expect(lastCall().where.id?.in).toEqual([hex(THIRD)]);
  });

  it('returns display entries alongside the ids so callers need no second entity query', () => {
    mocks.idPages = [[hex(FIRST), hex(SECOND)]];
    const { result } = renderHook(() => useVoteTabEntities('up'));

    expect(result.current.entries.map(entry => entry.entityId)).toEqual([FIRST, SECOND]);
    expect(result.current.entries.every(entry => entry.name === 'Untitled')).toBe(true);
  });

  it('defers to the fetched page rather than reading through the store', () => {
    mocks.idPages = [[hex(FIRST)]];
    renderHook(() => useVoteTabEntities('up'));

    expect(lastCall().deferUntilFetched).toBe(true);
  });

  it('runs no hydration query when the tab is closed', () => {
    mocks.idPages = [[hex(FIRST)]];
    const { result } = renderHook(() => useVoteTabEntities(null));

    expect(lastCall().enabled).toBe(false);
    expect(result.current.orderedIds).toEqual([]);
    expect(result.current.entries).toEqual([]);
  });

  describe('response kinds', () => {
    it('keeps a claim answered with the action it still asks for', () => {
      mocks.entitiesById = new Map([
        [hex(FIRST), claimEntity(FIRST, { isFactual: true })],
        [hex(SECOND), claimEntity(SECOND, { isFactual: false })],
      ]);
      mocks.voteKindById = new Map([
        [hex(FIRST), VERACITY],
        [hex(SECOND), STANCE],
      ]);
      mocks.idPages = [[hex(FIRST), hex(SECOND)]];

      const { result } = renderHook(() => useVoteTabEntities('up'));

      expect(result.current.orderedIds).toEqual([FIRST, SECOND]);
    });

    it('drops a claim whose response kind changed since the vote', () => {
      mocks.entitiesById = new Map([[hex(FIRST), claimEntity(FIRST, { isFactual: true })]]);
      mocks.voteKindById = new Map([[hex(FIRST), STANCE]]);
      mocks.idPages = [[hex(FIRST)]];

      const { result } = renderHook(() => useVoteTabEntities('up'));

      expect(result.current.orderedIds).toEqual([]);
    });

    it('drops a plain entity carrying a claim-only vote kind', () => {
      mocks.entitiesById = new Map([[hex(FIRST), plainEntity(FIRST)]]);
      mocks.voteKindById = new Map([[hex(FIRST), VERACITY]]);
      mocks.idPages = [[hex(FIRST)]];

      const { result } = renderHook(() => useVoteTabEntities('up'));

      expect(result.current.orderedIds).toEqual([]);
    });

    it('drops an entity with no recorded vote kind', () => {
      mocks.entitiesById = new Map([[hex(FIRST), plainEntity(FIRST)]]);
      mocks.voteKindById = new Map();
      mocks.idPages = [[hex(FIRST)]];

      const { result } = renderHook(() => useVoteTabEntities('up'));

      expect(result.current.orderedIds).toEqual([]);
    });
  });
});
