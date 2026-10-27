import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

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

async function resume(trigger: ResumeTrigger, awayMs = 5 * 60_000) {
  await act(async () => {
    if (trigger === 'focus') focusManager.setFocused(false);
    else onlineManager.setOnline(false);
    now += awayMs;
    if (trigger === 'focus') focusManager.setFocused(true);
    else onlineManager.setOnline(true);
  });
}

const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

function restore(name: 'scrollY' | 'innerHeight', descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(window, name, descriptor);
  else Reflect.deleteProperty(window, name);
}

function scrollTo(y: number) {
  Object.defineProperty(window, 'scrollY', { configurable: true, value: y });
}

beforeEach(() => {
  scrollTo(0);
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
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
  restore('scrollY', originalScrollY);
  restore('innerHeight', originalInnerHeight);
  client.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('resuming an Explore feed', () => {
  async function loadTwoPages() {
    mountFeed();
    await screen.findByText('Original lead');
    fetchPage.mockResolvedValueOnce(page('Second page'));
    intersect();
    await screen.findByText('Second page');
  }

  it.each<ResumeTrigger>(['focus', 'reconnect'])(
    'keeps loaded pages, order and card DOM once scrolled on %s',
    async trigger => {
      await loadTwoPages();
      const cards = screen.getAllByRole('article');
      scrollTo(2_000);

      fetchPage.mockResolvedValue(page('Re-ranked lead'));
      await resume(trigger);

      expect(fetchPage).toHaveBeenCalledTimes(2);
      screen.getAllByRole('article').forEach((card, index) => expect(card).toBe(cards[index]));
      expect(cards.map(card => card.textContent)).toEqual(['Original lead', 'Second page']);
    }
  );

  it.each<ResumeTrigger>(['focus', 'reconnect'])('refreshes a feed read at the top after 30s on %s', async trigger => {
    await loadTwoPages();
    scrollTo(400);

    fetchPage.mockResolvedValue(page('Re-ranked lead'));
    await resume(trigger, 31_000);

    await screen.findByText('Re-ranked lead');
    await waitFor(() => expect(screen.queryByText('Second page')).toBeNull());
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it.each<ResumeTrigger>(['focus', 'reconnect'])('keeps a feed read at the top within 30s on %s', async trigger => {
    await loadTwoPages();

    fetchPage.mockResolvedValue(page('Re-ranked lead'));
    await resume(trigger, 20_000);

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Original lead')).toBeTruthy();
  });

  it('keeps loaded pages when the feed remounts at the top', async () => {
    const first = mountFeed();
    await screen.findByText('Original lead');
    fetchPage.mockResolvedValueOnce(page('Second page'));
    intersect();
    await screen.findByText('Second page');
    first.unmount();

    now += 2 * 60_000;
    fetchPage.mockResolvedValue(page('Re-ranked lead'));
    mountFeed();
    await screen.findByText('Second page');

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Re-ranked lead')).toBeNull();
  });

  it.each<ResumeTrigger>(['focus', 'reconnect'])(
    'recovers a failed first load on %s wherever the page is scrolled',
    async trigger => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fetchPage.mockRejectedValue(new Error('Feed failed'));
      mountFeed();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });
      vi.useRealTimers();
      await screen.findByText('Could not load the feed.');
      expect(fetchPage).toHaveBeenCalledTimes(3);
      scrollTo(2_000);

      fetchPage.mockResolvedValue(page('Recovered feed'));
      await resume(trigger);
      await screen.findByText('Recovered feed');
      expect(fetchPage).toHaveBeenCalledTimes(4);
    }
  );

  it('still refreshes the activity feed on focus, which does not opt in', async () => {
    mountFeed({ apiEndpoint: '/api/activity/feed', lockedSpaceId: 'space', preserveSession: undefined });
    await screen.findByText('Original lead');
    scrollTo(2_000);
    fetchPage.mockResolvedValue(page('Updated activity'));
    await resume('focus');
    await screen.findByText('Updated activity');
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
