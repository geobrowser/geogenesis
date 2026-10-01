import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';

import { Effect } from 'effect';
import { Provider, createStore } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pendingPersonalSpaceAtom } from '~/core/state/pending-personal-space';

import { PendingTopicFollowsRunner } from './pending-topic-follows-runner';
import { type HeldFeedTopics, feedTopicsAtom } from '~/atoms/onboarding-feed-topics';

const mocks = vi.hoisted(() => ({
  personalSpaceId: 'space-1' as string | null,
  address: '0xA',
  followedLoading: false,
  follow: vi.fn(),
  getSpace: vi.fn(),
  fetchFollowed: vi.fn(),
}));

vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: mocks.personalSpaceId }),
}));
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: { account: { address: mocks.address } } }),
}));
vi.mock('~/core/topics/use-followed-topics', () => ({
  useFollowedTopics: () => ({ isLoading: mocks.followedLoading }),
  followedTopicsQueryOptions: (spaceId: string) => ({
    queryKey: ['followed-topics', spaceId],
    queryFn: mocks.fetchFollowed,
  }),
}));
vi.mock('~/core/topics/use-follow-topics', () => ({ useFollowTopics: () => ({ follow: mocks.follow }) }));
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
  mocks.address = '0xA';
  mocks.followedLoading = false;
  mocks.follow.mockReset();
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

  it('waits while the personal space is still being created', async () => {
    mount({ topicId: 't', address: '0x1', status: 'pending' });

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.getSpace).not.toHaveBeenCalled();
    expect(mocks.follow).not.toHaveBeenCalled();
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
      picks.map(topic => ({ id: `r-${topic.id}`, spaceId: 'space-1', toEntityId: topic.id }))
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
    mocks.fetchFollowed.mockResolvedValue([{ id: 'r-a', spaceId: 'space-1', toEntityId: 'topic-a' }]);
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

    // The earlier edit gets indexed.
    mocks.fetchFollowed.mockResolvedValue(
      picks.map(topic => ({ id: `r-${topic.id}`, spaceId: 'space-1', toEntityId: topic.id }))
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
      picks.map(topic => ({ id: `r-${topic.id}`, spaceId: 'space-1', toEntityId: topic.id }))
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
      picks.map(topic => ({ id: `r-${topic.id}`, spaceId: 'space-1', toEntityId: topic.id }))
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
