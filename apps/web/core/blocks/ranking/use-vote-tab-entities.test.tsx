import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { act, renderHook } from '@testing-library/react';

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
/** A space other than the one the data block is scoped to. */
const OTHER_SPACE_ID = '55555555-5555-5555-5555-555555555555';
const hex = (uuid: string) => ID.uuidToHex(uuid);

const CURATION = 0;
const STANCE = 1;
const VERACITY = 2;

/** A plain entity: not a claim, so it's answered with an ordinary upvote. */
const plainEntity = (id: string): TestEntity => ({ id, relations: [], values: [] });

const claimEntity = (
  id: string,
  { isFactual, spaceId = SPACE_ID }: { isFactual: boolean; spaceId?: string }
): TestEntity => ({
  id,
  relations: [{ type: { id: SystemIds.TYPES_PROPERTY }, toEntity: { id: CLAIM_TYPE_ID }, isDeleted: false }],
  values: [
    { spaceId, property: { id: SystemIds.NAME_PROPERTY }, value: 'A claim', isDeleted: false },
    ...(isFactual ? [{ spaceId, property: { id: CLAIM_IS_FACTUAL_PROPERTY_ID }, value: '1', isDeleted: false }] : []),
  ],
});

const mocks = vi.hoisted(() => ({
  idPages: [] as string[][],
  queryEntitiesCalls: [] as unknown[],
  entitiesById: new Map<string, { id: string }>(),
  voteKindById: new Map<string, number>(),
  entitiesError: null as Error | null,
  refetchEntities: vi.fn(),
  refetchVotedIds: vi.fn(),
  fetchNextVotedIdsPage: vi.fn(),
}));

vi.mock('~/core/blocks/data/use-data-block', () => ({
  useDataBlock: () => ({ filterState: [], modesByColumn: {}, spaceId: '44444444-4444-4444-4444-444444444444' }),
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
    refetch: mocks.refetchVotedIds,
    fetchNextPage: mocks.fetchNextVotedIdsPage,
  }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: (args: QueryEntitiesArgs) => {
    mocks.queryEntitiesCalls.push(args);
    const requested = args.where.id?.in ?? [];
    return {
      // A failed sync falls back to the local store, so an error still settles
      // as fetched with (usually) nothing in hand.
      entities: mocks.entitiesError ? [] : requested.map(id => mocks.entitiesById.get(id)).filter(Boolean),
      isLoading: false,
      isFetched: requested.length > 0,
      isPlaceholderData: false,
      error: mocks.entitiesError,
      refetch: mocks.refetchEntities,
    };
  },
}));

