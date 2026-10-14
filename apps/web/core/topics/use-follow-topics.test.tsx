import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import type { ReactNode } from 'react';

import { decodeFunctionData } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { interestedTopicsQueryKey } from '~/core/io/subgraph/fetch-interested-topics';
import { PERMISSIONLESS_ACTIONS, SpaceRegistryAbi } from '~/core/utils/contracts/space-registry';

import type { InterestedTopicRow } from './interested';
import { useFollowEntities, useFollowTopics } from './use-follow-topics';

const mocks = vi.hoisted(() => ({
  fetchInterestedTopics: vi.fn(),
  sendUserOperation: vi.fn(),
  personalSpaceId: '11111111111111111111111111111111' as string | null,
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId, isRegistered: true, isLoading: false }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { sendUserOperation: mocks.sendUserOperation } }),
}));
vi.mock('~/core/io/subgraph/fetch-interested-topics', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/io/subgraph/fetch-interested-topics')>()),
  fetchInterestedTopics: mocks.fetchInterestedTopics,
}));

const SPACE = '11111111111111111111111111111111';
const TOPIC_A = '22222222222222222222222222222222';
const TOPIC_B = '33333333333333333333333333333333';

function setup(interested: InterestedTopicRow[] = []) {
  mocks.fetchInterestedTopics.mockResolvedValue(interested);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useFollowTopics(), { wrapper });
  const cachedInterested = () => client.getQueryData<InterestedTopicRow[]>(interestedTopicsQueryKey(SPACE));
  return { result, cachedInterested };
}

/** The action and entity of every call in the user operation sent `call`-th. */
function sentActions(call = 0) {
  const { calls } = mocks.sendUserOperation.mock.calls[call][0] as { calls: { data: `0x${string}` }[] };
  return calls.map(({ data }) => {
    const { args } = decodeFunctionData({ abi: SpaceRegistryAbi, data });
    const [, to, action, topic] = args as readonly [string, string, string, string, string, string];
    return { to, action, entity: topic.slice(10, 42) };
  });
}

describe('useFollowTopics (GEO-3158)', () => {
  const OTHER_SPACE = '44444444444444444444444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personalSpaceId = SPACE;
    mocks.sendUserOperation.mockResolvedValue('0xhash');
  });

  it('follows by writing Interested in one user operation', async () => {
    const { result, cachedInterested } = setup();

    let ok = false;
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A, name: 'Energy' }, { id: TOPIC_B }]);
    });

    expect(ok).toBe(true);
    expect(mocks.sendUserOperation).toHaveBeenCalledTimes(1);
    expect(sentActions()).toEqual([
      { to: `0x${SPACE}`, action: PERMISSIONLESS_ACTIONS.INTERESTED, entity: TOPIC_A },
      { to: `0x${SPACE}`, action: PERMISSIONLESS_ACTIONS.INTERESTED, entity: TOPIC_B },
    ]);
    expect(cachedInterested()?.map(row => row.objectId)).toEqual([TOPIC_A, TOPIC_B]);
  });

  it('skips a topic already held Interested', async () => {
    const { result } = setup([{ objectId: TOPIC_A, spaceId: SPACE }]);

    let ok = false;
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A }]);
    });

    expect(ok).toBe(true);
    expect(mocks.sendUserOperation).not.toHaveBeenCalled();
  });

  it('returns false and leaves the cache alone when the user operation fails', async () => {
    mocks.sendUserOperation.mockRejectedValue(new Error('bundler said no'));
    const { result, cachedInterested } = setup();

    let ok = true;
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A }]);
    });

    expect(ok).toBe(false);
    expect(cachedInterested()).toEqual([]);
  });

  it('unfollow clears every Interested on the topic, in every space it was cast', async () => {
    const { result, cachedInterested } = setup([
      { objectId: TOPIC_A, spaceId: SPACE },
      { objectId: TOPIC_A, spaceId: OTHER_SPACE },
      { objectId: TOPIC_B, spaceId: SPACE },
    ]);

    let ok = false;
    await act(async () => {
      ok = await result.current.unfollow([TOPIC_A]);
    });

    expect(ok).toBe(true);
    expect(sentActions()).toEqual([
      { to: `0x${SPACE}`, action: PERMISSIONLESS_ACTIONS.UNINTERESTED, entity: TOPIC_A },
      { to: `0x${OTHER_SPACE}`, action: PERMISSIONLESS_ACTIONS.UNINTERESTED, entity: TOPIC_A },
    ]);
    expect(cachedInterested()).toEqual([{ objectId: TOPIC_B, spaceId: SPACE }]);
  });

  it('unfollow of a topic not held Interested sends nothing', async () => {
    const { result } = setup();

    let ok = false;
    await act(async () => {
      ok = await result.current.unfollow([TOPIC_A]);
    });

    expect(ok).toBe(true);
    expect(mocks.sendUserOperation).not.toHaveBeenCalled();
  });

  it('sends once when the same topic is followed twice concurrently', async () => {
    let finish: () => void = () => undefined;
    mocks.sendUserOperation.mockImplementation(() => new Promise(resolve => (finish = () => resolve('0xhash'))));
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
    expect(mocks.sendUserOperation).toHaveBeenCalledTimes(1);
  });

  it('returns false without sending when signed out', async () => {
    mocks.personalSpaceId = null;
    const { result } = setup();

    let ok = true;
    await act(async () => {
      ok = await result.current.follow([{ id: TOPIC_A }]);
    });

    expect(ok).toBe(false);
    expect(mocks.sendUserOperation).not.toHaveBeenCalled();
    expect(result.current.canFollow).toBe(false);
  });
});

describe('useFollowEntities on a person (GEO-3236)', () => {
  const PERSON = '44444444444444444444444444444444';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.personalSpaceId = SPACE;
    mocks.sendUserOperation.mockResolvedValue(undefined);
  });

  function setupPerson(interested: InterestedTopicRow[] = []) {
    mocks.fetchInterestedTopics.mockResolvedValue(interested);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useFollowEntities({ kind: 'person' }), { wrapper });
    const cachedInterested = () => client.getQueryData<InterestedTopicRow[]>(interestedTopicsQueryKey(SPACE));
    return { result, cachedInterested };
  }

  it('writes an Interested on their personal space', async () => {
    const { result, cachedInterested } = setupPerson();

    let ok = false;
    await act(async () => {
      ok = await result.current.follow([{ id: PERSON, name: 'Ada Okafor' }]);
    });

    expect(ok).toBe(true);
    expect(sentActions()).toEqual([{ to: `0x${SPACE}`, action: PERMISSIONLESS_ACTIONS.INTERESTED, entity: PERSON }]);
    // The cache knows it is a person, so it stays out of the followed topics For you reads.
    expect(cachedInterested()).toEqual([{ objectId: PERSON, spaceId: SPACE, kind: 'person' }]);
  });

  it('clears the Interested to unfollow', async () => {
    const { result, cachedInterested } = setupPerson([{ objectId: PERSON, spaceId: SPACE, kind: 'person' }]);

    await act(async () => {
      await result.current.unfollow([PERSON]);
    });

    expect(sentActions()).toEqual([{ to: `0x${SPACE}`, action: PERMISSIONLESS_ACTIONS.UNINTERESTED, entity: PERSON }]);
    expect(cachedInterested()).toEqual([]);
  });
});
