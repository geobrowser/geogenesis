import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebatesBrowseFeed } from './debate-feed';
import { debateFullscreenActiveAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  debates: [] as Debate[],
  /** null = every debate reads as processed (the common-case default). */
  processedIds: null as string[] | null,
  mediaLoading: false,
  mediaError: false,
  mediaMutate: vi.fn(),
  fetch: vi.fn(),
  share: vi.fn(),
  canShare: vi.fn(),
  createObjectURL: vi.fn(() => 'blob:https://geo.test/social-video'),
  revokeObjectURL: vi.fn(),
  downloadClick: vi.fn(),
  entityVoteProps: [] as Array<Record<string, unknown>>,
  /** Debate entity ids in "Best" order. Empty = the ranking covers nothing, so recency stands. */
  bestOrderIds: [] as string[],
  bestOrderLoading: false,
  hubOpen: vi.fn(),
  openPrivySignIn: vi.fn(),
  /** Whether a smart account exists, i.e. the viewer is signed in. */
  signedIn: true,
}));

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
  instance: IntersectionObserver;
};

let observers: ObserverRecord[] = [];

vi.mock('~/core/debates/hooks', () => ({
  useSpaceDebates: () => ({ data: { debates: mocks.debates }, isLoading: false, error: null }),
  useProcessedVideoDebateIds: () => ({
    processedIds: mocks.processedIds ?? mocks.debates.map(debate => debate.id),
    isLoading: mocks.mediaLoading,
    hasError: mocks.mediaError,
  }),
  useDebateMediaArtifactUrl: () => ({ mutate: mocks.mediaMutate }),
}));

vi.mock('./use-debates-best-order', async () => {
  // Keyed exactly as the real hook keys it, so the feed's own lookup is what's under test.
  const { ID } = await import('~/core/id');
  return {
    useDebatesBestOrder: () => ({
      rankByDebateId: new Map(mocks.bestOrderIds.map((id, index) => [ID.uuidToHex(id), index])),
      isLoading: mocks.bestOrderLoading,
      isError: false,
    }),
  };
});

vi.mock('~/core/debates/use-debate-votes', () => ({
  useDebateVotes: () => ({
    sharePercentFor: () => null,
    isMyPick: () => false,
    hasVoted: false,
    isVoting: false,
    castVote: vi.fn(),
  }),
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: { entity: { name: 'Fashion', image: null } }, isLoading: false }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [], isLoading: false }),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: (props: Record<string, unknown>) => {
    mocks.entityVoteProps.push(props);
    return <div data-testid={`entity-votes-${String(props.presentation)}`} />;
  },
}));

vi.mock('./debate-feed-player', () => ({
  DebateFeedPlayer: ({ debate, active }: { debate: Debate; active: boolean }) => (
    <div data-testid={`player-${debate.id}`} data-active={active} />
  ),
}));

// Stubbed so these tests assert only where the nudge is placed; its bounce/dismiss
// lifecycle is covered by debate-scroll-hint.test.tsx.
vi.mock('./debate-scroll-hint', () => ({
  useDebateScrollHint: (enabled: boolean) => ({ isVisible: enabled, isLeaving: false }),
  scrollHintBounceProps: { className: 'bounce-stub', style: { animationIterationCount: 6 } },
  DebateScrollHint: ({ className }: { className?: string }) => <div data-testid="scroll-hint" className={className} />,
}));

vi.mock('./debate-claims-panel', () => ({
  DebateClaimsPanel: ({ debate }: { debate: Debate }) => <div>Claims panel for {debate.id}</div>,
}));
vi.mock('~/core/debates/matchmaking/use-debates-hub', () => ({
  useDebatesHub: () => ({
    isOpen: false,
    activeTab: 'claims' as const,
    open: mocks.hubOpen,
    close: vi.fn(),
    toggle: vi.fn(),
    setTab: vi.fn(),
  }),
}));
vi.mock('~/partials/comments/entity-comments-panel', () => ({
  EntityCommentsPanel: ({ entityId }: { entityId: string }) => <div>Comments panel for {entityId}</div>,
}));

