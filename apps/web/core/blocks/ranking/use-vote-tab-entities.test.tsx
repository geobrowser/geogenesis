import { renderHook } from '@testing-library/react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ID } from '~/core/id';

import { useVoteTabEntities } from './use-vote-tab-entities';

type QueryEntitiesArgs = {
  where: { id?: { in?: string[] } };
  first: number;
  enabled: boolean;
  deferUntilFetched?: boolean;
};

const ENTITY_IDS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
];
const [FIRST, SECOND, THIRD] = ENTITY_IDS;
const hex = (uuid: string) => ID.uuidToHex(uuid);

const mocks = vi.hoisted(() => ({
  idPages: [] as string[][],
  queryEntitiesCalls: [] as unknown[],
  entitiesById: new Map<string, { id: string }>(),
}));

vi.mock('~/core/blocks/data/use-data-block', () => ({
  useDataBlock: () => ({ filterState: [], filterMode: 'AND' }),
  filterStateToWhere: () => ({ types: [{ is: 'type-id' }] }),
}));

vi.mock('~/core/hooks/use-user-voted-entity-ids', () => ({
  useUserVotedEntityIds: () => ({
    ids: mocks.idPages.flat(),
    idPages: mocks.idPages,
    isLoading: false,
    hasNextPage: true,
    isFetchingNextPage: false,
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
  mocks.entitiesById = new Map(ENTITY_IDS.map(id => [hex(id), { id }]));
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
  });
});
