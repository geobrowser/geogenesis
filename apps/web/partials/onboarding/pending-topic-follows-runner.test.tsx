import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';

import { Effect } from 'effect';
import { Provider, createStore } from 'jotai';
import { decodeFunctionData } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';
import { PERMISSIONLESS_ACTIONS, SpaceRegistryAbi } from '~/core/utils/contracts/space-registry';

import { PendingTopicFollowsRunner } from './pending-topic-follows-runner';
import { type HeldFeedTopics, feedTopicsAtom } from '~/atoms/onboarding-feed-topics';

const mocks = vi.hoisted(() => ({
  personalSpaceId: 'space-1' as string | null,
  isRegistered: true,
  needsProfile: false,
  address: '0xA',
  followedLoading: false,
  follow: vi.fn(),
  useActualFollow: false,
  sendUserOperation: vi.fn(),
  getSpace: vi.fn(),
  fetchFollowed: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('~/core/analytics', () => ({ capture: mocks.capture, analyticsContextRevision: () => 0 }));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({
    personalSpaceId: mocks.personalSpaceId,
    isRegistered: mocks.isRegistered,
    needsProfile: mocks.needsProfile,
  }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({
    smartAccount: { account: { address: mocks.address }, sendUserOperation: mocks.sendUserOperation },
  }),
}));
vi.mock('~/core/topics/use-followed-topics', () => ({
  useFollowedTopics: () => ({ isLoading: mocks.followedLoading }),
  interestedTopicsQueryOptions: (spaceId: string) => ({
    queryKey: ['interested-topics', spaceId],
    queryFn: mocks.fetchFollowed,
  }),
}));
vi.mock('~/core/topics/use-follow-topics', async importOriginal => {
  const actual = await importOriginal<typeof import('~/core/topics/use-follow-topics')>();
  return {
    useFollowTopics: (options?: Parameters<typeof actual.useFollowTopics>[0]) =>
      mocks.useActualFollow ? actual.useFollowTopics(options) : { follow: mocks.follow },
  };
});
vi.mock('~/core/io/queries', () => ({ getSpace: mocks.getSpace }));

const picks = [
  { id: 'topic-a', name: 'Bitcoin' },
  { id: 'topic-b', name: 'AI safety' },
];

const held = { address: '0xA', topics: picks };
const none = { address: '', topics: [] };

function mount(pending: unknown = null, stored: HeldFeedTopics = held) {
  const store = createStore();
  store.set(feedTopicsAtom, stored);
  store.set(pendingPersonalSpaceAtom, pending as never);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Provider store={store}>
        <PendingTopicFollowsRunner />
      </Provider>
    </QueryClientProvider>
  );
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.personalSpaceId = 'space-1';
  mocks.isRegistered = true;
  mocks.needsProfile = false;
  mocks.address = '0xA';
  mocks.followedLoading = false;
  mocks.follow.mockReset();
  mocks.capture.mockClear();
  mocks.useActualFollow = false;
  mocks.sendUserOperation.mockReset();
  mocks.sendUserOperation.mockResolvedValue('0xhash');
  mocks.getSpace.mockReset();
  mocks.getSpace.mockReturnValue(Effect.succeed({ id: 'space-1' }));
  mocks.fetchFollowed.mockReset();
  mocks.fetchFollowed.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** A Web Locks stand-in where another tab may be holding the lock. */
function stubLocks(heldElsewhere: { value: boolean }) {
  vi.stubGlobal('navigator', {
    ...navigator,
    locks: {
      request: (_name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) =>
        callback(heldElsewhere.value ? null : {}),
    },
  });
}

describe('PendingTopicFollowsRunner', () => {
  it('follows every pick in one call and clears them', async () => {
    mocks.follow.mockResolvedValue(true);
    const store = mount();

    await act(() => vi.runAllTimersAsync());

    expect(mocks.follow).toHaveBeenCalledOnce();
    expect(mocks.follow).toHaveBeenCalledWith(picks);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('sends onboarding picks through the real Interested action in one user operation', async () => {
    mocks.useActualFollow = true;
    const spaceId = '11111111111111111111111111111111';
    mocks.personalSpaceId = spaceId;
    const topics = [
      { id: '22222222222222222222222222222222', name: 'Energy' },
      { id: '33333333333333333333333333333333', name: 'Science' },
      { id: '44444444444444444444444444444444', name: 'Technology' },
    ];
    mocks.fetchFollowed.mockResolvedValue([{ objectId: topics[0].id, spaceId, kind: 'topic' }]);
    const store = mount(null, { address: mocks.address, topics });

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.sendUserOperation).toHaveBeenCalledOnce();
    const { calls } = mocks.sendUserOperation.mock.calls[0][0] as { calls: { data: `0x${string}` }[] };
    expect(calls).toHaveLength(2);
    const completions = mocks.capture.mock.calls.filter(([event]) => event === 'action_completed');
    expect(completions).toHaveLength(2);
    expect(completions.map(([, props]) => props.target_id)).toEqual(topics.slice(1).map(topic => topic.id));
    for (const [, props] of completions)
      expect(props).toMatchObject({
        component: 'onboarding_customize_feed',
        action_kind: 'follow_topic',
        outcome: 'succeeded',
      });
    calls.forEach(({ data }, index) => {
      const { functionName, args } = decodeFunctionData({ abi: SpaceRegistryAbi, data });
      expect(functionName).toBe('enter');
      expect(args?.slice(0, 3)).toEqual([`0x${spaceId}`, `0x${spaceId}`, PERMISSIONLESS_ACTIONS.INTERESTED]);
      expect((args?.[3] as string).slice(10, 42)).toBe(topics[index + 1].id);
    });
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('waits while the personal space is still being created', async () => {
    mount({ topicId: 't', address: '0x1', status: 'pending' });

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.getSpace).not.toHaveBeenCalled();
    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it('waits for on-chain registration even when a personal space id exists', async () => {
    mocks.isRegistered = false;
    mount();

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.getSpace).not.toHaveBeenCalled();
    expect(mocks.follow).not.toHaveBeenCalled();
  });

  it('does not follow draft picks while a registered account still needs its profile', async () => {
    mocks.needsProfile = true;
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);

    mocks.needsProfile = false;
    mocks.follow.mockResolvedValue(true);
    act(() => store.set(feedTopicsAtom, { ...held }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenCalledWith(picks);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('keeps picks when the Interested read fails, then retries', async () => {
    mocks.fetchFollowed.mockRejectedValueOnce(new Error('API unavailable'));
    mocks.follow.mockResolvedValue(true);
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(mocks.follow).toHaveBeenCalledWith(picks);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('does not count a followed person as a followed topic', async () => {
    mocks.fetchFollowed.mockResolvedValue([{ objectId: 'topic-a', spaceId: 'space-1', kind: 'person' }]);
    mocks.follow.mockResolvedValue(true);
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenCalledWith(picks);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('does not submit after the wallet changes during the Interested read', async () => {
    let finish!: (rows: unknown[]) => void;
    mocks.fetchFollowed.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
    const store = mount();
    await act(() => vi.advanceTimersByTimeAsync(0));

    mocks.address = '0xB';
    act(() => store.set(feedTopicsAtom, { ...held }));
    await act(async () => finish([]));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);
  });

  it('does not submit after unmount during the Interested read', async () => {
    let finish!: (rows: unknown[]) => void;
    mocks.fetchFollowed.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
    const store = mount();
    await act(() => vi.advanceTimersByTimeAsync(0));

    cleanup();
    await act(async () => finish([]));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);
  });

  it('does not publish until the space is indexed, then does', async () => {
    mocks.follow.mockResolvedValue(true);
    mocks.getSpace.mockReturnValueOnce(Effect.succeed(null));
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(mocks.follow).toHaveBeenCalledOnce();
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  // A failure can be a receipt timeout for an op that still lands, so it is never republished early.
  it('keeps the picks marked submitted when the publish fails, and waits before publishing again', async () => {
    mocks.follow.mockResolvedValue(false);
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(store.get(feedTopicsAtom)).toEqual({ ...held, submittedAt: expect.any(Number) });

    // Stepped, so each retry's re-render lands before the next timer.
    for (let i = 0; i < 18; i++) await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(mocks.follow).toHaveBeenCalledOnce();

    // The late op landed after all.
    mocks.fetchFollowed.mockResolvedValue(
      picks.map(topic => ({ objectId: topic.id, spaceId: 'space-1', kind: 'topic' }))
    );
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(mocks.follow).toHaveBeenCalledOnce();
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('publishes again after the wait, and stops after a few failures', async () => {
    mocks.follow.mockResolvedValue(false);
    const store = mount();

    for (let i = 0; i < 5; i++) {
      await act(() => vi.advanceTimersByTimeAsync(0));
      await act(() => vi.advanceTimersByTimeAsync(11 * 60_000));
    }

    expect(mocks.follow).toHaveBeenCalledTimes(3);
    expect(store.get(feedTopicsAtom)).toMatchObject(held);
  });

  it('publishes only the picks not already followed', async () => {
    mocks.follow.mockResolvedValue(true);
    mocks.fetchFollowed.mockResolvedValue([{ objectId: 'topic-a', spaceId: 'space-1', kind: 'topic' }]);
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenCalledWith([picks[1]]);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('leaves the picks to another tab that holds the lock, then publishes only what is left', async () => {
    mocks.follow.mockResolvedValue(true);
    const heldElsewhere = { value: true };
    stubLocks(heldElsewhere);
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.follow).not.toHaveBeenCalled();

    // The other tab followed them and cleared storage, then let go of the lock.
    window.localStorage.setItem('onboardingFeedTopics', '[]');
    heldElsewhere.value = false;
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);
  });

  it('publishes under the lock when no other tab holds it', async () => {
    mocks.follow.mockResolvedValue(true);
    stubLocks({ value: false });
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenCalledWith(picks);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('retries an unexpected lock failure without discarding picks', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('lock unavailable'))
      .mockImplementation((_name, _options, run) => run({}));
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    mocks.follow.mockResolvedValue(true);
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);

    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(mocks.follow).toHaveBeenCalledWith(picks);
    expect(store.get(feedTopicsAtom)).toEqual(none);
    error.mockRestore();
  });

  it('does not submit if the account needs profile setup again during the readiness read', async () => {
    let finish!: (rows: unknown[]) => void;
    mocks.fetchFollowed.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
    const store = mount();
    await act(() => vi.advanceTimersByTimeAsync(0));

    mocks.needsProfile = true;
    act(() => store.set(feedTopicsAtom, { ...held }));
    await act(async () => finish([]));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);
  });

  // A tab can see another wallet's picks before it sees the wallet switch; they are not its to delete.
  it("leaves another account's picks alone and doesn't follow them", async () => {
    mocks.follow.mockResolvedValue(true);
    mocks.address = '0xB';
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(held);
  });

  it('ignores picks stored without an owner', async () => {
    mocks.follow.mockResolvedValue(true);
    const store = mount(null, picks as unknown as HeldFeedTopics);

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(picks);
  });

  it("keeps a newer account's picks stored while the old account's follow was publishing", async () => {
    const newer = { address: '0xB', topics: [{ id: 'topic-c', name: 'Mental health' }] };
    const switchTo: { store?: ReturnType<typeof mount> } = {};
    mocks.follow.mockImplementation(async () => {
      // B is mid-onboarding: no personal space yet, so its own picks wait.
      mocks.address = '0xB';
      mocks.personalSpaceId = null;
      switchTo.store!.set(feedTopicsAtom, newer);
      return true;
    });
    const store = mount();
    switchTo.store = store;

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenCalledOnce();
    expect(store.get(feedTopicsAtom)).toEqual(newer);
  });

  it('marks the picks submitted while their follow publishes', async () => {
    const seen: unknown[] = [];
    const switchTo: { store?: ReturnType<typeof mount> } = {};
    mocks.follow.mockImplementation(async () => {
      seen.push(switchTo.store!.get(feedTopicsAtom));
      return true;
    });
    switchTo.store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(seen).toEqual([expect.objectContaining({ address: '0xA', topics: picks, submittedAt: expect.any(Number) })]);
  });

  it('after a reload mid-publish, waits for the earlier follows instead of publishing again', async () => {
    mocks.follow.mockResolvedValue(true);
    const store = mount(null, { ...held, submittedAt: Date.now() });

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toMatchObject(held);

    // The earlier Interested actions get indexed.
    mocks.fetchFollowed.mockResolvedValue(
      picks.map(topic => ({ objectId: topic.id, spaceId: 'space-1', kind: 'topic' }))
    );
    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('publishes again once an earlier submission is too old to still land', async () => {
    mocks.follow.mockResolvedValue(true);
    const store = mount(null, { ...held, submittedAt: Date.now() - 11 * 60_000 });

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenCalledWith(picks);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it("gives a new account its own retry budget and runs it once the old account's run ends", async () => {
    const newer = { address: '0xB', topics: [{ id: 'topic-c', name: 'Mental health' }] };
    const switchTo: { store?: ReturnType<typeof mount> } = {};
    mocks.follow.mockResolvedValue(false);
    switchTo.store = mount();
    for (let i = 0; i < 5; i++) {
      await act(() => vi.advanceTimersByTimeAsync(0));
      await act(() => vi.advanceTimersByTimeAsync(11 * 60_000));
    }
    expect(mocks.follow).toHaveBeenCalledTimes(3);

    mocks.follow.mockResolvedValue(true);
    mocks.address = '0xB';
    act(() => switchTo.store!.set(feedTopicsAtom, newer));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenLastCalledWith(newer.topics);
    expect(switchTo.store.get(feedTopicsAtom)).toEqual(none);
  });

  it('runs a newer account that became ready while the old account was publishing', async () => {
    const newer = { address: '0xB', topics: [{ id: 'topic-c', name: 'Mental health' }] };
    const switchTo: { store?: ReturnType<typeof mount> } = {};
    mocks.follow.mockImplementationOnce(async () => {
      mocks.address = '0xB';
      switchTo.store!.set(feedTopicsAtom, newer);
      return true;
    });
    mocks.follow.mockResolvedValue(true);
    switchTo.store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenCalledTimes(2);
    expect(mocks.follow).toHaveBeenLastCalledWith(newer.topics);
    expect(switchTo.store.get(feedTopicsAtom)).toEqual(none);
  });

  it("ignores the old account's failure once a newer account is signed in", async () => {
    const newer = { address: '0xB', topics: [{ id: 'topic-c', name: 'Mental health' }] };
    const switchTo: { store?: ReturnType<typeof mount> } = {};
    mocks.follow.mockImplementationOnce(async () => {
      mocks.address = '0xB';
      switchTo.store!.set(feedTopicsAtom, newer);
      return false;
    });
    mocks.follow.mockResolvedValue(true);
    switchTo.store = mount();

    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenLastCalledWith(newer.topics);
    expect(switchTo.store.get(feedTopicsAtom)).toEqual(none);
  });

  it('runs again when the picks were replaced by the same number of others mid-publish', async () => {
    const replaced = { address: '0xA', topics: [{ id: 'topic-c', name: 'Mental health' }] };
    let finishFirst!: (ok: boolean) => void;
    mocks.follow.mockImplementationOnce(() => new Promise<boolean>(resolve => (finishFirst = resolve)));
    mocks.follow.mockResolvedValue(true);
    const store = mount(null, { address: '0xA', topics: [picks[0]] });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.follow).toHaveBeenCalledOnce();

    // Another tab swaps the pick while the first publish is still out, and this tab re-renders.
    act(() => store.set(feedTopicsAtom, replaced));
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => finishFirst(true));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenLastCalledWith(replaced.topics);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('still clears the picks when a publish lands after the failure cap', async () => {
    mocks.follow.mockResolvedValue(false);
    const store = mount();
    for (let i = 0; i < 2; i++) {
      await act(() => vi.advanceTimersByTimeAsync(0));
      await act(() => vi.advanceTimersByTimeAsync(11 * 60_000));
    }
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.follow).toHaveBeenCalledTimes(3);

    // The third publish timed out but lands a minute later.
    mocks.fetchFollowed.mockResolvedValue(
      picks.map(topic => ({ objectId: topic.id, spaceId: 'space-1', kind: 'topic' }))
    );
    await act(() => vi.advanceTimersByTimeAsync(60_000));

    expect(mocks.follow).toHaveBeenCalledTimes(3);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('keeps checking, without publishing, after the wait past the cap ends', async () => {
    mocks.follow.mockResolvedValue(false);
    const store = mount();
    for (let i = 0; i < 3; i++) {
      await act(() => vi.advanceTimersByTimeAsync(0));
      await act(() => vi.advanceTimersByTimeAsync(11 * 60_000));
    }
    expect(mocks.follow).toHaveBeenCalledTimes(3);

    // The last publish lands well after its 10-minute wait.
    await act(() => vi.advanceTimersByTimeAsync(20 * 60_000));
    mocks.fetchFollowed.mockResolvedValue(
      picks.map(topic => ({ objectId: topic.id, spaceId: 'space-1', kind: 'topic' }))
    );
    await act(() => vi.advanceTimersByTimeAsync(16 * 60_000));

    expect(mocks.follow).toHaveBeenCalledTimes(3);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('backs off the checks after the cap instead of polling every minute', async () => {
    mocks.follow.mockResolvedValue(false);
    mount();
    for (let i = 0; i < 3; i++) {
      await act(() => vi.advanceTimersByTimeAsync(0));
      await act(() => vi.advanceTimersByTimeAsync(11 * 60_000));
    }
    mocks.fetchFollowed.mockClear();

    // Stepped, so each pass's re-render lands before the next timer.
    for (let i = 0; i < 60; i++) await act(() => vi.advanceTimersByTimeAsync(60_000));

    // 1, 2, 4, 8, then every 15 minutes: about 6 checks in an hour, not 60.
    expect(mocks.fetchFollowed.mock.calls.length).toBeLessThanOrEqual(7);
  });

  it('keeps one polling chain when a dependency change starts a pass while one is scheduled', async () => {
    const t0 = Date.now();
    const checkedAt: number[] = [];
    mocks.fetchFollowed.mockImplementation(async () => {
      checkedAt.push((Date.now() - t0) / 1000);
      return [];
    });
    const store = mount(null, { ...held, submittedAt: Date.now() });
    await act(() => vi.advanceTimersByTimeAsync(5_000));

    // A new pick starts a pass halfway through the pending 10s check.
    act(() =>
      store.set(feedTopicsAtom, {
        ...held,
        topics: [...picks, { id: 'topic-c', name: 'Mental health' }],
        submittedAt: Date.now(),
      })
    );
    // 1s steps, so each timer's re-render lands on its own, as in a browser.
    for (let i = 0; i < 40; i++) await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(checkedAt).toEqual([0, 5, 15, 25, 35, 45]);
  });

  it('schedules nothing after unmount', async () => {
    let finish!: (rows: unknown[]) => void;
    mocks.fetchFollowed.mockImplementationOnce(() => new Promise(resolve => (finish = resolve)));
    mount(null, { ...held, submittedAt: Date.now() });
    await act(() => vi.advanceTimersByTimeAsync(0));

    cleanup();
    const timersAtUnmount = vi.getTimerCount();
    await act(async () => finish([]));

    expect(vi.getTimerCount()).toBe(timersAtUnmount);
  });
});