vi.mock('~/core/hooks/use-comments', () => ({
  useComments: () => ({ comments: [], totalCount: 7, isLoading: false, error: null, refetch: vi.fn() }),
}));

// Both reach for wagmi/next-navigation context the feed's tests do not stand up.
vi.mock('~/core/hooks/use-smart-account', () => ({
  useSmartAccount: () => ({ smartAccount: mocks.signedIn ? { account: { address: '0xfeed' } } : null }),
}));
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => mocks.openPrivySignIn,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  // Not a mock fn, so `resetAllMocks` does not restore it.
  mocks.signedIn = true;
  observers = [];
  mocks.entityVoteProps.length = 0;
  mocks.debates = [completedDebate('debate-1', 'Debates are useful', '2026-07-02T00:01:10.000Z')];
  mocks.processedIds = null;
  mocks.bestOrderIds = [];
  mocks.bestOrderLoading = false;
  mocks.mediaLoading = false;
  mocks.mediaError = false;
  mocks.createObjectURL.mockReturnValue('blob:https://geo.test/social-video');
  mocks.fetch.mockResolvedValue(videoResponse());
  mocks.canShare.mockReturnValue(false);
  mocks.mediaMutate.mockImplementation((variables, options) => {
    if (variables.request.kind === 'social_video') {
      options.onSuccess({ upload: { url: `https://video.test/${variables.debateId}.mp4` } });
    }
  });

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0.6];
    private readonly record: ObserverRecord;

    constructor(callback: IntersectionObserverCallback) {
      this.record = { callback, elements: new Set(), instance: this };
      observers.push(this.record);
    }

    observe = (element: Element) => this.record.elements.add(element);
    unobserve = (element: Element) => this.record.elements.delete(element);
    disconnect = () => this.record.elements.clear();
    takeRecords = () => [];
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  vi.stubGlobal(
    'ResizeObserver',
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('fetch', mocks.fetch);
  Object.defineProperty(navigator, 'share', { configurable: true, value: mocks.share });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: mocks.canShare });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: mocks.createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: mocks.revokeObjectURL });
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    configurable: true,
    value: mocks.downloadClick,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DebatesBrowseFeed video sharing', () => {
  it('uses the full-screen responsive layout and design copy', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    const heading = screen.getByRole('heading', { name: 'Debates are useful' });
    expect(screen.getByRole('button', { name: 'Join a debate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('size-8', 'justify-center', '-mb-3');
    const feedItem = heading.closest('section');
    assert(feedItem, 'Expected the debate heading to be rendered inside a feed item');
    // `pt-5` is the design's 20px gap under the navbar; `md:py-3` overrides it on mobile.
    expect(feedItem).toHaveClass('items-start', 'pt-5', 'md:h-auto', 'md:min-h-full', 'md:py-3');
    // One class per assertion: `not.toHaveClass(a, b)` only fails when *every* class is present,
    // so grouping them lets a regression on any single class slip through.
    expect(feedItem).not.toHaveClass('items-center');
    expect(feedItem).not.toHaveClass('pb-[2.75rem]');
    const mediaColumn = screen.getByTestId('player-debate-1').parentElement?.parentElement;
    assert(mediaColumn, 'Expected the debate player to be rendered inside the media column');
    expect(mediaColumn).toHaveClass('min-w-0', 'w-[var(--debate-feed-column-width)]', 'md:w-[calc(100vw-1rem)]');
    expect(mediaColumn).toHaveStyle({
      '--debate-feed-column-width': 'clamp(280px, min(calc(100cqw - 4rem), calc(82.9dvh - 10.88rem)), 640px)',
    });
    expect(screen.getByTestId('entity-votes-debate-horizontal')).toBeInTheDocument();
    expect(screen.getByTestId('entity-votes-debate-vertical')).toBeInTheDocument();
    expect(mocks.entityVoteProps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityId: 'debate-1', spaceId: 'space-1', responseKind: 'curation' }),
      ])
    );
  });

  it('renders when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);

    expect(() => render(<DebatesBrowseFeed spaceId="space-1" />)).not.toThrow();
  });

  it('clamps long claims and lets mobile users expand them', () => {
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.tagName === 'H2' ? 72 : 0;
    });
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.tagName === 'H2' ? 48 : 0;
    });

    try {
      const claim = 'A claim long enough to wrap beyond the two lines reserved by the debate header';
      mocks.debates = [completedDebate('debate-1', claim, '2026-07-02T00:01:10.000Z')];
      render(<DebatesBrowseFeed spaceId="space-1" />);

      const heading = screen.getByRole('heading', { name: claim });
      expect(heading).toHaveClass('line-clamp-2');
      expect(heading).not.toHaveClass('min-h-[42px]');
      expect(heading).toHaveAttribute('title', claim);

      const toggle = screen.getByRole('button', { name: 'Show more' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);

      expect(heading).toHaveClass('md:line-clamp-none');
      expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    } finally {
      scrollHeight.mockRestore();
      clientHeight.mockRestore();
    }
  });

  // The takeover fills the viewport, but a Debate entity page reaches it through a route the app
  // shell reads as an ordinary entity page. Left wrapped in that page's chrome, the document
  // grows taller than the viewport and the feed scrolls up under the sticky navbar.
  it('tells the app shell to drop its page chrome while the feed is on screen', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <DebatesBrowseFeed spaceId="space-1" />
      </Provider>
    );

    expect(store.get(debateFullscreenActiveAtom)).toBe(true);
  });

  it('leaves the chrome alone when it falls back to the entity page', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <DebatesBrowseFeed spaceId="space-1" initialDebateId="not-in-this-space" fallback={<div>Entity page</div>} />
      </Provider>
    );

    expect(screen.getByText('Entity page')).toBeInTheDocument();
    // An ordinary entity page renders here and does want the chrome.
    expect(store.get(debateFullscreenActiveAtom)).toBe(false);
  });

  it('nudges only when there is something below to scroll to', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);
    // A lone debate has nothing to scroll to, so promising more would be a lie.
    expect(screen.queryByTestId('scroll-hint')).not.toBeInTheDocument();

    cleanup();
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    expect(screen.getAllByTestId('scroll-hint')).toHaveLength(1);
  });

  // The media column has no height to spare for a hint in flow, and `100dvh` can overshoot
  // what's actually on screen — so the nudge hangs off the debate out of flow, rather than
  // being pinned to a container edge that may itself sit below the fold.
  it('hangs the nudge off the debate, out of flow and inside the lifting card', () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    const hint = screen.getByTestId('scroll-hint');
    expect(hint).toHaveClass('absolute', 'top-full');
    // Inside the card, so it travels with the debate instead of animating separately.
    expect(hint.closest('.bounce-stub')).not.toBeNull();
    expect(hint.closest('section')).toContainElement(screen.getByTestId('player-debate-1'));
  });

  it('lifts the whole landing debate with the nudge, and nothing below it', () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    // Title and controls travel with the media, so the card moves as one.
    const card = screen.getByTestId('player-debate-1').closest('.bounce-stub');
    assert(card, 'Expected the landing debate to be wrapped in the bouncing card');
    expect(card).toContainElement(screen.getByRole('heading', { name: 'Debates are useful' }));
    expect(card.querySelectorAll('[aria-label="Comments"]').length).toBeGreaterThan(0);

    expect(screen.getByTestId('player-debate-2').closest('.bounce-stub')).toBeNull();
  });

  // An errored anchor holds the feed with nothing painted even though `isLoading` has gone
  // false, so gating the nudge on the debate list alone would float it over an error screen.
  it('keeps the nudge down while an anchored feed is held back', () => {
    mocks.debates = [
      completedDebate('debate-1', 'Newest debate', '2026-07-03T00:01:10.000Z'),
      completedDebate('debate-2', 'Second debate', '2026-07-02T00:01:10.000Z'),
      completedDebate('debate-3', 'Linked debate', '2026-07-01T00:01:10.000Z'),
    ];
    // Two debates read as ready — enough to scroll between — but the anchor's lookup failed.
    mocks.processedIds = ['debate-1', 'debate-2'];
    mocks.mediaError = true;
    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-3" />);

    expect(screen.queryByTestId(/^player-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('scroll-hint')).not.toBeInTheDocument();
  });

  // The per-debate media lookups resolve independently and the list re-sorts on each
  // arrival, so the feed is still rearranging under the viewer while they land.
  it('holds the nudge back until the media lookups have settled', () => {
    mocks.mediaLoading = true;
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    render(<DebatesBrowseFeed spaceId="space-1" />);
    expect(screen.queryByTestId('scroll-hint')).not.toBeInTheDocument();

    cleanup();
    mocks.mediaLoading = false;
    render(<DebatesBrowseFeed spaceId="space-1" />);
    expect(screen.getAllByTestId('scroll-hint')).toHaveLength(1);
  });

  it('waits for five seconds of active dwell and never prepares an adjacent debate', async () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(4_999);
    expect(mocks.mediaMutate).not.toHaveBeenCalled();

    await advance(1);
    expect(mocks.mediaMutate).toHaveBeenCalledTimes(1);
    expect(mocks.mediaMutate).toHaveBeenCalledWith(
      { debateId: 'debate-1', request: { kind: 'social_video' } },
      expect.any(Object)
    );
    expect(mocks.mediaMutate.mock.calls.every(([variables]) => variables.request.kind !== 'social_preview_image')).toBe(
      true
    );
    expect(mocks.mediaMutate).not.toHaveBeenCalledWith(
      { debateId: 'debate-2', request: expect.anything() },
      expect.anything()
    );
  });

  it('cancels a fast-scroll dwell and starts a fresh five-second dwell for the new active debate', async () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(3_000);
    activateDebate('Adjacent debate');
    await advance(4_999);
    expect(mocks.mediaMutate).not.toHaveBeenCalled();

    await advance(1);
    expect(mocks.mediaMutate).toHaveBeenCalledTimes(1);
    expect(mocks.mediaMutate).toHaveBeenCalledWith(
      { debateId: 'debate-2', request: { kind: 'social_video' } },
      expect.any(Object)
    );
  });

  it('aborts an in-flight preparation and revokes a ready blob when scrolling away', async () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    let downloadSignal: AbortSignal | undefined;
    mocks.fetch.mockImplementationOnce((_url, init) => {
      downloadSignal = init.signal;
      return new Promise(() => undefined);
    });
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    expect(downloadSignal).toBeDefined();
    activateDebate('Adjacent debate');
    expect(downloadSignal?.aborted).toBe(true);

    cleanup();
    mocks.fetch.mockResolvedValue(videoResponse());
    render(<DebatesBrowseFeed spaceId="space-1" />);
    await advance(5_000);
    await flushPromises();
    expect(mocks.createObjectURL).toHaveBeenCalled();

    activateDebate('Adjacent debate');
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith('blob:https://geo.test/social-video');
  });

  it('does not start an MP4 download when the artifact URL arrives after deactivation', async () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
    let videoRequestOptions: { onSuccess: (response: { upload: { url: string } }) => void } | undefined;
    mocks.mediaMutate.mockImplementation((variables, options) => {
      if (variables.request.kind === 'social_video') videoRequestOptions = options;
    });
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    expect(videoRequestOptions).toBeDefined();
    activateDebate('Adjacent debate');
    videoRequestOptions?.onSuccess({ upload: { url: 'https://video.test/debate-1.mp4' } });
    await flushPromises();

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('keeps both preparing controls focusable, unavailable, and explained by a tooltip', async () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    const shareButtons = screen.getAllByRole('button', { name: 'Share debate video (preparing)' });
    expect(shareButtons).toHaveLength(2);
    for (const button of shareButtons) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
    }

    fireEvent.focus(shareButtons[0]);
    await advance(300);
    expect(screen.getAllByText('Preparing video for sharing… You can share soon.').length).toBeGreaterThan(0);
  });

  it('turns preparation failure into an enabled retry that starts immediately while active', async () => {
    let requestCount = 0;
    mocks.mediaMutate.mockImplementation((variables, options) => {
      if (variables.request.kind !== 'social_video') return;
      requestCount += 1;
      if (requestCount === 1) options.onError(new Error('Video unavailable'));
    });
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    const retryButtons = screen.getAllByRole('button', { name: 'Retry debate video preparation' });
    expect(retryButtons).toHaveLength(2);
    expect(retryButtons[0]).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(retryButtons[0]);
    expect(requestCount).toBe(2);
  });

  it('shares only the claim title and prepared MP4 from either ready control', async () => {
    mocks.canShare.mockReturnValue(true);
    mocks.share.mockResolvedValue(undefined);
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    await flushPromises();
    const shareButtons = screen.getAllByRole('button', { name: 'Share debate video' });
    expect(shareButtons).toHaveLength(2);
    expect(shareButtons.every(button => button.getAttribute('aria-disabled') === 'false')).toBe(true);
    fireEvent.focus(shareButtons[0]);
    await advance(300);
    expect(screen.queryByText('Share the debate video.')).not.toBeInTheDocument();

    fireEvent.click(shareButtons[1]);
    const file = mocks.share.mock.calls[0]?.[0].files[0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('debate-debate-1-social.mp4');
    expect(mocks.share).toHaveBeenCalledWith({ title: 'Debates are useful', files: [file] });
    expect(mocks.share.mock.calls[0]?.[0]).not.toHaveProperty('url');
    expect(mocks.share.mock.calls[0]?.[0]).not.toHaveProperty('text');
  });

  it('downloads the prepared MP4 when native file sharing is unsupported', async () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    await flushPromises();
    fireEvent.click(screen.getAllByRole('button', { name: 'Download debate video' })[0]);

    expect(mocks.downloadClick).toHaveBeenCalledTimes(1);
    const downloadLink = mocks.downloadClick.mock.instances[0] as HTMLAnchorElement;
    expect(downloadLink.href).toBe('blob:https://geo.test/social-video');
    expect(downloadLink.download).toBe('debate-debate-1-social.mp4');
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('keeps cancellation silent and a real handoff failure retryable without redownloading', async () => {
    mocks.canShare.mockReturnValue(true);
    mocks.share
      .mockRejectedValueOnce(new DOMException('Cancelled', 'AbortError'))
      .mockRejectedValueOnce(new Error('Share service unavailable'))
      .mockResolvedValueOnce(undefined);
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    await flushPromises();
    fireEvent.click(screen.getAllByRole('button', { name: 'Share debate video' })[0]);
    await flushPromises();
    expect(screen.queryByRole('button', { name: /try sharing/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Share debate video' })[0]);
    await flushPromises();
    const retryButtons = screen.getAllByRole('button', { name: 'Try sharing debate video again' });
    expect(retryButtons).toHaveLength(2);
    expect(mocks.mediaMutate).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(retryButtons[1]);
    await flushPromises();
    expect(mocks.share).toHaveBeenCalledTimes(3);
    expect(mocks.mediaMutate).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate handoffs across the horizontal and vertical controls', async () => {
    mocks.canShare.mockReturnValue(true);
    let resolveShare: (() => void) | undefined;
    mocks.share.mockReturnValue(new Promise<void>(resolve => (resolveShare = resolve)));
    render(<DebatesBrowseFeed spaceId="space-1" />);

    await advance(5_000);
    await flushPromises();
    const shareButtons = screen.getAllByRole('button', { name: 'Share debate video' });
    fireEvent.click(shareButtons[0]);
    fireEvent.click(shareButtons[1]);

    expect(mocks.share).toHaveBeenCalledTimes(1);
    const sharingButtons = screen.getAllByRole('button', { name: 'Sharing debate video' });
    expect(sharingButtons).toHaveLength(2);
    expect(sharingButtons.every(button => button.getAttribute('aria-disabled') === 'true')).toBe(true);
    fireEvent.focus(sharingButtons[0]);
    await advance(300);
    expect(screen.queryByText('Opening sharing options…')).not.toBeInTheDocument();

    resolveShare?.();
    await flushPromises();
  });
});

describe('DebatesBrowseFeed comments', () => {
  it('shows the comment count and opens the comments panel for the clicked debate', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    const commentButtons = screen.getAllByRole('button', { name: 'Comments' });
    expect(commentButtons.length).toBeGreaterThan(0);
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);

    fireEvent.click(commentButtons[0]);
    expect(screen.getByText('Comments panel for debate-1')).toBeInTheDocument();
  });

  // "Join a debate" is no longer one of the feed's own panels: it opens the shared hub, which is
  // cross-space and carries the filters, counts and ranking the feed's panel never had.
  it('opens the debates hub on the claims tab instead of a feed panel', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Join a debate' })[0]);

    expect(mocks.hubOpen).toHaveBeenCalledWith('claims');
    // The hub is a portal of its own, so nothing lands in the feed's in-flow panel slot.
    expect(screen.queryByText(/^Claims panel for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Comments panel for/)).not.toBeInTheDocument();
  });

  // Every control in the hub needs an account, so a signed-out viewer goes straight to the login
  // rather than a panel that refuses them at each step.
  it('sends a signed-out viewer to sign in instead of opening the hub', () => {
    mocks.signedIn = false;
    render(<DebatesBrowseFeed spaceId="space-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Join a debate' })[0]);

    expect(mocks.openPrivySignIn).toHaveBeenCalledOnce();
    expect(mocks.hubOpen).not.toHaveBeenCalled();
  });

  // Both would otherwise stack over the same feed, the hub on top of a panel nobody can see past.
  it('closes an open feed panel when the hub takes over', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Comments' })[0]);
    expect(screen.getByText('Comments panel for debate-1')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Join a debate' })[0]);

    expect(mocks.hubOpen).toHaveBeenCalledWith('claims');
    expect(screen.queryByText('Comments panel for debate-1')).not.toBeInTheDocument();
  });

  it('closes the claims panel when comments open, and vice versa', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Comments' })[0]);
    expect(screen.getByText('Comments panel for debate-1')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Claims' })[0]);
    expect(screen.getByText('Claims panel for debate-1')).toBeInTheDocument();
    expect(screen.queryByText('Comments panel for debate-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Comments' })[0]);
    expect(screen.getByText('Comments panel for debate-1')).toBeInTheDocument();
    expect(screen.queryByText(/^Claims panel for/)).not.toBeInTheDocument();
  });
});

