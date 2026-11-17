import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

import type { ReactNode } from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEBATES_SPACE_ID, DEBATE_TYPE_ID } from './best-debates';
import type { MemberVoteRecord } from './fetch-member-debate-votes';
import { RANK_CLEAR_FAILED_COPY } from './push-down';
import {
  BALLOT_DOWNVOTE_CHECK_FAILED_COPY,
  ballotClearsLeftCopy,
  useBestDebatesBallotPublisher,
  useMyPushedDownDebates,
} from './use-my-pushed-down-debates';
import { pushDownStateQueryKey } from './use-push-down';

const PERSONAL = 'd4bee0928fb5405baba3b1513f085835';
const DEBATE_SPACE = '1234567890abcdef1234567890abcdef';
const CLAIM_SPACE = 'c1a1c1a1c1a1c1a1c1a1c1a1c1a1c1a1';
const D1 = 'd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1';
const D2 = 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2';
const CLAIM = 'c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1';

const mocks = vi.hoisted(() => ({
  downvotes: [] as MemberVoteRecord[] | Error,
  entities: [] as object[],
  queryWhere: null as unknown,
  sendVote:
    vi.fn<
      (args: {
        debateId: string;
        spaceId: string;
        direction: string;
      }) => Promise<{ ok: true; records: MemberVoteRecord[] } | { ok: false; message: string }>
    >(),
  setToast: vi.fn(),
  historyReads: 0,
  draftReads: [] as string[][],
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: PERSONAL, isRegistered: true }),
}));
vi.mock('~/core/hooks/use-toast', () => ({ useSetToast: () => mocks.setToast }));
vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: ({ where }: { where: unknown }) => {
    mocks.queryWhere = where;
    return { entities: mocks.entities, isLoading: false };
  },
}));
vi.mock('./fetch-member-debate-votes', async importOriginal => ({
  ...(await importOriginal<typeof import('./fetch-member-debate-votes')>()),
  fetchMemberDebateDownvotes: async () => {
    mocks.historyReads += 1;
    if (mocks.downvotes instanceof Error) throw mocks.downvotes;
    return mocks.downvotes;
  },
  fetchMemberDownvotesOn: async (_member: string, objectIds: readonly string[]) => {
    mocks.draftReads.push([...objectIds]);
    if (mocks.downvotes instanceof Error) throw mocks.downvotes;
    return mocks.downvotes.filter(record => objectIds.includes(record.objectId));
  },
}));
vi.mock('./use-debate-downvote', async importOriginal => ({
  ...(await importOriginal<typeof import('./use-debate-downvote')>()),
  useDebateVoteWriter: () => mocks.sendVote,
}));
// The real hook module pulls in the ballot writers; only its state key is used here.
vi.mock('./use-push-down', () => ({
  pushDownStateQueryKey: (member: string | null, debateId: string) => ['push-down-state', member, debateId],
}));

const record = (objectId: string, spaceId: string, votedAt: string): MemberVoteRecord => ({
  objectId,
  spaceId,
  direction: 'negative',
  votedAt,
});

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

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  mocks.downvotes = [];
  mocks.entities = [];
  mocks.sendVote.mockReset();
  mocks.sendVote.mockImplementation(async () => ({ ok: true, records: [] }));
  mocks.setToast.mockReset();
  mocks.historyReads = 0;
  mocks.draftReads = [];
});

afterEach(() => cleanup());

describe('useMyPushedDownDebates', () => {
  it('lists every debate the member downvoted, in any space, newest first, with each space', async () => {
    mocks.downvotes = [
      record(D2, CLAIM_SPACE, '2026-11-03'),
      record(CLAIM, DEBATE_SPACE, '2026-11-02'),
      record(D1, DEBATE_SPACE, '2026-11-01'),
      record(D2, DEBATE_SPACE, '2026-10-01'),
    ];
    mocks.entities = [entity(D1, DEBATE_TYPE_ID), entity(CLAIM, 'someclaimtype'), entity(D2, DEBATE_TYPE_ID)];

    const { wrapper } = harness();
    const { result } = renderHook(() => useMyPushedDownDebates({ blockId: 'block' }), { wrapper });

    await waitFor(() => expect(result.current.debates.map(debate => debate.entityId)).toEqual([D2, D1]));
    expect(result.current.debates[0].downvotedSpaceIds).toEqual([CLAIM_SPACE, DEBATE_SPACE]);
    expect(result.current.debates[0].debateSpaceId).toBe(DEBATE_SPACE);
    expect(mocks.queryWhere).toMatchObject({ types: [{ id: { equals: DEBATE_TYPE_ID } }] });
  });

  it('is empty until the block exists', async () => {
    mocks.downvotes = [record(D1, DEBATE_SPACE, '2026-11-01')];
    mocks.entities = [entity(D1, DEBATE_TYPE_ID)];
    const { wrapper } = harness();
    const { result } = renderHook(() => useMyPushedDownDebates({ blockId: null }), { wrapper });
    expect(result.current.debates).toEqual([]);
  });
});

