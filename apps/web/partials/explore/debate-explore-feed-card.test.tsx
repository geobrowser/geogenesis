import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, createStore, useAtomValue, useSetAtom } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import { DebateFeedAutoplay, tappedDebateAtom } from '~/core/debates/debate-playback-gate';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { InsideMobileSheet } from '~/core/state/mobile-sheet-cover';
import { lockMobileSheetDocumentOverscroll } from '~/core/utils/mobile-sheet-drag';
import { NavUtils } from '~/core/utils/utils';

import { DebateExploreFeedCard } from './debate-explore-feed-card';
import { ExploreDebateClaimsPanelHost } from './explore-debate-claims-panel-host';
import { entityCommentsPanelAtom, entitySidePanelAtom, openEntitySidePanelAtom } from '~/atoms';

// Reached through the claims panel, which now carries the shared response controls. The module's
// top-level `atomWithStorage` runs on import, and under Node's own webstorage — which shadows
// jsdom's with an object that has no getItem — that import takes the suite down before a test runs.
// The meta row's Join/Follow offer reads the space type and the viewer (GEO-3236); both have their
// own suites.
vi.mock('~/core/hooks/use-is-personal-space', () => ({ useIsPersonalSpace: () => undefined }));
vi.mock('~/core/hooks/use-personal-space-id', () => ({
  usePersonalSpaceId: () => ({ personalSpaceId: null, isRegistered: false, isLoading: false }),
}));

vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false, pending: null }),
  pendingPersonalSpaceId: (topicId: string) => `pending:${topicId}`,
  isPendingPersonalSpaceId: () => false,
  PENDING_PERSONAL_SPACE_PREFIX: 'pending:',
}));

const mocks = vi.hoisted(() => ({
  debateQuery: { data: undefined as Debate | undefined, isError: false },
  mediaQuery: { data: undefined as { artifacts: { kind: string }[] } | undefined, isError: false },
  playerToggle: vi.fn(),
  /** Draw a stand-in end card inside the player: its controls, and a popover portalled out of it. */
  withEndCard: false,
  endCardVote: vi.fn(),
  endCardReplay: vi.fn(),
  portalledClick: vi.fn(),
  isMobileLayout: false,
}));

vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => mocks.isMobileLayout }));

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
  instance: IntersectionObserver;
  options?: IntersectionObserverInit;
};

let observers: ObserverRecord[] = [];

vi.mock('~/core/state/feature-flags', () => ({}));

vi.mock('next/navigation', () => ({ usePathname: () => '/root/explore' }));

vi.mock('~/core/debates/hooks', () => ({
  useDebate: () => mocks.debateQuery,
  useDebateMedia: () => mocks.mediaQuery,
}));

// The card renders the real `DebateInteractionBar` — sharing it with the full-screen feed is the
// point of these assertions. The claim footer around it is stood in for: its reads and pills are
// covered by debate-claim-footer.test.tsx, and here it only has to place what the card hands it.
vi.mock('~/core/debates/browse/debate-claim-footer', () => ({
  DebateClaimFooter: ({
    claim,
    enabled,
    meta,
    title,
    actions,
  }: {
    claim: Debate['claim'] | null;
    enabled: boolean;
    meta: React.ReactNode;
    title: React.ReactNode;
    actions: React.ReactNode;
  }) => (
    <div data-testid="claim-footer" data-claim={claim?.claim_entity_id ?? 'none'} data-enabled={String(enabled)}>
      {meta}
      {title}
      {actions}
    </div>
  ),
}));

vi.mock('~/core/debates/browse/debate-feed-player', async () => {
  const { createPortal } = await import('react-dom');
  return {
    DebateFeedPlayer: ({
      debate,
      active,
      buffer,
      releaseMedia,
      holdFullPlayback,
      reducedOverlays,
      framed,
      onOpenClaims,
      tapToPlay,
      onPlaybackRequest,
    }: {
      debate: Debate;
      active: boolean;
      buffer?: boolean;
      releaseMedia?: boolean;
      holdFullPlayback?: boolean;
      reducedOverlays?: boolean;
      framed?: boolean;
      onOpenClaims?: () => void;
      tapToPlay?: boolean;
      onPlaybackRequest?: () => void;
    }) => (
      <>
        {/* The real player's Play on a card waiting for a tap: it calls `onPlaybackRequest`. */}
        {tapToPlay && !active ? (
          <button type="button" data-testid="player-play" onClick={() => onPlaybackRequest?.()}>
            Play debate
          </button>
        ) : null}
        <button
          type="button"
          data-testid="player"
          data-debate={debate.id}
          data-active={active}
          data-tap-to-play={tapToPlay ? 'true' : 'false'}
          data-release-media={releaseMedia ? 'true' : 'false'}
          data-buffer={buffer ? 'true' : 'false'}
          data-hold-full-playback={holdFullPlayback ? 'true' : 'false'}
          data-reduced-overlays={reducedOverlays ? 'true' : 'false'}
          data-framed={framed ? 'true' : 'false'}
          onClick={mocks.playerToggle}
        />
        {/* Stands in for the claims chip on the video, now the card's only way into the panel. */}
        <button type="button" data-testid="video-claims" onClick={onOpenClaims}>
          Claims on the video
        </button>
        {mocks.withEndCard ? (
          <div data-debate-end-card>
            <button type="button" data-testid="end-card-vote" onClick={mocks.endCardVote} />
            <button type="button" data-testid="end-card-replay" data-end-card-replay onClick={mocks.endCardReplay} />
            {createPortal(
              <button type="button" data-testid="end-card-portalled" onClick={mocks.portalledClick} />,
              document.body
            )}
          </div>
        ) : null}
      </>
    ),
  };
});

vi.mock('~/core/debates/browse/use-debate-share-action', () => ({
  useDebateShareAction: () => ({ open: false, onOpen: vi.fn(), onOpenChange: vi.fn() }),
}));

vi.mock('~/core/debates/browse/share-dialog', () => ({
  DebateShareDialog: () => null,
}));

vi.mock('~/core/debates/browse/debate-claims-panel', () => ({
  DebateClaimsPanel: ({ onClose }: { onClose: () => void }) => (
    <aside data-testid="claims-panel">
      <button type="button" onClick={onClose}>
        Close
      </button>
    </aside>
  ),
}));

// Forwards everything to a real anchor rather than only `href`: the claim title's panel behaviour
// lives in its `onClick` and its opener data attribute, and a mock that dropped them would render
// a link that looks right and does nothing.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    entityId: _entityId,
    spaceId: _spaceId,
    ...rest
  }: {
    children: React.ReactNode;
    entityId?: string;
    spaceId?: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...rest}>{children}</a>,
}));

vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: () => <div data-testid="image" />,
}));

vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: ({ children }: { children: React.ReactNode }) => <div data-testid="row-actions">{children}</div>,
}));

vi.mock('./explore-join-space-button', () => ({
  ExploreJoinSpaceButton: () => <button type="button" data-testid="join-button" />,
}));

const CLAIM_NAME = 'Fast fashion should be discouraged with higher taxation';

const item: ExploreFeedItem = {
  entityId: 'fd51f9352063461780397b672b23364c',
  spaceId: 'space-1',
  spaceName: 'Fashion',
  spaceImage: null,
  types: [{ id: 'fd51f93520634617be397b672b23364c', name: 'Debate' }],
  createdAtSec: 0,
  // What `debate-publish-draft` actually names a Debate entity: the debaters, then the motion.
  title: `Ada vs. Blaise on ${CLAIM_NAME}`,
  description: null,
  imageUrl: null,
  commentCount: 3,
  recordingUrls: [],
  debateVideoUrls: [],
  debateClaim: { entityId: 'claim-entity-1', name: CLAIM_NAME },
  isMemberOrEditor: true,
  hasPendingMembershipRequest: false,
};

function watchableDebate(): Debate {
  return {
    id: 'fd51f935-2063-4617-8039-7b672b23364c',
    status: 'complete',
    // The card reads `claim.space_id` to scope its transcript-claims lookup to the space the
    // debate was published to, so the fixture carries the claim the type has always required.
    claim: {
      id: 'claim-summary-1',
      space_id: '52c7ae149838b6d47ce0f3b2a5974546',
      claim_entity_id: 'claim-entity-1',
      claim: 'Waking up early improves health and productivity',
      description: null,
    },
    recordings: [{ participant_slot: 1 }, { participant_slot: 2 }],
    participants: [],
  } as unknown as Debate;
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  observers = [];
  mocks.debateQuery = { data: undefined, isError: false };
  mocks.mediaQuery = { data: undefined, isError: false };
  mocks.withEndCard = false;
  mocks.isMobileLayout = false;

  class MockIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0.6];
    private readonly record: ObserverRecord;

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.record = { callback, elements: new Set(), instance: this, options };
      observers.push(this.record);
    }

    observe(element: Element) {
      this.record.elements.add(element);
    }

    unobserve(element: Element) {
      this.record.elements.delete(element);
    }

    disconnect() {
      this.record.elements.clear();
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function intersectAll(ratio: number) {
  act(() => {
    for (const record of observers) {
      for (const element of record.elements) {
        record.callback(
          [
            {
              target: element,
              isIntersecting: ratio > 0,
              intersectionRatio: ratio,
              boundingClientRect: { top: 0 },
              rootBounds: null,
            } as unknown as IntersectionObserverEntry,
          ],
          record.instance
        );
      }
    }
  });
}

/**
 * Only the card's own on-screen observer, leaving the near-viewport window (`rootMargin`) where it
 * is: a card scrolled just off screen is still in the look-ahead band and keeps its player mounted.
 */
function intersectOnScreen(ratio: number, target?: Element) {
  act(() => {
    for (const record of observers.filter(candidate => !candidate.options?.rootMargin)) {
      for (const element of record.elements) {
        if (target && element !== target) continue;
        record.callback(
          [
            {
              target: element,
              isIntersecting: ratio > 0,
              intersectionRatio: ratio,
              boundingClientRect: { top: 0 },
              rootBounds: null,
            } as unknown as IntersectionObserverEntry,
          ],
          record.instance
        );
      }
    }
  });
}

/** Only the up-next observer: the card at `top` px from the top of an 800px-high screen. */
function intersectUpNext(top: number | null) {
  act(() => {
    for (const record of observers.filter(candidate => candidate.options?.rootMargin === '0px 0px 100% 0px')) {
      for (const element of record.elements) {
        record.callback(
          [
            {
              target: element,
              isIntersecting: top !== null,
              intersectionRatio: top === null ? 0 : 1,
              boundingClientRect: { top: top ?? 0 },
              rootBounds: { height: 800 },
            } as unknown as IntersectionObserverEntry,
          ],
          record.instance
        );
      }
    }
  });
}

function PanelProbe() {
  const target = useAtomValue(entitySidePanelAtom);
  return <div data-testid="panel">{target ? `${target.entityId} in ${target.spaceId}` : 'closed'}</div>;
}

function CommentsPanelProbe() {
  const target = useAtomValue(entityCommentsPanelAtom);
  return (
    <div data-testid="comments-panel-target">
      {target ? `${target.entityId} in ${target.spaceId} (${target.targetEntityType})` : 'closed'}
    </div>
  );
}

// The card is rendered inside the app's query provider — its comment count reads the comments cache —
// so the harness has to provide one too, or the double is laxer than the real tree.
let client: QueryClient;

/** In a feed by default, where the card's own visibility decides; `feed: false` is every other surface. */
function CardHarness({
  props,
  feed = true,
}: {
  props: Partial<React.ComponentProps<typeof DebateExploreFeedCard>>;
  feed?: boolean;
}) {
  const card = <DebateExploreFeedCard item={item} fallback={<div data-testid="fallback" />} {...props} />;

  return (
    <QueryClientProvider client={client}>
      <Provider>
        {feed ? <DebateFeedAutoplay>{card}</DebateFeedAutoplay> : card}
        <ExploreDebateClaimsPanelHost />
        <PanelProbe />
        <CommentsPanelProbe />
      </Provider>
    </QueryClientProvider>
  );
}

function renderCard(props: Partial<React.ComponentProps<typeof DebateExploreFeedCard>> = {}, feed = true) {
  const result = render(<CardHarness props={props} feed={feed} />);
  return {
    ...result,
    rerenderCard: () => result.rerender(<CardHarness props={props} feed={feed} />),
  };
}

/** Dispatches a click the way a browser would, so `defaultPrevented` is observable. */
function clickTitle(init?: MouseEventInit) {
  const anchor = screen.getByRole('link', { name: CLAIM_NAME });
  const event = createEvent.click(anchor, init);
  fireEvent(anchor, event);
  return event;
}

describe('DebateExploreFeedCard', () => {
  it('shows the card chrome with video placeholders while the debate loads', () => {
    renderCard();
    expect(screen.getByText(CLAIM_NAME)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Watch this debate full screen' })).toBeDefined();
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  // GEO-3280. The feed's lead debate arrives with its stills, so the card paints them at once.
  it("paints the feed's stills in place of the placeholders until the player takes over", () => {
    const posters = { slot1: 'https://chat.test/still-1', slot2: 'https://chat.test/still-2' };
    const { container } = renderCard({ item: { ...item, debatePosters: posters } });

    const stills = [...container.querySelectorAll<HTMLImageElement>('img[data-debate-poster]')];
    expect(stills.map(img => img.getAttribute('src'))).toEqual([posters.slot1, posters.slot2]);
    expect(stills.every(img => img.getAttribute('fetchpriority') === 'high')).toBe(true);
    expect(container.querySelector('.animate-pulse')).toBeNull();

    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    intersectAll(0.7);
    expect(screen.getByTestId('player')).toBeDefined();
    expect(container.querySelector('img[data-debate-poster]')).toBeNull();
  });

  it('keeps compact Activity chrome to one metadata row and two title lines', async () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    const { container } = renderCard({ compactChrome: true });
    intersectAll(0.1);

    expect(screen.queryByText('Debate')).toBeNull();
    const heading = screen.getByRole('heading', { name: CLAIM_NAME });
    expect(heading).toHaveClass('line-clamp-2');
    expect(heading).not.toHaveAttribute('title');

    Object.defineProperty(heading, 'scrollHeight', { configurable: true, value: 69 });
    Object.defineProperty(heading, 'clientHeight', { configurable: true, value: 46 });
    heading.style.lineHeight = '23px';
    await act(async () => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    expect(heading).toHaveAttribute('title', CLAIM_NAME);

    expect(screen.getByText('Fashion').closest('div')).toHaveClass('flex-nowrap', 'overflow-hidden');
    expect(screen.getByTestId('player')).toHaveAttribute('data-reduced-overlays', 'true');
    // Gallery cards own one frame, flush with the row, and follow the gallery's width.
    expect(container.querySelector('article')).not.toHaveClass('py-2');
    expect(container.querySelector('article')).not.toHaveClass('border-b');
    const frame = screen.getByTestId('claim-footer').parentElement;
    expect(frame).toHaveClass('border', 'rounded-lg', 'max-w-full');
    expect(frame?.style.getPropertyValue('--debate-card-media-width')).toBe('');
    expect(frame).toHaveAttribute('data-debate-card-surface', 'compact');
    expect(frame).not.toHaveClass('rounded-[26px]', 'p-4');
    // Gallery cards leave comments and sharing to the full-screen debate.
    expect(screen.queryByRole('button', { name: /^Open comments/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share claim' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Watch this debate full screen' })).toHaveAttribute(
      'href',
      '/space/space-1/fd51f9352063461780397b672b23364c'
    );
  });

  it('renders the fallback when the debate is not watchable', () => {
    mocks.debateQuery = { data: { ...watchableDebate(), status: 'cancelled' } as Debate, isError: false };
    renderCard();
    expect(screen.getByTestId('fallback')).toBeDefined();
  });

  it('renders the fallback when the final video was never processed', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [] }, isError: false };
    renderCard();
    expect(screen.getByTestId('fallback')).toBeDefined();
  });

  it('renders the player once the debate is watchable and processed, activating in view', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    // Ready query data alone does not retain media outside the bounded viewport window.
    expect(screen.queryByTestId('player')).toBeNull();

    intersectAll(0.7);
    expect(screen.getByTestId('player').getAttribute('data-active')).toBe('true');

    intersectAll(0.4);
    expect(screen.getByTestId('player').getAttribute('data-active')).toBe('false');
  });

  describe('cards taller than the viewport', () => {
    function renderLandscapeCard() {
      vi.stubGlobal('innerHeight', 375);
      let height = 1000;
      const originalRect = HTMLElement.prototype.getBoundingClientRect;
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const rect = originalRect.call(this);
        return this.tagName === 'ARTICLE' ? { ...rect, height } : rect;
      });
      const resizeCallbacks = new Set<() => void>();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(private callback: () => void) {
            resizeCallbacks.add(callback);
          }
          observe() {}
          disconnect() {
            resizeCallbacks.delete(this.callback);
          }
        }
      );
      mocks.isMobileLayout = true;
      mocks.debateQuery = { data: watchableDebate(), isError: false };
      mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
      renderCard();
      intersectAll(0.1);
      return {
        player: () => screen.getByTestId('player'),
        thresholds: () =>
          observers.find(record => !record.options?.rootMargin && record.elements.size > 0)?.options?.threshold,
        resizeCard: (nextHeight: number) => {
          height = nextHeight;
          act(() => resizeCallbacks.forEach(callback => callback()));
        },
      };
    }

    it('activates within the visible viewport and preserves hysteresis and horizontal clipping', () => {
      const { player, thresholds } = renderLandscapeCard();
      // The card can expose at most 375/1000 of itself, so the old 0.6 threshold was unreachable.
      expect(thresholds()).toEqual([0.4 * 0.375, 0.6 * 0.375]);
      // A horizontally clipped card still needs enough visible area to earn playback.
      expect(player()).toHaveAttribute('data-active', 'false');
      intersectOnScreen(0.23);
      expect(player()).toHaveAttribute('data-active', 'true');
      intersectOnScreen(0.19);
      expect(player()).toHaveAttribute('data-active', 'true');
      intersectOnScreen(0.4 * 0.375);
      expect(player()).toHaveAttribute('data-active', 'false');
      intersectOnScreen(0.19);
      expect(player()).toHaveAttribute('data-active', 'false');
      intersectOnScreen(0.6 * 0.375);
      expect(player()).toHaveAttribute('data-active', 'true');
      intersectOnScreen(0);
      expect(player()).toHaveAttribute('data-active', 'false');
    });

    it('updates the actual observer thresholds when the card or viewport resizes', () => {
      const { player, thresholds, resizeCard } = renderLandscapeCard();
      resizeCard(500);
      expect(thresholds()).toEqual([0.4 * 0.75, 0.6 * 0.75]);
      intersectOnScreen(0.46);
      expect(player()).toHaveAttribute('data-active', 'true');

      vi.stubGlobal('innerHeight', 600);
      fireEvent(window, new Event('resize'));
      expect(thresholds()).toEqual([0.4, 0.6]);
      intersectOnScreen(0.4);
      expect(player()).toHaveAttribute('data-active', 'false');
      intersectOnScreen(0.6);
      expect(player()).toHaveAttribute('data-active', 'true');
    });

    it('scrolls a tapped card into view and keeps its play request through toolbar resizes', () => {
      const { player } = renderLandscapeCard();
      const scrollIntoView = vi.fn();
      Object.defineProperty(player().closest('article'), 'scrollIntoView', { value: scrollIntoView });
      expect(player()).toHaveAttribute('data-active', 'false');
      fireEvent.click(player());
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      expect(player()).toHaveAttribute('data-active', 'false');
      // The player keeps the tap, but visibility decides when it may start.
      expect(mocks.playerToggle).toHaveBeenCalledOnce();
      vi.stubGlobal('innerHeight', 400);
      fireEvent(window, new Event('resize'));
      intersectOnScreen(0.1);
      expect(player()).toHaveAttribute('data-active', 'false');
      intersectOnScreen(0.25);
      expect(player()).toHaveAttribute('data-active', 'true');
      vi.stubGlobal('innerHeight', 450);
      fireEvent(window, new Event('resize'));
      intersectOnScreen(0.29);
      expect(player()).toHaveAttribute('data-active', 'true');
      expect(mocks.playerToggle).toHaveBeenCalledOnce();
      intersectOnScreen(0);
      expect(player()).toHaveAttribute('data-active', 'false');
    });
  });

  it('stops the previous Explore card when a tapped card scrolls into view', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    const { container } = render(
      <QueryClientProvider client={client}>
        <Provider>
          <DebateFeedAutoplay>
            <DebateExploreFeedCard item={item} fallback={<div />} />
            <DebateExploreFeedCard item={{ ...item, entityId: 'debate-two' }} fallback={<div />} />
          </DebateFeedAutoplay>
        </Provider>
      </QueryClientProvider>
    );
    intersectAll(0.1);
    const [firstCard, secondCard] = container.querySelectorAll('article');
    const [firstPlayer, secondPlayer] = screen.getAllByTestId('player');
    const scrollIntoView = vi.fn();
    Object.defineProperty(secondCard, 'scrollIntoView', { value: scrollIntoView });
    intersectOnScreen(0.7, firstCard);
    intersectOnScreen(0.3, secondCard);
    expect(firstPlayer).toHaveAttribute('data-active', 'true');
    expect(secondPlayer).toHaveAttribute('data-active', 'false');

    fireEvent.click(secondPlayer);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    expect(firstPlayer).toHaveAttribute('data-active', 'true');
    expect(secondPlayer).toHaveAttribute('data-active', 'false');
    expect(mocks.playerToggle).toHaveBeenCalledOnce();

    intersectOnScreen(0.4, firstCard);
    intersectOnScreen(0.6, secondCard);
    expect(firstPlayer).toHaveAttribute('data-active', 'false');
    expect(secondPlayer).toHaveAttribute('data-active', 'true');
  });

  // The lead card used to stream both full recordings on arrival: 76.5 MB of an idle visit's 84 MB.
  it('holds the full recordings until the viewer starts one', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.7);

    expect(screen.getByTestId('player').getAttribute('data-hold-full-playback')).toBe('true');
  });

  describe('releasing media nobody can see', () => {
    function renderOnScreen() {
      mocks.debateQuery = { data: watchableDebate(), isError: false };
      mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
      renderCard();
      intersectAll(0.7);
      return () => screen.getByTestId('player').getAttribute('data-release-media');
    }

    it('detaches the recordings behind an open sheet and reattaches them when it closes', () => {
      const releaseMedia = renderOnScreen();
      expect(releaseMedia()).toBe('false');

      let closeSheet = () => {};
      act(() => {
        closeSheet = lockMobileSheetDocumentOverscroll();
      });
      try {
        expect(releaseMedia()).toBe('true');
      } finally {
        act(() => closeSheet());
      }
      expect(releaseMedia()).toBe('false');
    });

    it('detaches a card inside a sheet once another sheet opens on top of it', () => {
      const profilePanel = Symbol('profile panel');
      const rankingSheet = Symbol('ranking sheet');
      mocks.debateQuery = { data: watchableDebate(), isError: false };
      mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
      render(
        <InsideMobileSheet sheet={profilePanel}>
          <CardHarness props={{}} />
        </InsideMobileSheet>
      );
      intersectAll(0.7);
      const releaseMedia = () => screen.getByTestId('player').getAttribute('data-release-media');

      const closes: (() => void)[] = [];
      try {
        act(() => {
          closes.push(lockMobileSheetDocumentOverscroll(profilePanel));
        });
        expect(releaseMedia()).toBe('false');

        act(() => {
          closes.push(lockMobileSheetDocumentOverscroll(rankingSheet));
        });
        expect(releaseMedia()).toBe('true');

        act(() => closes.pop()?.());
        expect(releaseMedia()).toBe('false');
      } finally {
        act(() => closes.forEach(close => close()));
      }
    });

    it('on a phone, detaches a card scrolled off screen while it waits in the look-ahead band', () => {
      mocks.isMobileLayout = true;
      const releaseMedia = renderOnScreen();
      expect(releaseMedia()).toBe('false');

      intersectOnScreen(0);
      // Still mounted, URLs kept, but no decoder or buffered media.
      expect(releaseMedia()).toBe('true');

      intersectOnScreen(0.2);
      expect(releaseMedia()).toBe('false');
    });

    it('on a phone, keeps the card up next loaded and asks it to buffer, until it is passed', () => {
      mocks.isMobileLayout = true;
      renderOnScreen();
      const player = () => screen.getByTestId('player');

      // Scrolled back so this card sits just below the screen: it is the one coming next.
      intersectOnScreen(0);
      intersectUpNext(900);
      expect(player().getAttribute('data-release-media')).toBe('false');
      expect(player().getAttribute('data-buffer')).toBe('true');

      // Reached: active, so the player's own autoplay takes over from the buffer.
      intersectOnScreen(0.7);
      intersectUpNext(100);
      expect(player().getAttribute('data-active')).toBe('true');
      expect(player().getAttribute('data-buffer')).toBe('false');

      // Scrolled past, out through the top: neither up next nor kept on a phone.
      intersectOnScreen(0);
      intersectUpNext(null);
      expect(player().getAttribute('data-buffer')).toBe('false');
      expect(player().getAttribute('data-release-media')).toBe('true');
    });

    it('keeps an off-screen card loaded on desktop, where the look-ahead keeps the next card instant', () => {
      const releaseMedia = renderOnScreen();

      intersectOnScreen(0);
      expect(releaseMedia()).toBe('false');
    });
  });

  describe('while a mobile sheet is open over the feed', () => {
    function renderPlaying(wrap?: (card: React.ReactElement) => React.ReactElement) {
      mocks.debateQuery = { data: watchableDebate(), isError: false };
      mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
      const card = <CardHarness props={{}} />;
      render(wrap ? wrap(card) : card);
      intersectAll(0.7);
      return () => screen.getByTestId('player').getAttribute('data-active');
    }

    it('pauses the cards behind the sheet and resumes them when it closes', () => {
      const playerActive = renderPlaying();
      expect(playerActive()).toBe('true');

      let closeSheet = () => {};
      act(() => {
        closeSheet = lockMobileSheetDocumentOverscroll();
      });
      try {
        expect(playerActive()).toBe('false');
      } finally {
        act(() => closeSheet());
      }
      expect(playerActive()).toBe('true');
    });

    it('keeps playing a card inside the sheet, like a profile Activity gallery', () => {
      const sheet = Symbol('sheet');
      const playerActive = renderPlaying(card => <InsideMobileSheet sheet={sheet}>{card}</InsideMobileSheet>);

      let closeSheet = () => {};
      act(() => {
        closeSheet = lockMobileSheetDocumentOverscroll(sheet);
      });
      try {
        expect(playerActive()).toBe('true');
      } finally {
        act(() => closeSheet());
      }
    });
  });

  describe('while its debate has ended', () => {
    // A finished debate's end card is drawn inside the media wrapper, but only its replay is an ask
    // to play; the rest of it must reach its own handlers without bringing the card into view.
    const ended = () => {
      mocks.debateQuery = { data: watchableDebate(), isError: false };
      mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
      mocks.withEndCard = true;
      const { container } = renderCard();
      intersectAll(0.3);
      const scrollIntoView = vi.fn();
      Object.defineProperty(container.querySelector('article'), 'scrollIntoView', { value: scrollIntoView });
      return scrollIntoView;
    };

    it("lets the end card's own controls through", () => {
      const scrollIntoView = ended();
      fireEvent.click(screen.getByTestId('end-card-vote'));

      expect(mocks.endCardVote).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('lets a popover portalled out of the card through, though React bubbles its clicks here', () => {
      const scrollIntoView = ended();
      fireEvent.click(screen.getByTestId('end-card-portalled'));

      expect(mocks.portalledClick).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).not.toHaveBeenCalled();
    });

    it('brings the card into view on Replay and lets the press reach the player', () => {
      const scrollIntoView = ended();
      fireEvent.click(screen.getByTestId('end-card-replay'));

      expect(mocks.endCardReplay).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledOnce();
    });
  });

  it('evicts the player outside the media window and remounts it on reverse scroll', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    intersectAll(0.7);
    expect(screen.getByTestId('player')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Claims on the video' })).toBeDefined();

    // A row stays in the infinite feed, but its media/query subtree does not.
    intersectAll(0);
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Claims on the video' })).toBeNull();

    // Re-entering the look-ahead band restores a warm, inactive player before it is visible.
    intersectAll(0.1);
    expect(screen.getByTestId('player').getAttribute('data-active')).toBe('false');
  });

  // GEO-3454. The claim footer is part of the card's height. Dropping it with the media as the card
  // left the window shifted everything below it, and started its reads over on the way back.
  it('keeps the claim footer, and its reads, while the media is evicted', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    const claimId = watchableDebate().claim.claim_entity_id;

    intersectAll(0.7);
    expect(screen.getByTestId('claim-footer')).toHaveAttribute('data-claim', claimId);
    expect(screen.getByTestId('claim-footer')).toHaveAttribute('data-enabled', 'true');

    intersectAll(0);
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.getByTestId('claim-footer')).toHaveAttribute('data-claim', claimId);
    // Off: the footer's own latch keeps what it has already read.
    expect(screen.getByTestId('claim-footer')).toHaveAttribute('data-enabled', 'false');
  });

  // One shared claims panel for the feed — opening Claims on a second card must replace the first,
  // not stack a second identical overlay behind it.
  it('replaces the open claims panel when a second card opens one', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };

    render(
      <QueryClientProvider client={client}>
        <Provider>
          <DebateExploreFeedCard item={item} fallback={<div />} />
          <DebateExploreFeedCard item={{ ...item, entityId: 'debate-two' }} fallback={<div />} />
          <ExploreDebateClaimsPanelHost />
        </Provider>
      </QueryClientProvider>
    );
    intersectAll(0.7);

    // Both cards offer the control, which is the precondition the bug needed.
    const claimsButtons = screen.queryAllByRole('button', { name: 'Claims on the video' });
    expect(claimsButtons).toHaveLength(2);

    fireEvent.click(claimsButtons[0]);
    expect(screen.queryAllByTestId('claims-panel')).toHaveLength(1);

    fireEvent.click(claimsButtons[1]);
    expect(screen.queryAllByTestId('claims-panel')).toHaveLength(1);
  });

  // And closing it leaves the feed with none, rather than uncovering the one it replaced.
  it('leaves no claims panel open after closing the one that replaced another', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };

    render(
      <QueryClientProvider client={client}>
        <Provider>
          <DebateExploreFeedCard item={item} fallback={<div />} />
          <DebateExploreFeedCard item={{ ...item, entityId: 'debate-two' }} fallback={<div />} />
          <ExploreDebateClaimsPanelHost />
        </Provider>
      </QueryClientProvider>
    );
    intersectAll(0.7);

    for (const button of screen.queryAllByRole('button', { name: 'Claims on the video' })) fireEvent.click(button);
    fireEvent.click(screen.getByText('Close'));

    expect(screen.queryAllByTestId('claims-panel')).toHaveLength(0);
  });

  /*
   * A debate card can sit inside the entity side panel (a profile's activity). Claims there must
   * replace the side panel with the claims panel: not stack on it, and not close the side panel and
   * take the card, and the panel it drew, with it.
   */
  it('replaces the entity side panel when a card inside it opens Claims', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };

    function SidePanel() {
      const target = useAtomValue(entitySidePanelAtom);
      return target ? (
        <aside data-testid="entity-side-panel">
          <DebateExploreFeedCard item={item} fallback={<div />} />
        </aside>
      ) : null;
    }
    function OpenSidePanel() {
      const open = useSetAtom(openEntitySidePanelAtom);
      React.useEffect(
        () => open({ entityId: 'person-1', spaceId: 'space-1', openedWithMainViewEditing: false }),
        [open]
      );
      return null;
    }

    render(
      <QueryClientProvider client={client}>
        <Provider>
          <OpenSidePanel />
          <SidePanel />
          <ExploreDebateClaimsPanelHost />
        </Provider>
      </QueryClientProvider>
    );
    intersectAll(0.7);
    const openPanels = () =>
      screen.queryAllByTestId('entity-side-panel').length + screen.queryAllByTestId('claims-panel').length;
    expect(openPanels()).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Claims on the video' }));
    expect(screen.queryAllByTestId('claims-panel')).toHaveLength(1);
    expect(openPanels()).toBe(1);

    fireEvent.click(screen.getByText('Close'));
    expect(openPanels()).toBe(0);
  });

  /**
   * The open flags live on the card now, not in a subtree that unmounts with the player, so the
   * panel they control must not be gated on the media window the way the controls are. Scrolling
   * the feed on past the card an open panel came from used to tear it away mid-read and leave the
   * flag set, so scrolling back reopened it unasked.
   */
  it('keeps an open claims panel when the card leaves the media window', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.7);

    fireEvent.click(screen.getByRole('button', { name: 'Claims on the video' }));
    expect(screen.getByTestId('claims-panel')).toBeDefined();

    // The player and the control that opened it both stand down; what is open stays open.
    intersectAll(0);
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Claims on the video' })).toBeNull();
    expect(screen.getByTestId('claims-panel')).toBeDefined();

    // And its own close control is still the way out, rather than a scroll back and forth.
    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('claims-panel')).toBeNull();

    // Which is to say it does not come back on its own.
    intersectAll(0.7);
    expect(screen.queryByTestId('claims-panel')).toBeNull();
  });

  /**
   * GEO-2895. Activation used to be a single `>= 0.6`, so a card resting near that ratio
   * toggled on every small scroll delta, and each toggle started or interrupted a playback
   * attempt — Preston's "videos will look frozen / stop auto playing" after scrolling around.
   * Between the two edges the card must hold whatever it already was, in both directions.
   */
  it('holds its state between the activation edges rather than toggling', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    const isActive = () => screen.getByTestId('player').getAttribute('data-active');

    // Scrolling in: the band alone must not start playback — only reaching 0.6 does.
    intersectAll(0.5);
    expect(isActive()).toBe('false');
    intersectAll(0.55);
    expect(isActive()).toBe('false');
    intersectAll(0.6);
    expect(isActive()).toBe('true');

    // Scrolling out: jitter inside the band must not stop it. Under the old single-ratio rule
    // every one of these reported below 0.6 and so deactivated.
    intersectAll(0.55);
    expect(isActive()).toBe('true');
    intersectAll(0.45);
    expect(isActive()).toBe('true');
    intersectAll(0.59);
    expect(isActive()).toBe('true');

    // And it does still give way once the card has genuinely left.
    intersectAll(0.4);
    expect(isActive()).toBe('false');
  });

  it('shows Share once the debate is ready, and opens the claims panel from the video', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.1);

    expect(screen.getByRole('button', { name: 'Share claim' })).toBeDefined();

    expect(screen.queryByTestId('claims-panel')).toBeNull();
    Object.defineProperty(screen.getByTestId('player').closest('article'), 'scrollIntoView', { value: vi.fn() });
    fireEvent.click(screen.getByRole('button', { name: 'Claims on the video' }));
    expect(screen.getByTestId('claims-panel')).toBeDefined();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('claims-panel')).toBeNull();
  });

  it("renders the same interaction bar the full-screen feed does, with the card's own counts", () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.1);

    // Comments and share sit at the end of the claim's Agree/Disagree row, which replaced the
    // debate's up/down vote and its claims count (GEO-3454).
    const footer = screen.getByTestId('claim-footer');
    const comments = screen.getByRole('button', { name: /^Open comments/ });
    expect(footer).toContainElement(comments);
    expect(footer).toContainElement(screen.getByRole('button', { name: 'Share claim' }));
    expect(screen.queryByRole('button', { name: /^Claims \(/ })).toBeNull();

    // The count comes from what the card already has: the feed's comment count, rather than a
    // thread fetch per card.
    expect(comments).toHaveAccessibleName('Open comments, 3 comments');
    expect(comments.textContent).toBe('');
    expect(comments).toHaveAttribute('data-geo-analytics-label', 'Debate comments');

    // Marked as an opener so pressing it while the global comments panel is open switches the
    // panel to this debate instead of reading as an outside click that dismisses it.
    expect(comments.hasAttribute('data-entity-comments-opener')).toBe(true);

    fireEvent.click(comments);
    expect(screen.getByTestId('comments-panel-target')).toHaveTextContent(
      `${item.entityId} in ${item.spaceId} (debate)`
    );
  });

  // GEO-3454: the video and the claim are one framed card, and Agree/Disagree act on the claim
  // being debated, read once the debate is resolved and in the media window.
  it('frames the video and the claim as one card, voting on the debate claim', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.1);

    const player = screen.getByTestId('player');
    expect(player).toHaveAttribute('data-framed', 'true');
    const card = screen.getByTestId('claim-footer').parentElement;
    expect(card).toHaveClass('rounded-[26px]', 'border', 'border-[#e5e5e5]', 'p-4');
    expect(card).toContainElement(player);
    // The media is inset in the app's card at the app's 20px radius.
    expect(player.closest('[data-debate-card-media]')).toHaveClass('rounded-[20px]', 'overflow-hidden');
    expect(screen.getByTestId('claim-footer')).toHaveAttribute('data-claim', watchableDebate().claim.claim_entity_id);
    expect(screen.getByTestId('claim-footer')).toHaveAttribute('data-enabled', 'true');
    // The card's shape says what it is; the fallback card keeps its type tag.
    expect(screen.queryByText('Debate')).toBeNull();
  });

  it('keeps the claim row and comments while the debate is still loading', () => {
    renderCard();
    expect(screen.getByTestId('claim-footer')).toHaveAttribute('data-claim', 'none');
    expect(screen.getByRole('button', { name: /^Open comments/ })).toBeDefined();
  });

  /**
   * GEO-2879 headed the card with the claim, which left nothing on the card pointing at the debate
   * itself — the open question in that ticket's notes. This control is the answer, and it has to
   * stay a real link: the Debate entity's page *is* the full-screen feed anchored to that debate.
   */
  // GEO-3833: the debates app's card — capped at 480px, with the media narrowing to keep the vote
  // row on screen while the claim and the votes keep the card's width.
  describe('app surface and height fit', () => {
    const surface = (container: HTMLElement) => container.querySelector('[data-debate-card-surface]') as HTMLElement;
    const media = (container: HTMLElement) => container.querySelector('[data-debate-card-media]') as HTMLElement;

    it('caps the card at 480px and fits the media to the viewport height', () => {
      const { container } = renderCard();

      expect(surface(container)).toHaveAttribute('data-debate-card-surface', 'app');
      expect(surface(container)).toHaveClass(
        'max-w-[480px]',
        '[--debate-card-chrome:240px]',
        'md:[--debate-card-chrome:212px]'
      );
      expect(surface(container).style.getPropertyValue('--debate-card-media-width')).toBe(
        'clamp(280px, calc((100svh - 76px - var(--debate-card-chrome)) * 480 / 578), 100%)'
      );
      expect(media(container)).toHaveClass('mx-auto', 'w-[var(--debate-card-media-width)]', 'max-w-full');
      // The claim and the votes are outside the media frame, so they keep the card's full width.
      expect(media(container)).not.toContainElement(screen.getByTestId('claim-footer'));
    });

    it('spans the column under fullWidth, with the media still height-fit', () => {
      const { container } = renderCard({ fullWidth: true });

      expect(surface(container)).toHaveClass('max-w-full');
      expect(surface(container)).not.toHaveClass('max-w-[480px]');
      expect(surface(container).style.getPropertyValue('--debate-card-media-width')).toContain('100svh');
      expect(media(container)).toHaveClass('w-[var(--debate-card-media-width)]');
    });

    it('drops the dividers between cards for the app’s gap', () => {
      const { container } = renderCard();

      expect(container.querySelector('article')).toHaveClass('py-2');
      expect(container.querySelector('article')).not.toHaveClass('border-b');
    });

    it('paints the stills with the Agree speaker on top once the debate says which slot that is', () => {
      const posters = { slot1: 'https://chat.test/still-1', slot2: 'https://chat.test/still-2' };
      mocks.debateQuery = {
        data: {
          ...watchableDebate(),
          participants: [
            { participant_slot: 1, position_label: 'Disagree' },
            { participant_slot: 2, position_label: 'Agree' },
          ] as unknown as Debate['participants'],
        },
        isError: false,
      };
      const { container } = renderCard({ item: { ...item, debatePosters: posters } });

      expect(container.querySelector('[data-debate-poster-slot="2"]')).toHaveClass('order-1');
      expect(container.querySelector('[data-debate-poster-slot="1"]')).toHaveClass('order-2');
    });

    it('keeps slot 1 on top while the debate is unresolved', () => {
      const posters = { slot1: 'https://chat.test/still-1', slot2: 'https://chat.test/still-2' };
      const { container } = renderCard({ item: { ...item, debatePosters: posters } });

      expect(container.querySelector('[data-debate-poster-slot="1"]')).not.toHaveClass('order-2');
      expect(container.querySelector('[data-debate-poster-slot="2"]')).not.toHaveClass('order-1');
    });
  });

  describe('full-screen control', () => {
    it('links to the Debate entity, which is the anchored full-screen feed', () => {
      renderCard();

      const expand = screen.getByRole('link', { name: 'Watch this debate full screen' });
      expect(expand).toHaveAttribute('data-entity-side-panel-full-page');
      expect(expand.getAttribute('href')).toBe('/space/space-1/fd51f9352063461780397b672b23364c');
    });

    it('is offered before the debate resolves, and is not the claim heading', () => {
      renderCard();

      // Present from the first paint: the route resolves the debate itself, so it needs none of
      // the geo-chat lookups the rest of the card is waiting on.
      expect(screen.getByRole('link', { name: 'Watch this debate full screen' })).toBeDefined();
      // And it is a second, separate target — the heading still goes to the claim.
      expect(screen.getByRole('link', { name: CLAIM_NAME }).getAttribute('href')).not.toBe(
        '/space/space-1/fd51f9352063461780397b672b23364c'
      );
    });
  });

  /**
   * The app's comments panel is an in-flow panel with no dialog role and no focus trap, so the
   * control that opens it says how it stands without sending a reader looking for a dialog.
   * `EntityCommentsButton`, which this replaced on explore cards, announced exactly this much.
   */
  it('reports the comments panel as expanded without claiming it is a dialog', () => {
    renderCard();

    const comments = screen.getByRole('button', { name: /^Open comments/ });
    expect(comments.getAttribute('aria-expanded')).toBe('false');
    expect(comments.hasAttribute('aria-haspopup')).toBe(false);
  });

  /** Share really does open a dialog, and still says so. */
  it('keeps the dialog announcement on Share, which opens one', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.1);

    expect(screen.getByRole('button', { name: 'Share claim' }).getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('holds Share disabled while the debate is still loading', () => {
    renderCard();
    expect(screen.getByRole('button', { name: 'Share claim' })).toBeDisabled();
  });

  it('shows the Join-space chip to non-members and honors hideJoinButton', () => {
    const nonMemberItem = { ...item, isMemberOrEditor: false };

    const { unmount } = renderCard({ item: nonMemberItem });
    expect(screen.getByTestId('join-button')).toBeDefined();
    unmount();

    renderCard({ item: nonMemberItem, hideJoinButton: true });
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('does not show the Join-space chip to members', () => {
    renderCard();
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  /**
   * The heading itself — claim vs. debate name, and what a click on it does — is
   * `ExploreCardTitle`'s, and is covered against every surface in its own suite. What belongs here
   * is that this card is wired to it, and that the wiring survives the one thing this card does
   * that no other does: paint before its geo-chat lookups have resolved.
   */
  describe('claim heading', () => {
    it('heads the card with the claim rather than the debate entity name', () => {
      renderCard();

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(CLAIM_NAME);
      expect(screen.queryByText(item.title)).toBeNull();
      expect(screen.getByRole('link', { name: CLAIM_NAME })).toHaveAttribute(
        'href',
        NavUtils.toEntity('space-1', 'claim-entity-1')
      );
    });

    // The claim comes off the entity's own Claims relation, not out of geo-chat, so it is there on
    // first paint — while this card is still showing video skeletons and, further down the feed,
    // has not requested anything at all.
    it('heads the card before any geo-chat request has resolved', () => {
      renderCard();

      expect(mocks.debateQuery.data).toBeUndefined();
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(CLAIM_NAME);
    });

    it('opens the claim in the side panel on a surface that has opted in', () => {
      renderCard({ titleOpensSidePanel: true });

      const event = clickTitle();

      expect(screen.getByTestId('panel')).toHaveTextContent('claim-entity-1 in space-1');
      expect(event.defaultPrevented).toBe(true);
    });

    it('falls back to the debate entity name when the relation is missing', () => {
      renderCard({ item: { ...item, debateClaim: null } });

      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(item.title);
    });
  });
});

describe('DebateExploreFeedCard outside a feed (GEO-3812)', () => {
  // jsdom has no scrolling; a tap on a card short of the active range asks for one.
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  });
  afterEach(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  });

  const ready = () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
  };
  const player = () => screen.getByTestId('player');
  const tapPlay = () => fireEvent.click(screen.getByTestId('player-play'));

  it('does not play in full view until it is tapped, and then plays', () => {
    ready();
    renderCard({}, false);
    intersectAll(1);

    expect(player()).toHaveAttribute('data-tap-to-play', 'true');
    expect(player()).toHaveAttribute('data-active', 'false');

    tapPlay();
    expect(player()).toHaveAttribute('data-active', 'true');
  });

  it('keeps its media only while on screen, and never buffers ahead', () => {
    ready();
    renderCard({}, false);
    intersectAll(0.7);
    intersectUpNext(900);
    expect(player()).toHaveAttribute('data-release-media', 'false');
    expect(player()).toHaveAttribute('data-buffer', 'false');

    // Desktop too: nothing here plays next by itself, so an off-screen card holds nothing.
    intersectOnScreen(0);
    expect(player()).toHaveAttribute('data-release-media', 'true');
  });

  it('lets a feed card take a click on its media as before, without anything to tap', () => {
    ready();
    renderCard();
    intersectAll(0.7);

    expect(player()).toHaveAttribute('data-tap-to-play', 'false');
    expect(screen.queryByTestId('player-play')).toBeNull();
    expect(player()).toHaveAttribute('data-active', 'true');
  });

  it('plays a card tapped while partly in view at once, and brings it into view', () => {
    ready();
    const { container } = renderCard({}, false);
    intersectAll(0.3);
    const scrollIntoView = vi.fn();
    Object.defineProperty(container.querySelector('article'), 'scrollIntoView', { value: scrollIntoView });

    tapPlay();

    expect(player()).toHaveAttribute('data-active', 'true');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });

  it('lets the tap go when the card scrolls away, so it does not resume on the way back', () => {
    ready();
    renderCard({}, false);
    intersectAll(0.7);
    tapPlay();
    expect(player()).toHaveAttribute('data-active', 'true');

    intersectOnScreen(0);
    expect(player()).toHaveAttribute('data-active', 'false');

    intersectOnScreen(0.7);
    expect(player()).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('player-play')).toBeInTheDocument();
  });

  it('lets the tap go when the card drops out of the range it played in', () => {
    ready();
    renderCard({}, false);
    intersectAll(0.7);
    tapPlay();

    intersectOnScreen(0.4);
    expect(player()).toHaveAttribute('data-active', 'false');
    intersectOnScreen(0.7);
    expect(player()).toHaveAttribute('data-active', 'false');
  });

  it('lets a tap go that the card scrolled away from before it ever reached view', () => {
    ready();
    renderCard({}, false);
    intersectAll(0.3);
    tapPlay();

    intersectOnScreen(0);
    intersectOnScreen(0.7);

    expect(player()).toHaveAttribute('data-active', 'false');
  });

  it('lets the tap go behind a sheet, and does not resume when it closes', () => {
    ready();
    renderCard({}, false);
    intersectAll(0.7);
    tapPlay();

    let closeSheet = () => {};
    act(() => {
      closeSheet = lockMobileSheetDocumentOverscroll();
    });
    try {
      expect(player()).toHaveAttribute('data-active', 'false');
    } finally {
      act(() => closeSheet());
    }
    expect(player()).toHaveAttribute('data-active', 'false');
  });

  function renderTwo(second: { feed: boolean; entityId: string }) {
    const store = createStore();
    const secondCard = <DebateExploreFeedCard item={{ ...item, entityId: second.entityId }} fallback={<div />} />;
    const view = render(
      <QueryClientProvider client={client}>
        <Provider store={store}>
          <DebateExploreFeedCard item={item} fallback={<div />} />
          {second.feed ? <DebateFeedAutoplay>{secondCard}</DebateFeedAutoplay> : secondCard}
        </Provider>
      </QueryClientProvider>
    );
    intersectAll(0.7);
    return { store, ...view };
  }

  it('stops the first tapped card when a second is tapped', () => {
    ready();
    renderTwo({ feed: false, entityId: 'debate-two' });
    const [first, second] = screen.getAllByTestId('player-play');

    fireEvent.click(first);
    const [firstPlayer, secondPlayer] = screen.getAllByTestId('player');
    expect(firstPlayer).toHaveAttribute('data-active', 'true');

    fireEvent.click(second);
    expect(firstPlayer).toHaveAttribute('data-active', 'false');
    expect(secondPlayer).toHaveAttribute('data-active', 'true');
  });

  it('plays the same debate only on the card it was tapped on', () => {
    ready();
    // The same debate on two surfaces at once, as on a profile's Debates tab and its Activity.
    renderTwo({ feed: false, entityId: item.entityId });
    fireEvent.click(screen.getAllByTestId('player-play')[1]);

    const [firstPlayer, secondPlayer] = screen.getAllByTestId('player');
    expect(firstPlayer).toHaveAttribute('data-active', 'false');
    expect(secondPlayer).toHaveAttribute('data-active', 'true');
  });

  it('pauses a feed card while a debate tapped outside the feed plays, and gives it back after', () => {
    ready();
    const { container } = renderTwo({ feed: true, entityId: 'debate-two' });
    const [tapCard] = container.querySelectorAll('article');
    const [tapPlayer, feedPlayer] = screen.getAllByTestId('player');
    expect(feedPlayer).toHaveAttribute('data-active', 'true');

    fireEvent.click(screen.getByTestId('player-play'));
    expect(tapPlayer).toHaveAttribute('data-active', 'true');
    expect(feedPlayer).toHaveAttribute('data-active', 'false');

    intersectOnScreen(0, tapCard);
    expect(feedPlayer).toHaveAttribute('data-active', 'true');
  });

  it('lets a click on a yielding feed card take playback back from the tapped one', () => {
    ready();
    renderTwo({ feed: true, entityId: 'debate-two' });
    const [tapPlayer, feedPlayer] = screen.getAllByTestId('player');
    fireEvent.click(screen.getByTestId('player-play'));
    expect(feedPlayer).toHaveAttribute('data-active', 'false');

    fireEvent.click(feedPlayer);
    expect(feedPlayer).toHaveAttribute('data-active', 'true');
    expect(tapPlayer).toHaveAttribute('data-active', 'false');
  });

  it('gives the tap up on unmount, so the card remounted on the way back does not play', () => {
    ready();
    const store = createStore();
    const tree = (shown: boolean) => (
      <QueryClientProvider client={client}>
        <Provider store={store}>{shown ? <DebateExploreFeedCard item={item} fallback={<div />} /> : null}</Provider>
      </QueryClientProvider>
    );
    const view = render(tree(true));
    intersectAll(0.7);
    tapPlay();
    expect(store.get(tappedDebateAtom)).not.toBeNull();

    view.rerender(tree(false));
    expect(store.get(tappedDebateAtom)).toBeNull();

    view.rerender(tree(true));
    intersectAll(0.7);
    expect(player()).toHaveAttribute('data-active', 'false');
  });

  it('plays a compact gallery card from its tap too', () => {
    ready();
    renderCard({ compactChrome: true }, false);
    intersectAll(1);
    expect(player()).toHaveAttribute('data-active', 'false');

    tapPlay();
    expect(player()).toHaveAttribute('data-active', 'true');
  });

  it('leaves clicks on its media to the player, which alone says what asks to play', () => {
    ready();
    const { container } = renderCard({}, false);
    intersectAll(0.3);
    const scrollIntoView = vi.fn();
    Object.defineProperty(container.querySelector('article'), 'scrollIntoView', { value: scrollIntoView });

    fireEvent.click(player());

    expect(mocks.playerToggle).toHaveBeenCalledOnce();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(player()).toHaveAttribute('data-active', 'false');
  });
});