// The panels describe the debate on screen, so scrolling the feed under an open
// panel has to bring the panel along — otherwise you're reading one debate's
// video beside another's comments.
describe('DebatesBrowseFeed panels follow the scrolled-to debate', () => {
  beforeEach(() => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate', '2026-07-01T00:01:10.000Z'));
  });

  it('moves the comments panel to the next debate on scroll', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Comments' })[0]);
    expect(screen.getByText('Comments panel for debate-1')).toBeInTheDocument();

    activateDebate('Adjacent debate');

    expect(screen.getByText('Comments panel for debate-2')).toBeInTheDocument();
    expect(screen.queryByText('Comments panel for debate-1')).not.toBeInTheDocument();
  });

  it('moves the claims panel to the next debate on scroll', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Claims' })[0]);
    expect(screen.getByText('Claims panel for debate-1')).toBeInTheDocument();

    activateDebate('Adjacent debate');

    expect(screen.getByText('Claims panel for debate-2')).toBeInTheDocument();
  });

  // A debate's bar is clickable from the moment any of it is on screen, but the
  // scroll observer only activates it at 60% — so mid-scroll a press would
  // otherwise open the panel on the debate being scrolled away from.
  it('opens the panel for the pressed debate even before the scroll observer activates it', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);
    // debate-1 is active; debate-2 has not crossed the activation threshold.
    const adjacent = screen.getByRole('heading', { name: 'Adjacent debate' }).closest('section');
    assert(adjacent, 'Expected a section for the adjacent debate');

    fireEvent.click(within(adjacent).getAllByRole('button', { name: 'Comments' })[0]);

    expect(screen.getByText('Comments panel for debate-2')).toBeInTheDocument();
    expect(screen.queryByText('Comments panel for debate-1')).not.toBeInTheDocument();
  });

  it('leaves a closed panel closed while scrolling', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    activateDebate('Adjacent debate');

    expect(screen.queryByText(/^Comments panel for/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Claims panel for/)).not.toBeInTheDocument();
  });
});

