import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import { Provider, createStore } from 'jotai';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { type Debate, GeoChatRequestError } from '~/core/debates/api';

import { DebatesBrowseFeed } from './debate-feed';
import { debateFullscreenActiveAtom } from '~/atoms';

const mocks = vi.hoisted(() => ({
  debates: [] as Debate[],
  /** null = every debate reads as processed (the common-case default). */
  processedIds: null as string[] | null,
  mediaLoading: false,
  mediaError: false,
  entityVoteProps: [] as Array<Record<string, unknown>>,
  /** Debate entity ids in "Best" order. Empty = the ranking covers nothing, so recency stands. */
  bestOrderIds: [] as string[],
  bestOrderLoading: false,
  /** Claims extracted from the transcript, as the count badge sees them. */
  claimsCount: 0,
  hubOpen: vi.fn(),
  hubClose: vi.fn(),
  /** Whether the debates hub is already showing. */
  hubIsOpen: false,
  openPrivySignIn: vi.fn(),
  /** What the feed asked to happen once Privy finishes. */
  privyOnComplete: undefined as undefined | (() => void),
  /** Privy's answer, which is the authority on whether anyone is signed in. */
  authenticated: true,
  /** False while Privy is still restoring the session. */
  authReady: true,
  /** The anchor fetched by id when it is not in the space listing (GEO-2764). */
  anchorDebate: null as ReturnType<typeof completedDebate> | null,
  anchorLoading: false,
  anchorError: null as Error | null,
}));

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
  instance: IntersectionObserver;
};

let observers: ObserverRecord[] = [];

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: mocks.authReady, authenticated: mocks.authenticated, accountKey: 'user-a' }),
  useSpaceDebates: () => ({ data: { debates: mocks.debates }, isLoading: false, error: null }),
  useProcessedVideoDebateIds: () => ({
    processedIds: mocks.processedIds ?? mocks.debates.map(debate => debate.id),
    isLoading: mocks.mediaLoading,
    hasError: mocks.mediaError,
  }),
  useDebate: () => ({ data: mocks.anchorDebate, isLoading: mocks.anchorLoading, error: mocks.anchorError }),
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

