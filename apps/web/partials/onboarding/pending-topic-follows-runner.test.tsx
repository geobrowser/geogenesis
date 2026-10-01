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

  it('keeps the picks when the publish fails, and stops retrying after a few', async () => {
    mocks.follow.mockResolvedValue(false);
    const store = mount();

    // Stepped, so each retry's re-render lands before the next timer.
    for (let i = 0; i < 10; i++) await act(() => vi.advanceTimersByTimeAsync(30_000));

    expect(mocks.follow).toHaveBeenCalledTimes(3);
    expect(store.get(feedTopicsAtom)).toEqual(held);
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

  it("drops another account's picks instead of following them", async () => {
    mocks.follow.mockResolvedValue(true);
    mocks.address = '0xB';
    const store = mount();

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it('drops picks stored without an owner', async () => {
    mocks.follow.mockResolvedValue(true);
    const store = mount(null, picks as unknown as HeldFeedTopics);

    await act(() => vi.advanceTimersByTimeAsync(10_000));

    expect(mocks.follow).not.toHaveBeenCalled();
    expect(store.get(feedTopicsAtom)).toEqual(none);
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
    const store = mount(null, { ...held, submittedAt: Date.now() - 3 * 60_000 });

    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.follow).toHaveBeenCalledWith(picks);
    expect(store.get(feedTopicsAtom)).toEqual(none);
  });

  it("gives a new account its own retry budget and runs it once the old account's run ends", async () => {
    const newer = { address: '0xB', topics: [{ id: 'topic-c', name: 'Mental health' }] };
    const switchTo: { store?: ReturnType<typeof mount> } = {};
    mocks.follow.mockResolvedValue(false);
    switchTo.store = mount();
    for (let i = 0; i < 4; i++) await act(() => vi.advanceTimersByTimeAsync(30_000));
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
});