describe('DebatesBrowseFeed deep-link anchoring', () => {
  it('starts the feed on the linked debate, hoisted first and active', () => {
    mocks.debates = [
      completedDebate('debate-1', 'Newest debate', '2026-07-03T00:01:10.000Z'),
      completedDebate('debate-2', 'Linked debate', '2026-07-01T00:01:10.000Z'),
    ];
    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-2" />);

    const players = screen.getAllByTestId(/^player-/);
    expect(players[0]).toHaveAttribute('data-testid', 'player-debate-2');
    expect(players[0]).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('player-debate-1')).toHaveAttribute('data-active', 'false');
  });

  it('holds an anchored feed until the linked debate itself reads as ready', () => {
    mocks.debates = [
      completedDebate('debate-1', 'Newest debate', '2026-07-03T00:01:10.000Z'),
      completedDebate('debate-2', 'Linked debate', '2026-07-01T00:01:10.000Z'),
    ];
    // The newest debate's readiness resolved first; the anchor's lookup is still in flight.
    mocks.processedIds = ['debate-1'];
    mocks.mediaLoading = true;
    const view = render(
      <DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-2" fallback={<div>Entity page</div>} />
    );

    // No partial paint: rendering debate-1 now would land the viewer on the
    // wrong video and reorder once the anchor arrives.
    expect(screen.getByText('Loading debates…')).toBeInTheDocument();
    expect(screen.queryByTestId('player-debate-1')).not.toBeInTheDocument();
    expect(screen.queryByText('Entity page')).not.toBeInTheDocument();

    mocks.processedIds = ['debate-1', 'debate-2'];
    mocks.mediaLoading = false;
    view.rerender(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-2" fallback={<div>Entity page</div>} />);

    const players = screen.getAllByTestId(/^player-/);
    expect(players[0]).toHaveAttribute('data-testid', 'player-debate-2');
    expect(players[0]).toHaveAttribute('data-active', 'true');
  });

  it('shows the readiness error instead of falling back when the anchor lookup failed', () => {
    mocks.debates = [
      completedDebate('debate-1', 'Newest debate', '2026-07-03T00:01:10.000Z'),
      completedDebate('debate-2', 'Linked debate', '2026-07-01T00:01:10.000Z'),
    ];
    // Lookups settled, but the anchor's failed — its absence is unknown, not definitive.
    mocks.processedIds = ['debate-1'];
    mocks.mediaError = true;
    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-2" fallback={<div>Entity page</div>} />);

    expect(
      screen.getByText('Could not check which debates are ready to watch. Try again shortly.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Entity page')).not.toBeInTheDocument();
    // Painting the resolved sibling would land the viewer on the wrong video.
    expect(screen.queryByTestId('player-debate-1')).not.toBeInTheDocument();
  });

  it('falls back to the entity page once loading settles without the anchor', () => {
    mocks.debates = [completedDebate('debate-1', 'Newest debate', '2026-07-03T00:01:10.000Z')];
    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-9" fallback={<div>Entity page</div>} />);

    expect(screen.getByText('Entity page')).toBeInTheDocument();
    expect(screen.queryByTestId('player-debate-1')).not.toBeInTheDocument();
  });
});

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function activateDebate(claim: string) {
  const section = screen.getByRole('heading', { name: claim }).closest('section');
  if (!section) throw new Error(`Could not find debate section for ${claim}`);
  const observer = observers.find(record => record.elements.has(section));
  if (!observer) throw new Error(`Could not find observer for ${claim}`);
  act(() => {
    observer.callback(
      [
        {
          target: section,
          isIntersecting: true,
          intersectionRatio: 0.6,
        } as unknown as IntersectionObserverEntry,
      ],
      observer.instance
    );
  });
}