// PrefetchLink hydrates the entity it points at on hover, so it reaches for the sync engine and
// the router. Stubbing those keeps the real anchor — and therefore the real hrefs — under test.
vi.mock('~/core/sync/use-sync-engine', () => ({
  useSyncEngine: () => ({ hydrate: vi.fn() }),
}));
vi.mock('next/navigation', async () => {
  const actual = await vi.importActual<typeof import('next/navigation')>('next/navigation');
  return { ...actual, useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn() }) };
});

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
vi.mock('./share-dialog', () => ({
  DebateShareDialog: () => null,
}));
vi.mock('~/core/debates/matchmaking/use-debates-hub', () => ({
  useDebatesHub: () => ({
    isOpen: mocks.hubIsOpen,
    activeTab: 'claims' as const,
    open: mocks.hubOpen,
    close: mocks.hubClose,
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

vi.mock('~/core/debates/use-debate-transcript-claims', () => ({
  useDebateTranscriptClaims: () => ({
    claims: { all: [], byAuthorSpaceId: new Map(), unattributed: [], totalCount: mocks.claimsCount },
    isLoading: false,
    error: null,
  }),
}));

// Reaches for next-navigation and Privy context the feed's tests do not stand up.
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (onComplete?: () => void) => {
    mocks.privyOnComplete = onComplete;
    return mocks.openPrivySignIn;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  // Not mock fns, so `resetAllMocks` does not restore them.
  mocks.authenticated = true;
  mocks.authReady = true;
  mocks.hubIsOpen = false;
  observers = [];
  mocks.entityVoteProps.length = 0;
  mocks.debates = [completedDebate('debate-1', 'Debates are useful', '2026-07-02T00:01:10.000Z')];
  mocks.processedIds = null;
  mocks.anchorDebate = null;
  mocks.anchorLoading = false;
  mocks.anchorError = null;
  mocks.bestOrderIds = [];
  mocks.bestOrderLoading = false;
  mocks.claimsCount = 0;
  mocks.mediaLoading = false;
  mocks.mediaError = false;

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
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DebatesBrowseFeed header links', () => {
  // Both name something that has a page, and neither was reachable.
  it('links the space chip to the space and the claim title to its entity', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    const heading = screen.getByRole('heading', { name: 'Debates are useful' });
    // Inside the h2, not instead of it: the ref, the line clamp and the overflow measurement all
    // stay on the element they were written for.
    expect(within(heading).getByRole('link', { name: 'Debates are useful' })).toHaveAttribute(
      'href',
      '/space/space-1/claim-entity-debate-1'
    );

    expect(screen.getAllByRole('link', { name: 'Fashion' })[0]).toHaveAttribute('href', '/space/space-1');
  });

  // Truncation runs parent -> anchor -> text, and an anchor at its default `min-width: auto` would
  // refuse to shrink, pushing the topics off the row instead of ellipsing the name.
  it('keeps the space link shrinkable so the name still truncates', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    expect(screen.getAllByRole('link', { name: 'Fashion' })[0]).toHaveClass('min-w-0');
  });
});

describe('DebatesBrowseFeed layout and scroll nudge', () => {
  it('uses the full-screen responsive layout and design copy', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    const heading = screen.getByRole('heading', { name: 'Debates are useful' });
    expect(screen.getByRole('button', { name: 'Join a debate' })).toBeInTheDocument();
    // The feed carried its own back arrow on mobile because it covers the navbar there. The
    // browser's own back is the way out now, so nothing in the feed should offer a second one.
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
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

  /**
   * jsdom has no layout, so the heading's measurements are supplied. The numbers are the ones
   * Chromium reports for the real type scale at 390px: a 24px face on 24px leading, where one
   * rendered line of glyphs is 26px of content inside a 24px box.
   */
  function stubHeadingMetrics({ contentHeight, clampedHeight }: { contentHeight: number; clampedHeight: number }) {
    const isHeading = (el: HTMLElement) => el.tagName === 'H2';
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return isHeading(this) ? contentHeight : 0;
    });
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return isHeading(this) ? clampedHeight : 0;
    });
    const original = window.getComputedStyle.bind(window);
    // Proxied rather than spread: a spread `CSSStyleDeclaration` is a plain object, and Testing
    // Library's accessible-name computation calls `getPropertyValue` on whatever this returns.
    const computed = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) => {
      const style = original(el, pseudo);
      if (!(el instanceof HTMLElement) || !isHeading(el)) return style;
      return new Proxy(style, {
        get(target, property) {
          if (property === 'lineHeight') return '24px';
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    });
    return () => {
      scrollHeight.mockRestore();
      clientHeight.mockRestore();
      computed.mockRestore();
    };
  }

  /**
   * GEO-2756. The old check was `scrollHeight > clientHeight`, and the claim title's leading is
   * tighter than its glyphs — so every title measured two pixels over its own box and the control
   * was offered permanently. It only ever showed on mobile, which is where it was reported, because
   * the button is `hidden md:inline-flex` and `md` here is `max-width: 767px`.
   */
  it('offers no expand control for a claim that fits', () => {
    const restore = stubHeadingMetrics({ contentHeight: 26, clampedHeight: 24 });

    try {
      const claim = 'Bitcoin is money';
      mocks.debates = [completedDebate('debate-1', claim, '2026-07-02T00:01:10.000Z')];
      render(<DebatesBrowseFeed spaceId="space-1" />);

      const heading = screen.getByRole('heading', { name: claim });
      expect(heading).toHaveClass('line-clamp-2');
      // No tooltip either: it repeated a title the reader can already see in full.
      expect(heading).not.toHaveAttribute('title');
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('offers no expand control for a claim that exactly fills the clamp', () => {
    const restore = stubHeadingMetrics({ contentHeight: 50, clampedHeight: 48 });

    try {
      const claim = 'A claim that wraps onto a second line and stops there';
      mocks.debates = [completedDebate('debate-1', claim, '2026-07-02T00:01:10.000Z')];
      render(<DebatesBrowseFeed spaceId="space-1" />);

      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('clamps long claims and lets mobile users expand them', () => {
    const restore = stubHeadingMetrics({ contentHeight: 74, clampedHeight: 48 });

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
      restore();
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

  // GEO-2764. `list_space_debates` is `LIMIT 50` with no pagination, so a watchable debate can be
  // past the window and simply absent from the listing. Resolving the anchor from that listing
  // silently rendered the ordinary entity page instead of the feed.
  it('plays an anchor that is past the space listing window', () => {
    mocks.debates = [completedDebate('debate-1', 'In the window', '2026-07-02T00:01:10.000Z')];
    mocks.anchorDebate = completedDebate('debate-99', 'Past the window', '2026-07-01T00:00:00.000Z');
    mocks.processedIds = ['debate-1', 'debate-99'];

    const store = createStore();
    render(
      <Provider store={store}>
        <DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-99" fallback={<div>Entity page</div>} />
      </Provider>
    );

    expect(screen.queryByText('Entity page')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-debate-99')).toBeInTheDocument();
    // And it takes over the chrome, which the fallback path deliberately does not.
    expect(store.get(debateFullscreenActiveAtom)).toBe(true);
  });

  // Being navigated to is not a reason to play a debate with no video: the directly-fetched anchor
  // goes through the same media gate as everything in the listing.
  it('still falls back when the fetched anchor has no processed video', () => {
    mocks.debates = [completedDebate('debate-1', 'In the window', '2026-07-02T00:01:10.000Z')];
    mocks.anchorDebate = completedDebate('debate-99', 'Past the window', '2026-07-01T00:00:00.000Z');
    mocks.processedIds = ['debate-1'];

    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-99" fallback={<div>Entity page</div>} />);

    expect(screen.getByText('Entity page')).toBeInTheDocument();
  });

  // Falling back while the direct fetch is still in flight is the bug itself, one race later.
  it('waits for the anchor fetch rather than falling back mid-flight', () => {
    mocks.debates = [completedDebate('debate-1', 'In the window', '2026-07-02T00:01:10.000Z')];
    mocks.anchorDebate = null;
    mocks.anchorLoading = true;

    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-99" fallback={<div>Entity page</div>} />);

    expect(screen.queryByText('Entity page')).not.toBeInTheDocument();
    expect(screen.getByText('Loading debates…')).toBeInTheDocument();
  });

  // GEO-2785. A hidden debate reads as 404 on every by-id route, so the anchor fetch fails with a
  // definitive answer rather than an ambiguous one. That has to fall back to the entity page: the
  // transient-error path below deliberately HOLDS the feed, and holding it for a debate that is
  // deliberately gone would strand the visitor on an error for content we chose to hide.
  it('falls back when the anchor is gone (404), rather than holding on an error', () => {
    mocks.debates = [completedDebate('debate-1', 'In the window', '2026-07-02T00:01:10.000Z')];
    mocks.anchorDebate = null;
    mocks.anchorError = new GeoChatRequestError('404 Not Found', 'debate_not_found', 404);

    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-99" fallback={<div>Entity page</div>} />);

    expect(screen.getByText('Entity page')).toBeInTheDocument();
  });

  // The contrast that makes the case above load-bearing: a transient failure is *unknown*, so it
  // must NOT fall back -- that would misreport a blip as "this debate has no video".
  it('holds the feed on a non-404 anchor error instead of falling back', () => {
    mocks.debates = [completedDebate('debate-1', 'In the window', '2026-07-02T00:01:10.000Z')];
    mocks.anchorDebate = null;
    mocks.anchorError = new GeoChatRequestError('500 Internal Server Error', null, 500);

    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-99" fallback={<div>Entity page</div>} />);

    expect(screen.queryByText('Entity page')).not.toBeInTheDocument();
  });

  // A debate that genuinely is not watchable anywhere still reaches the entity page.
  it('falls back when the anchor cannot be resolved at all', () => {
    mocks.debates = [completedDebate('debate-1', 'In the window', '2026-07-02T00:01:10.000Z')];
    mocks.anchorDebate = null;

    render(<DebatesBrowseFeed spaceId="space-1" initialDebateId="debate-99" fallback={<div>Entity page</div>} />);

    expect(screen.getByText('Entity page')).toBeInTheDocument();
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
    mocks.authenticated = false;
    render(<DebatesBrowseFeed spaceId="space-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Join a debate' })[0]);

    expect(mocks.openPrivySignIn).toHaveBeenCalledOnce();
    expect(mocks.hubOpen).not.toHaveBeenCalled();
  });

  // The hub dismisses itself on outside pointerdown and exempts anything marked as an opener.
  // Without the marker the pointerdown closed it and the click reopened it — a visible flicker,
  // and a toggle that never appeared to work.
  it('marks the button as a hub opener so the panel does not dismiss on pointerdown', () => {
    render(<DebatesBrowseFeed spaceId="space-1" />);

    expect(screen.getAllByRole('button', { name: 'Join a debate' })[0]).toHaveAttribute('data-debates-hub-opener');
  });

  // `useSmartAccount` reads null while the account restores and after an init failure as well as
  // when signed out, so gating on it sent a signed-in viewer back through a login that clears
  // their half-finished onboarding. Privy is asked instead, and it is not asked until it is ready.
  // Signing in is a detour the viewer did not ask for, so the press survives it rather than
  // returning them to the feed to press the same button again.
  it('opens the hub once sign-in completes, without a second press', () => {
    mocks.authenticated = false;
    render(<DebatesBrowseFeed spaceId="space-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Join a debate' })[0]);
    expect(mocks.openPrivySignIn).toHaveBeenCalledOnce();
    expect(mocks.hubOpen).not.toHaveBeenCalled();

    act(() => mocks.privyOnComplete?.());

    expect(mocks.hubOpen).toHaveBeenCalledWith('claims');
  });

  it('does nothing until Privy has restored the session', () => {
    mocks.authReady = false;
    mocks.authenticated = false;
    render(<DebatesBrowseFeed spaceId="space-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Join a debate' })[0]);

    expect(mocks.openPrivySignIn).not.toHaveBeenCalled();
    expect(mocks.hubOpen).not.toHaveBeenCalled();
  });

  // Otherwise the button is a one-way door: pressing it again did nothing and the only way out was
  // the panel's own close control.
  it('closes the hub when the button is pressed a second time', () => {
    mocks.hubIsOpen = true;
    render(<DebatesBrowseFeed spaceId="space-1" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Join a debate' })[0]);

    expect(mocks.hubClose).toHaveBeenCalledOnce();
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