describe('useBestDebatesBallotPublisher', () => {
  it('reads the downvotes, publishes, then clears each downvote record one by one', async () => {
    mocks.downvotes = [record(D1, CLAIM_SPACE, '2026-11-02'), record(D1, DEBATE_SPACE, '2026-11-01')];
    const events: string[] = [];
    mocks.sendVote.mockImplementation(async ({ spaceId }) => {
      events.push(`clear:${spaceId}`);
      return { ok: true, records: [] };
    });
    const save = vi.fn(async () => {
      events.push('publish');
      return { rankEntityId: 'rank1', orderedEntityIds: [D1, D2] };
    });

    const { wrapper } = harness();
    const { result } = renderHook(() => useBestDebatesBallotPublisher(), { wrapper });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.publish([D1, D2], save);
    });

    expect(events).toEqual(['publish', `clear:${CLAIM_SPACE}`, `clear:${DEBATE_SPACE}`]);
    // Only the ballot's debates are read, never the member's whole history.
    expect(mocks.draftReads).toEqual([[D1, D2]]);
    expect(mocks.historyReads).toBe(0);
    expect(outcome).toEqual({ published: { rankEntityId: 'rank1', orderedEntityIds: [D1, D2] }, failedClears: 0 });
  });

  it('leaves a debate pushed down when the publish merge dropped it from the ballot', async () => {
    // Device A pushed D1 down (and took it off the ballot); device B still holds a stale draft with
    // D1 in it. The publish path merges onto A's ballot and drops D1, so its downvote must stay.
    mocks.downvotes = [record(D1, DEBATE_SPACE, '2026-11-02'), record(D2, DEBATE_SPACE, '2026-11-01')];
    const cleared: string[] = [];
    mocks.sendVote.mockImplementation(async ({ debateId }) => {
      cleared.push(debateId);
      return { ok: true, records: [] };
    });
    const { wrapper } = harness();
    const { result } = renderHook(() => useBestDebatesBallotPublisher(), { wrapper });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.publish([D1, D2], async () => ({
        rankEntityId: 'rank1',
        orderedEntityIds: [D2],
      }));
    });

    expect(cleared).toEqual([D2]);
    expect(outcome).toMatchObject({ failedClears: 0 });
  });

  it('publishes nothing when the downvotes can’t be read', async () => {
    mocks.downvotes = new Error('down');
    const save = vi.fn(async () => ({ rankEntityId: 'rank1', orderedEntityIds: [D1] }));
    const { wrapper } = harness();
    const { result } = renderHook(() => useBestDebatesBallotPublisher(), { wrapper });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.publish([D1], save);
    });

    expect(outcome).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(mocks.setToast).toHaveBeenCalledWith(
      expect.objectContaining({ props: { children: BALLOT_DOWNVOTE_CHECK_FAILED_COPY } })
    );
  });

  it('clears nothing when the publish fails, so no debate ends up neither ranked nor pushed down', async () => {
    mocks.downvotes = [record(D1, DEBATE_SPACE, '2026-11-01')];
    const { wrapper } = harness();
    const { result } = renderHook(() => useBestDebatesBallotPublisher(), { wrapper });
    await act(async () => {
      await result.current.publish([D1], async () => null);
    });
    expect(mocks.sendVote).not.toHaveBeenCalled();
  });

  it('a failed clear leaves that debate ranked and pushed down, with Retry, and says so', async () => {
    mocks.downvotes = [record(D1, DEBATE_SPACE, '2026-11-02'), record(D2, DEBATE_SPACE, '2026-11-01')];
    mocks.sendVote.mockImplementation(async ({ debateId }) =>
      debateId === D1 ? { ok: false, message: 'nope' } : { ok: true, records: [] }
    );
    const { client, wrapper } = harness();
    const { result } = renderHook(() => useBestDebatesBallotPublisher(), { wrapper });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.publish([D1, D2], async () => ({
        rankEntityId: 'rank1',
        orderedEntityIds: [D1, D2],
      }));
    });

    expect(outcome).toMatchObject({ failedClears: 1 });
    expect(mocks.sendVote).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(pushDownStateQueryKey(PERSONAL, D1))).toEqual({
      status: 'failed',
      action: 'rank',
      step: 'vote',
      partly: true,
      message: RANK_CLEAR_FAILED_COPY,
    });
    expect(mocks.setToast).toHaveBeenCalledWith(
      expect.objectContaining({ props: { children: ballotClearsLeftCopy(1) } })
    );
  });

  it('ignores a second press while a publish is running, and reports it as busy throughout', async () => {
    let finishSave!: (value: { rankEntityId: string; orderedEntityIds: string[] }) => void;
    const save = vi.fn(() => new Promise<{ rankEntityId: string; orderedEntityIds: string[] }>(r => (finishSave = r)));
    const { wrapper } = harness();
    const { result } = renderHook(() => useBestDebatesBallotPublisher(), { wrapper });

    let first!: Promise<unknown>;
    let second: unknown;
    act(() => {
      first = result.current.publish([D1], save);
    });
    await waitFor(() => expect(result.current.isPublishing).toBe(true));
    await act(async () => {
      second = await result.current.publish([D1], save);
    });

    expect(second).toBeNull();
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await act(async () => {
      finishSave({ rankEntityId: 'rank1', orderedEntityIds: [D1] });
      await first;
    });
    expect(save).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.isPublishing).toBe(false));
  });
});
