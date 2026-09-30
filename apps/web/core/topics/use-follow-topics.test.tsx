import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { followedTopicsQueryKey } from '~/core/io/subgraph/fetch-followed-topics';
import type { Relation } from '~/core/types';

import type { FollowedTopicRelation } from './follow-ops';
import { useFollowTopics } from './use-follow-topics';

const mocks = vi.hoisted(() => ({
  makeProposal: vi.fn(),
  reconcile: vi.fn(),
  fetchFollowedTopics: vi.fn(),
  personalSpaceId: '11111111111111111111111111111111' as string | null,
}));

vi.mock('~/core/hooks/use-publish', () => ({ usePublish: () => ({ makeProposal: mocks.makeProposal }) }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isLoading: false }),
}));
vi.mock('~/core/bounties/reconcile-store', () => ({ reconcileDeletedRelations: mocks.reconcile }));
vi.mock('~/core/io/subgraph/fetch-followed-topics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/subgraph/fetch-followed-topics')>()),
  fetchFollowedTopics: mocks.fetchFollowedTopics,
}));

const SPACE = '11111111111111111111111111111111';
const TOPIC_A = '22222222222222222222222222222222';
const TOPIC_B = '33333333333333333333333333333333';

type ProposalArgs = { relations: Relation[]; name: string; onSuccess: () => void; onError: () => void };

function publishSucceeds() {
  mocks.makeProposal.mockImplementation(async ({ onSuccess }: ProposalArgs) => onSuccess());
}
function publishFails() {
  mocks.makeProposal.mockImplementation(async ({ onError }: ProposalArgs) => onError());
}
function proposal(call = 0): ProposalArgs {
  return mocks.makeProposal.mock.calls[call][0];
}

function setup(rows: FollowedTopicRelation[] = []) {
  mocks.fetchFollowedTopics.mockResolvedValue(rows);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useFollowTopics(), { wrapper });
  const cached = () => client.getQueryData<FollowedTopicRelation[]>(followedTopicsQueryKey(SPACE));
  return { result, cached };
}

describe('useFollowTopics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personalSpaceId = SPACE;
  });

  it('publishes one edit for several topics and adds them to the cache', async () => {
    publishSucceeds();
    const { result, cached } = setup();

    let ok = false;
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A, name: 'Energy' }, { id: TOPIC_B }]);
    });

    expect(ok).toBe(true);
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
    expect(proposal().relations).toHaveLength(2);
    expect(proposal().name).toBe('Follow 2 topics');
    expect(cached()?.map(row => row.toEntityId)).toEqual([TOPIC_A, TOPIC_B]);
  });

  it('skips a topic that is already followed without publishing', async () => {
    const { result } = setup([{ id: 'row-1', spaceId: SPACE, toEntityId: TOPIC_A }]);

    let ok = false;
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A }]);
    });

    expect(ok).toBe(true);
    expect(mocks.makeProposal).not.toHaveBeenCalled();
  });

  it('publishes once when the same topic is followed twice concurrently', async () => {
    let finish: () => void = () => undefined;
    mocks.makeProposal.mockImplementation(({ onSuccess }: ProposalArgs) => {
      finish = onSuccess;
      return new Promise<void>(() => undefined);
    });
    const { result } = setup();

    let first: Promise<boolean> = Promise.resolve(false);
    let second = true;
    await act(async () => {
      first = result.current.follow([{ id: TOPIC_A }]);
      second = await result.current.follow([{ id: TOPIC_A }]);
    });
    await act(async () => {
      finish();
      await first;
    });

    expect(second).toBe(false);
    expect(await first).toBe(true);
    expect(mocks.makeProposal).toHaveBeenCalledTimes(1);
  });

  it('leaves the cache alone and allows a retry when the publish fails', async () => {
    publishFails();
    const { result, cached } = setup();

    let ok = true;
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A }]);
    });

    expect(ok).toBe(false);
    expect(cached()).toEqual([]);
    expect(mocks.reconcile).not.toHaveBeenCalled();

    publishSucceeds();
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A }]);
    });

    expect(ok).toBe(true);
    expect(mocks.makeProposal).toHaveBeenCalledTimes(2);
  });

  it('tombstones every duplicate row on unfollow and reconciles the store', async () => {
    publishSucceeds();
    const { result, cached } = setup([
      { id: 'row-1', spaceId: SPACE, toEntityId: TOPIC_A },
      { id: 'row-2', spaceId: SPACE, toEntityId: TOPIC_A },
      { id: 'row-3', spaceId: SPACE, toEntityId: TOPIC_B },
    ]);

    let ok = false;
    await act(async () => {
      ok = await result.current.unfollow([TOPIC_A]);
    });

    expect(ok).toBe(true);
    expect(proposal().relations.map(r => r.id)).toEqual(['row-1', 'row-2']);
    expect(proposal().name).toBe('Unfollow 1 topic');
    expect(mocks.reconcile).toHaveBeenCalledWith(proposal().relations);
    expect(cached()?.map(row => row.id)).toEqual(['row-3']);
  });

  it('returns false without publishing when signed out', async () => {
    mocks.personalSpaceId = null;
    const { result } = setup();

    let ok = true;
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A }]);
    });

    expect(ok).toBe(false);
    expect(mocks.makeProposal).not.toHaveBeenCalled();
    expect(result.current.canFollow).toBe(false);
  });
});