beforeEach(() => {
  mocks.idPages = [];
  mocks.queryEntitiesCalls = [];
  mocks.entitiesById = new Map(ENTITY_IDS.map(id => [hex(id), plainEntity(id)]));
  mocks.voteKindById = new Map(ENTITY_IDS.map(id => [hex(id), CURATION]));
  mocks.entitiesError = null;
  mocks.refetchEntities = vi.fn();
  mocks.refetchVotedIds = vi.fn();
  mocks.fetchNextVotedIdsPage = vi.fn();
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

  // Committing an errored page would bank it as hydrated and never retry it,
  // leaving a silently empty tab with no error affordance.
  it('surfaces a hydration failure instead of banking an empty page', () => {
    mocks.idPages = [[hex(FIRST), hex(SECOND)]];
    mocks.entitiesError = new Error('sync failed');
    const { result, rerender } = renderHook(() => useVoteTabEntities('up'));

    expect(result.current.isError).toBe(true);
    expect(result.current.isFetchingNextPage).toBe(false);
    expect(result.current.orderedIds).toEqual([]);

    // The page stayed a gap, so recovering re-fetches it rather than skipping ahead.
    mocks.entitiesError = null;
    rerender();

    expect(result.current.isError).toBe(false);
    expect(result.current.orderedIds).toEqual([FIRST, SECOND]);
  });

  // The ids query stays healthy when the entity fetch is the one failing, so
  // nothing else stops the consumer's scroll sentinel from paging through the
  // viewer's whole vote history while no page can hydrate.
  it('stops paginating while a hydration failure is unresolved', () => {
    mocks.idPages = [[hex(FIRST), hex(SECOND)]];
    mocks.entitiesError = new Error('sync failed');
    const { result, rerender } = renderHook(() => useVoteTabEntities('up'));

    expect(result.current.hasNextPage).toBe(false);

    act(() => result.current.fetchNextPage());

    expect(mocks.fetchNextVotedIdsPage).not.toHaveBeenCalled();

    // Recovering restores pagination.
    mocks.entitiesError = null;
    rerender();

    expect(result.current.hasNextPage).toBe(true);

    act(() => result.current.fetchNextPage());

    expect(mocks.fetchNextVotedIdsPage).toHaveBeenCalledTimes(1);
  });

  // The ids already survive a tab switch; the hydrated entries have to as well,
  // or coming back to a tab re-walks every page — and because the votes query is
  // cached by then, nothing reports loading while it does.
  it('keeps hydrated pages when the viewer leaves a tab and comes back', () => {
    mocks.idPages = [[hex(FIRST), hex(SECOND)], [hex(THIRD)]];
    const { result, rerender } = renderHook(({ direction }) => useVoteTabEntities(direction), {
      initialProps: { direction: 'up' as 'up' | 'down' | null },
    });

    expect(result.current.orderedIds).toEqual([FIRST, SECOND, THIRD]);

    // Global: the hook is disabled and the tab holds nothing.
    rerender({ direction: null });
    expect(result.current.orderedIds).toEqual([]);

    const callsBeforeReturn = mocks.queryEntitiesCalls.length;
    rerender({ direction: 'up' });

    expect(result.current.orderedIds).toEqual([FIRST, SECOND, THIRD]);
    expect(result.current.isLoading).toBe(false);

    // Nothing re-fetches page 0 — the accumulation was still there.
    const callsAfterReturn = mocks.queryEntitiesCalls.slice(callsBeforeReturn) as QueryEntitiesArgs[];
    expect(callsAfterReturn.some(call => call.where.id?.in?.includes(hex(FIRST)))).toBe(false);
  });

  it('keeps each direction accumulated separately', () => {
    mocks.idPages = [[hex(FIRST)]];
    const { result, rerender } = renderHook(({ direction }) => useVoteTabEntities(direction), {
      initialProps: { direction: 'up' as 'up' | 'down' | null },
    });

    expect(result.current.orderedIds).toEqual([FIRST]);

    // The other direction is a different list, so its entries must not leak in.
    mocks.idPages = [[hex(SECOND)]];
    rerender({ direction: 'down' });

    expect(result.current.orderedIds).toEqual([SECOND]);
  });

  it('retries both the voted ids and the entity hydration', () => {
    mocks.idPages = [[hex(FIRST)]];
    const { result } = renderHook(() => useVoteTabEntities('up'));

    result.current.retry();

    expect(mocks.refetchVotedIds).toHaveBeenCalled();
    expect(mocks.refetchEntities).toHaveBeenCalled();
  });

  // The ids arrive through an effect, so the first render always sees none of
  // them; a cached revisit then delivers every page in one go.
  it('hydrates the first page when the cached ids arrive after the first render', () => {
    const { result, rerender } = renderHook(() => useVoteTabEntities('up'));

    expect(result.current.orderedIds).toEqual([]);

    mocks.idPages = [[hex(FIRST), hex(SECOND)], [hex(THIRD)]];
    rerender();

    expect(result.current.orderedIds).toEqual([FIRST, SECOND, THIRD]);
  });

  it('re-hydrates an earlier page whose ids changed under it', () => {
    mocks.idPages = [[hex(FIRST)], [hex(THIRD)]];
    const { result, rerender } = renderHook(() => useVoteTabEntities('up'));

    expect(result.current.orderedIds).toEqual([FIRST, THIRD]);

    // A restored vote lands in the first page rather than the last.
    mocks.idPages = [[hex(FIRST), hex(SECOND)], [hex(THIRD)]];
    rerender();

    expect(result.current.orderedIds).toEqual([FIRST, SECOND, THIRD]);
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

    // Votes span every space the viewer has voted in, but Is Factual is only
    // readable in the claim's own space — resolving against the block's space
    // downgrades a verified claim to a stance and drops it.
    it('keeps a claim verified in a space other than the block’s', () => {
      mocks.entitiesById = new Map([[hex(FIRST), claimEntity(FIRST, { isFactual: true, spaceId: OTHER_SPACE_ID })]]);
      mocks.voteKindById = new Map([[hex(FIRST), VERACITY]]);
      mocks.idPages = [[hex(FIRST)]];

      const { result } = renderHook(() => useVoteTabEntities('up'));

      expect(result.current.orderedIds).toEqual([FIRST]);
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
