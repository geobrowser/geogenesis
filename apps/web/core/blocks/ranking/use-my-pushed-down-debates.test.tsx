import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { act, cleanup, renderHook } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEBATES_SPACE_ID, DEBATE_TYPE_ID } from './best-debates';
import type { StepResult } from './push-down';
import {
  type PushedDownDebate,
  useClearPushedDownBeforeRanking,
  useMyPushedDownDebates,
} from './use-my-pushed-down-debates';

const PERSONAL = 'd4bee0928fb5405baba3b1513f085835';
const DEBATE_SPACE = '1234567890abcdef1234567890abcdef';
const D1 = 'd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1';
const D2 = 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2';
const CLAIM = 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1';
const STANCE_DEBATE = 'd3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3';

const mocks = vi.hoisted(() => ({
  votedIds: [] as string[],
  voteKinds: new Map<string, number>(),
  entities: [] as object[],
  queryWhere: null as unknown,
  sendVote: vi.fn<(args: { debateId: string; spaceId: string; direction: string }) => Promise<StepResult>>(),
  setToast: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: PERSONAL, isRegistered: true }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('~/core/hooks/use-user-voted-entity-ids', () => ({
  useUserVotedEntityIds: () => ({
    ids: mocks.votedIds,
    voteKindById: mocks.voteKinds,
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  }),
}));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where }: { where: unknown }) => {
    mocks.queryWhere = where;
    return { entities: mocks.entities, isLoading: false };
  },
}));
vi.mock('./use-debate-downvote', () => ({ useDebateDownvoteWriter: () => mocks.sendVote }));

function entity(id: string, typeId: string, spaceId = DEBATE_SPACE) {
  return {
    id,
    name: `Entity ${id.slice(0, 2)}`,
    types: [{ id: typeId, name: null }],
    spaces: [DEBATES_SPACE_ID, spaceId],
    values: [{ property: { id: SystemIds.NAME_PROPERTY }, spaceId, value: `Entity ${id.slice(0, 2)}` }],
    relations: [],
  };
}

beforeEach(() => {
  mocks.votedIds = [];
  mocks.voteKinds = new Map();
  mocks.entities = [];
  mocks.sendVote.mockReset();
  mocks.setToast.mockReset();
});

afterEach(() => cleanup());

describe('useMyPushedDownDebates', () => {
  it('lists only the member’s curation downvotes on debates, newest first, with each debate’s own space', () => {
    mocks.votedIds = [D2, CLAIM, STANCE_DEBATE, D1];
    mocks.voteKinds = new Map([
      [D2, 0],
      [CLAIM, 0],
      [STANCE_DEBATE, 1],
      [D1, 0],
    ]);
    mocks.entities = [entity(D1, DEBATE_TYPE_ID), entity(CLAIM, 'someclaimtype'), entity(D2, DEBATE_TYPE_ID)];

    const { result } = renderHook(() => useMyPushedDownDebates({ blockId: 'block' }));

    expect(result.current.debates.map(debate => debate.entityId)).toEqual([D2, D1]);
    expect(result.current.debates[0].debateSpaceId).toBe(DEBATE_SPACE);
    expect(mocks.queryWhere).toMatchObject({ types: [{ id: { equals: DEBATE_TYPE_ID } }] });
  });

  it('is empty until the block exists', () => {
    mocks.votedIds = [D1];
    mocks.entities = [entity(D1, DEBATE_TYPE_ID)];
    const { result } = renderHook(() => useMyPushedDownDebates({ blockId: null }));
    expect(result.current.debates).toEqual([]);
  });
});

describe('useClearPushedDownBeforeRanking', () => {
  const pushed = (id: string): PushedDownDebate => ({
    entityId: id,
    name: id,
    description: null,
    image: null,
    debateSpaceId: DEBATE_SPACE,
  });

  it('clears the downvote of each pushed-down debate in the ballot, one at a time, before publishing', async () => {
    const order: string[] = [];
    mocks.sendVote.mockImplementation(async ({ debateId }) => {
      order.push(debateId);
      return { ok: true };
    });
    const { result } = renderHook(() => useClearPushedDownBeforeRanking([pushed(D1), pushed(D2)]));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current([D2, 'unrelated']);
    });

    expect(ok).toBe(true);
    expect(order).toEqual([D2]);
    expect(mocks.sendVote).toHaveBeenCalledWith(
      expect.objectContaining({ debateId: D2, spaceId: DEBATE_SPACE, direction: 'clear' })
    );
  });

  it('stops the publish when a clear fails', async () => {
    mocks.sendVote.mockResolvedValueOnce({ ok: false, message: 'nope' });
    const { result } = renderHook(() => useClearPushedDownBeforeRanking([pushed(D1), pushed(D2)]));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current([D1, D2]);
    });

    expect(ok).toBe(false);
    expect(mocks.sendVote).toHaveBeenCalledTimes(1);
    expect(mocks.setToast).toHaveBeenCalled();
  });
});