function videoResponse() {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: { 'content-length': '3', 'content-type': 'video/mp4' },
  });
}

function completedDebate(id: string, claim: string, completedAt: string): Debate {
  return {
    id,
    claim: {
      id: `claim-${id}`,
      space_id: 'space-1',
      claim_entity_id: `claim-entity-${id}`,
      claim,
      description: null,
    },
    status: 'complete',
    response_kind: null,
    room_name: id,
    first_participant_slot: 1,
    current_turn_index: 1,
    current_speaker_slot: null,
    connecting_started_at: null,
    connecting_deadline_at: null,
    turn_started_at: null,
    turn_ends_at: null,
    preflight_ends_at: null,
    turn_format_id: 'standard',
    turn_durations_ms: [30_000, 30_000],
    created_at: completedAt,
    started_at: completedAt,
    completed_at: completedAt,
    participants: [],
    recordings: [1, 2].map(slot => ({
      id: `${id}-recording-${slot}`,
      participant_slot: slot as 1 | 2,
      position: slot === 1,
      position_label: slot === 1 ? 'Yes' : 'No',
      user_id: `${id}-user-${slot}`,
      object_key: `${id}-recording-${slot}.webm`,
      filename: `${id}-recording-${slot}.webm`,
      source: 'local' as const,
      content_type: 'video/webm',
      started_at_ms: 0,
      ended_at_ms: 60_000,
      duration_seconds: 60,
      byte_size: 1,
      width: 640,
      height: 480,
      framerate: 30,
      video_bits_per_second: 500_000,
    })),
    recording_error: null,
    cancellation_reason: null,
    recording_cancelled_at: null,
    recording_cancelled_by: null,
  };
}

