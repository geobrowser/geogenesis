import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import * as React from 'react';

import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import type { ExploreFeedResult } from '~/core/explore/fetch-explore-feed';

import { EntityFeed } from './entity-feed';

const state = vi.hoisted(() => ({
  viewerAddress: null as string | null,
  intersect: null as IntersectionObserverCallback | null,
}));

vi.mock('~/core/hooks/use-awaited-smart-account', () => ({
  useFeedViewer: () => ({ viewerAddress: state.viewerAddress, awaitingIdentityToken: false }),
}));
vi.mock('~/core/browse/use-browse-sidebar-cache', () => ({ useCachedBrowseSidebarData: () => null }));
vi.mock('~/partials/explore/explore-feed-card', () => ({
  ExploreFeedCard: ({ item }: { item: ExploreFeedItem }) => <article>{item.title}</article>,
}));
vi.mock('~/design-system/menu', () => ({
  Menu: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <>
      {trigger}
      {children}
    </>
  ),
  MenuItem: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

function page(title: string, nextCursor: string | null = null): ExploreFeedResult {
  return {
    items: [
      {
        entityId: title,
        spaceId: 'space',
        spaceName: 'Space',
        spaceImage: null,
        types: [],
        createdAtSec: 0,
        title,
        description: null,
        imageUrl: null,
        recordingUrls: [],
        debateVideoUrls: [],
        debateClaim: null,
        commentCount: 0,
        isMemberOrEditor: false,
        hasPendingMembershipRequest: false,
      },
    ],
    nextCursor,
  };
}

let client: QueryClient;
let fetchPage: Mock<(url: URL) => Promise<ExploreFeedResult>>;
let now: number;

function feedTree(props: Partial<React.ComponentProps<typeof EntityFeed>> = {}) {
  return (
    <QueryClientProvider client={client}>
      <EntityFeed apiEndpoint="/api/explore/feed" initialSort="best" showSortFilter preserveSession {...props} />
    </QueryClientProvider>
  );
}

function mountFeed(props: Partial<React.ComponentProps<typeof EntityFeed>> = {}) {
  return render(feedTree(props));
}

function intersect() {
  act(() => state.intersect?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
}

type ResumeTrigger = 'focus' | 'reconnect';

async function resume(trigger: ResumeTrigger) {
  await act(async () => {
    if (trigger === 'focus') focusManager.setFocused(false);
    else onlineManager.setOnline(false);
    now += 5 * 60_000;
    if (trigger === 'focus') focusManager.setFocused(true);
    else onlineManager.setOnline(true);
  });
}

beforeEach(() => {
  // Advance the query clock without faking React's notification timers.
  now = Date.now();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  state.viewerAddress = null;
  state.intersect = null;
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });
  fetchPage = vi.fn().mockResolvedValue(page('Original lead', 'page-2'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => ({
      ok: true,
      json: () => fetchPage(new URL(url, 'https://example.com')),
    }))
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        state.intersect = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
});

afterEach(() => {
  cleanup();
  client.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resuming an Explore feed', () => {
  it.each<ResumeTrigger>(['focus', 'reconnect'])('keeps loaded pages, order and card DOM on %s', async trigger => {
    mountFeed();
    await screen.findByText('Original lead');
    fetchPage.mockResolvedValueOnce(page('Second page'));
    intersect();
    await screen.findByText('Second page');
    const cards = screen.getAllByRole('article');

    fetchPage.mockResolvedValue(page('Re-ranked lead'));
    await resume(trigger);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    screen.getAllByRole('article').forEach((card, index) => expect(card).toBe(cards[index]));
    expect(cards.map(card => card.textContent)).toEqual(['Original lead', 'Second page']);
  });

  it.each<ResumeTrigger>(['focus', 'reconnect'])('recovers a failed first load on %s', async trigger => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fetchPage.mockRejectedValue(new Error('Feed failed'));
    mountFeed();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    vi.useRealTimers();
    await screen.findByText('Could not load the feed.');
    expect(fetchPage).toHaveBeenCalledTimes(3);

    fetchPage.mockResolvedValue(page('Recovered feed'));
    await resume(trigger);
    await screen.findByText('Recovered feed');
    expect(fetchPage).toHaveBeenCalledTimes(4);
  });

  it('keeps normal focus refreshes for contextual feeds that do not opt into session retention', async () => {
    mountFeed({ apiEndpoint: '/api/activity/feed', lockedSpaceId: 'space', preserveSession: undefined });
    await screen.findByText('Original lead');
    fetchPage.mockResolvedValue(page('Updated activity'));
    await resume('focus');
    await screen.findByText('Updated activity');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('resumes cached pages after leaving the route for ten minutes', async () => {
    const first = mountFeed();
    await screen.findByText('Original lead');
    fetchPage.mockResolvedValueOnce(page('Second page'));
    intersect();
    await screen.findByText('Second page');
    vi.useFakeTimers();
    first.unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    vi.useRealTimers();
    fetchPage.mockResolvedValue(page('Re-ranked lead'));
    mountFeed();
    await screen.findByText('Second page');

    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('releases an inactive feed after thirty minutes so a later visit starts fresh', async () => {
    const first = mountFeed();
    await screen.findByText('Original lead');
    vi.useFakeTimers();
    first.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31 * 60_000);
    });
    vi.useRealTimers();
    fetchPage.mockResolvedValue(page('Later visit'));
    mountFeed();
    await screen.findByText('Later visit');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('also holds the public first-page query used during signed-in hydration', async () => {
    state.viewerAddress = 'account';
    mountFeed({ cdnFirstPage: true });
    await screen.findByText('Original lead');
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    fetchPage.mockResolvedValue(page('Re-ranked lead'));
    await resume('focus');
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Original lead')).toBeTruthy();
  });

  it('still loads a different sort and a different account instead of reusing the old feed', async () => {
    const view = mountFeed();
    await screen.findByText('Original lead');
    fetchPage.mockResolvedValueOnce(page('New sort'));
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    await screen.findByText('New sort');
    expect(fetchPage.mock.calls[1][0].searchParams.get('sort')).toBe('new');

    fetchPage.mockResolvedValueOnce(page('Other account'));
    state.viewerAddress = 'other-account';
    view.rerender(feedTree());
    await screen.findByText('Other account');
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('allows an explicit refresh to retrieve a new feed', async () => {
    mountFeed();
    await screen.findByText('Original lead');
    fetchPage.mockResolvedValue(page('Refreshed lead'));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['/api/explore/feed'] });
    });
    await screen.findByText('Refreshed lead');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('does not restart an in-flight page when the scroll observer fires twice', async () => {
    mountFeed();
    await screen.findByText('Original lead');
    let finish!: (value: ExploreFeedResult) => void;
    fetchPage.mockImplementationOnce(
      () =>
        new Promise<ExploreFeedResult>(resolve => {
          finish = resolve;
        })
    );

    act(() => {
      state.intersect?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      state.intersect?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    await act(async () => {
      finish(page('Second page'));
    });
    await screen.findByText('Second page');
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[1][0].searchParams.get('cursor')).toBe('page-2');
  });
});