describe('DebatesBrowseFeed ordering', () => {
  const older = '2026-07-01T00:00:00.000Z';
  const newer = '2026-07-05T00:00:00.000Z';

  function headings() {
    return screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
  }

  // What plays after the debate you opened is what the explore page's "Best" sort would have
  // shown you, rather than simply the most recent thing in the space.
  it('follows the Best ranking rather than recency', () => {
    mocks.debates = [
      completedDebate('debate-old', 'Ranked first', older),
      completedDebate('debate-new', 'Ranked second', newer),
    ];
    mocks.bestOrderIds = ['debate-old', 'debate-new'];

    render(<DebatesBrowseFeed spaceId="space-1" />);

    expect(headings()).toEqual(['Ranked first', 'Ranked second']);
  });

  it('falls back to recency when the ranking covers nothing', () => {
    mocks.debates = [completedDebate('debate-old', 'Older', older), completedDebate('debate-new', 'Newer', newer)];
    mocks.bestOrderIds = [];

    render(<DebatesBrowseFeed spaceId="space-1" />);

    expect(headings()).toEqual(['Newer', 'Older']);
  });

  // The ranking only covers published, named debates. Anything it misses still plays — after the
  // ranked ones, in the order the feed used before.
  it('plays unranked debates after the ranked ones, newest first', () => {
    mocks.debates = [
      completedDebate('debate-unranked-old', 'Unranked older', older),
      completedDebate('debate-ranked', 'Ranked', older),
      completedDebate('debate-unranked-new', 'Unranked newer', newer),
    ];
    mocks.bestOrderIds = ['debate-ranked'];

    render(<DebatesBrowseFeed spaceId="space-1" />);

    expect(headings()).toEqual(['Ranked', 'Unranked newer', 'Unranked older']);
  });

  // Opening a debate still lands you on it; the ranking decides what follows, not what leads.
  it('keeps the debate you opened first and ranks the rest behind it', () => {
    mocks.debates = [
      completedDebate('debate-top', 'Ranked first', older),
      completedDebate('debate-mid', 'Ranked second', newer),
      completedDebate('debate-anchor', 'Opened', older),
    ];
    mocks.bestOrderIds = ['debate-top', 'debate-mid', 'debate-anchor'];

    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-anchor" />);

    expect(headings()).toEqual(['Opened', 'Ranked first', 'Ranked second']);
  });

  // Painting in recency order and then resequencing would move the next debate out from under
  // someone who had already started scrolling.
  it('waits for the ranking before drawing the feed', () => {
    mocks.debates = [completedDebate('debate-1', 'Debates are useful', older)];
    mocks.bestOrderLoading = true;

    render(<DebatesBrowseFeed spaceId="space-1" />);

    expect(screen.queryByRole('heading', { name: 'Debates are useful' })).not.toBeInTheDocument();
  });
});
