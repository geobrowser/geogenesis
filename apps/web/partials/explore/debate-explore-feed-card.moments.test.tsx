import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import { DebateFeedAutoplay } from '~/core/debates/debate-playback-gate';
import type { DebateMomentsState } from '~/core/debates/moments-player/use-debate-moments';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';

import { DebateExploreFeedCard } from './debate-explore-feed-card';

/**
 * The card's video (GEO-3833): the moments read decides whether there is a reel, a reel starts on
 * Moments, and the Moments / Full debate button switches between the reel and the two-tile player.
 * The players themselves are stood in for; each has its own suite.
 */

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
vi.mock('~/core/state/feature-flags', () => ({}));
vi.mock('next/navigation', () => ({ usePathname: () => '/root/explore' }));

const mocks = vi.hoisted(() => ({
  inlineUnavailable: false,
  moments: { status: 'loading', moments: [], slotNames: {} } as DebateMomentsState,
  momentsEnabled: [] as boolean[],
  isMobileLayout: false,
}));

vi.mock('~/core/debates/browse/inline-playback', async importOriginal => ({
  ...(await importOriginal<typeof import('~/core/debates/browse/inline-playback')>()),
  useInlinePlaybackUnavailable: () => mocks.inlineUnavailable,
}));
vi.mock('~/core/debates/moments-player/use-debate-moments', () => ({
  useDebateMoments: (_id: string, { enabled }: { enabled?: boolean } = {}) => {
    mocks.momentsEnabled.push(Boolean(enabled));
    return enabled ? mocks.moments : { status: 'loading', moments: [], slotNames: {} };
  },
}));
vi.mock('~/core/hooks/use-is-mobile-layout', () => ({ useIsMobileLayout: () => mocks.isMobileLayout }));
vi.mock('~/core/debates/hooks', () => ({
  useDebate: () => ({ data: DEBATE, isError: false }),
  useDebateMedia: () => ({ data: { artifacts: [{ kind: 'final_video' }], turn_segments: [] }, isError: false }),
}));
vi.mock('~/core/debates/browse/debate-claim-footer', () => ({
  DebateClaimFooter: ({ meta }: { meta: React.ReactNode }) => <div data-testid="claim-footer">{meta}</div>,
}));
vi.mock('~/core/debates/browse/debate-feed-player', () => ({
  DebateFeedPlayer: (props: {
    topRight?: React.ReactNode;
    holdFullPlayback?: boolean;
    initialSeekSeconds?: number | null;
    active: boolean;
  }) => (
    <div
      data-testid="player"
      data-hold={String(props.holdFullPlayback)}
      data-seek={String(props.initialSeekSeconds ?? null)}
      data-active={String(props.active)}
    >
      {props.topRight}
    </div>
  ),
}));
vi.mock('~/core/debates/moments-player/moments-card-player', () => ({
  MomentsCardPlayer: (props: {
    moments: unknown[];
    active: boolean;
    mountMedia: boolean;
    upNext: boolean;
    tapToPlay: boolean;
    topSlot: number;
    onShowFullDebate: (seconds: number | null) => void;
  }) => (
    <div
      data-testid="reel"
      data-count={props.moments.length}
      data-active={String(props.active)}
      data-mount-media={String(props.mountMedia)}
      data-up-next={String(props.upNext)}
      data-tap-to-play={String(props.tapToPlay)}
      data-top-slot={props.topSlot}
    >
      {/* The real reel draws the button; this stands in for its "Full debate" half. */}
      <button type="button" onClick={() => props.onShowFullDebate(22)}>
        Full debate
      </button>
    </div>
  ),
}));
vi.mock('~/core/debates/browse/use-debate-share-action', () => ({
  useDebateShareAction: () => ({ open: false, onOpen: vi.fn(), onOpenChange: vi.fn() }),
}));
vi.mock('~/core/debates/browse/share-dialog', () => ({ DebateShareDialog: () => null }));
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
vi.mock('~/design-system/fallback-image', () => ({ FallbackImage: () => null }));
vi.mock('~/partials/entity-page/entity-row-actions', () => ({
  EntityRowActions: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./explore-join-space-button', () => ({ ExploreJoinSpaceButton: () => null }));

const DEBATE = {
  id: 'fd51f935-2063-4617-8039-7b672b23364c',
  status: 'complete',
  claim: {
    id: 'c',
    space_id: '52c7ae149838b6d47ce0f3b2a5974546',
    claim_entity_id: 'claim-1',
    claim: 'X',
    description: null,
  },
  recordings: [{ participant_slot: 1 }, { participant_slot: 2 }],
  participants: [
    { participant_slot: 1, position_label: 'Disagree' },
    { participant_slot: 2, position_label: 'Agree' },
  ],
} as unknown as Debate;

const item: ExploreFeedItem = {
  entityId: 'fd51f9352063461780397b672b23364c',
  spaceId: 'space-1',
  spaceName: 'Fashion',
  spaceImage: null,
  types: [{ id: 'fd51f93520634617be397b672b23364c', name: 'Debate' }],
  createdAtSec: 0,
  title: 'Ada vs. Blaise',
  description: null,
  imageUrl: null,
  commentCount: 0,
  recordingUrls: [],
  debateVideoUrls: [],
  debateClaim: { entityId: 'claim-1', name: 'X' },
  isMemberOrEditor: true,
  hasPendingMembershipRequest: false,
  debatePosters: { slot1: 'https://still/1', slot2: 'https://still/2' },
};

const READY: DebateMomentsState = {
  status: 'ready',
  moments: [{ id: 'clip-0' }, { id: 'clip-1' }] as unknown as DebateMomentsState['moments'],
  slotNames: {},
};

type Record = { callback: IntersectionObserverCallback; elements: Set<Element>; options?: IntersectionObserverInit };
let observers: Record[] = [];

beforeEach(() => {
  mocks.inlineUnavailable = false;
  mocks.moments = { status: 'loading', moments: [], slotNames: {} };
  mocks.momentsEnabled = [];
  mocks.isMobileLayout = false;
  observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private record: Record;
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.record = { callback, elements: new Set(), options };
        observers.push(this.record);
      }
      observe(element: Element) {
        this.record.elements.add(element);
      }
      unobserve() {}
      disconnect() {
        this.record.elements.clear();
      }
      takeRecords() {
        return [];
      }
    }
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function intersect(ratio: number, top = 0, filter: (record: Record) => boolean = () => true) {
  act(() => {
    for (const record of observers.filter(filter)) {
      for (const element of record.elements) {
        record.callback(
          [
            {
              target: element,
              isIntersecting: ratio > 0,
              intersectionRatio: ratio,
              boundingClientRect: { top },
              rootBounds: { height: 800 },
            } as unknown as IntersectionObserverEntry,
          ],
          {} as IntersectionObserver
        );
      }
    }
  });
}

function renderCard(feed = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const card = <DebateExploreFeedCard item={item} fallback={<div data-testid="fallback" />} />;
  const tree = (
    <QueryClientProvider client={client}>
      <Provider>{feed ? <DebateFeedAutoplay>{card}</DebateFeedAutoplay> : card}</Provider>
    </QueryClientProvider>
  );
  const result = render(tree);
  return { ...result, update: () => result.rerender(tree) };
}

describe('DebateExploreFeedCard moments reel gate', () => {
  it('reads the moments once the card nears the viewport, with no switch in front of it', () => {
    mocks.moments = READY;
    renderCard();
    expect(mocks.momentsEnabled.every(enabled => !enabled)).toBe(true);
    intersect(0.7);
    expect(mocks.momentsEnabled).toContain(true);
    expect(screen.getByTestId('reel')).toBeInTheDocument();
  });

  it('while the moments load, shows the stills and mounts nothing that loads the recordings', () => {
    const { container } = renderCard();
    intersect(0.7);
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByTestId('reel')).toBeNull();
    expect(container.querySelectorAll('img[data-debate-poster]')).toHaveLength(2);
    expect(mocks.momentsEnabled).toContain(true);
  });

  it('starts a debate with moments on the reel, keeping the meta row’s full-screen link', () => {
    mocks.moments = READY;
    renderCard();
    intersect(0.7);
    const reel = screen.getByTestId('reel');
    expect(reel).toHaveAttribute('data-count', '2');
    expect(reel).toHaveAttribute('data-active', 'true');
    expect(reel).toHaveAttribute('data-mount-media', 'true');
    expect(reel).toHaveAttribute('data-top-slot', '2');
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.getByRole('link', { name: 'Watch this debate full screen' })).toBeInTheDocument();
  });

  it('switches to the full debate at the moment on screen and back, one player at a time', () => {
    mocks.moments = READY;
    renderCard();
    intersect(0.7);
    fireEvent.click(screen.getByRole('button', { name: 'Full debate' }));
    // The reel is gone (its elements with it); the two-tile player starts where the moment was,
    // without the feeds' hold, since the viewer asked for it.
    expect(screen.queryByTestId('reel')).toBeNull();
    const player = screen.getByTestId('player');
    expect(player).toHaveAttribute('data-seek', '22');
    expect(player).toHaveAttribute('data-hold', 'false');
    expect(player).toHaveAttribute('data-active', 'true');
    expect(screen.getByRole('button', { name: 'Full debate' })).toHaveAttribute('aria-pressed', 'true');
    const moments = screen.getByRole('button', { name: 'Moments' });
    expect(moments).toHaveAttribute('aria-pressed', 'false');
    expect(moments).toHaveAttribute('data-geo-analytics-label', 'Moments');
    fireEvent.click(moments);
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.getByTestId('reel')).toBeInTheDocument();
  });

  it('starts on the moments again each time the card comes back', () => {
    mocks.moments = READY;
    renderCard();
    intersect(0.7);
    fireEvent.click(screen.getByRole('button', { name: 'Full debate' }));
    expect(screen.getByTestId('player')).toBeInTheDocument();
    intersect(0);
    intersect(0.7);
    expect(screen.getByTestId('reel')).toBeInTheDocument();
    expect(screen.queryByTestId('player')).toBeNull();
  });

  it('makes a tap-to-play card the one playing when the button is pressed', () => {
    mocks.moments = READY;
    renderCard(false);
    intersect(0.7);
    expect(screen.getByTestId('reel')).toHaveAttribute('data-active', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Full debate' }));
    expect(screen.getByTestId('player')).toHaveAttribute('data-active', 'true');
  });

  it('keeps the two-tile player, with no button, for a debate with no reel', () => {
    mocks.moments = { status: 'ready', moments: [], slotNames: {} };
    renderCard();
    intersect(0.7);
    expect(screen.getByTestId('player')).toBeInTheDocument();
    expect(screen.getByTestId('player')).toHaveAttribute('data-hold', 'true');
    expect(screen.queryByTestId('reel')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Moments' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Full debate' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Watch this debate full screen' })).toBeInTheDocument();
  });

  it('keeps the two-tile player when the moments read failed', () => {
    mocks.moments = { status: 'error', moments: [], slotNames: {} };
    renderCard();
    intersect(0.7);
    expect(screen.getByTestId('player')).toBeInTheDocument();
  });

  it('keeps the reel when its own Retry fails to re-read the moments, so it can say so', () => {
    mocks.moments = READY;
    const { update } = renderCard();
    intersect(0.7);
    expect(screen.getByTestId('reel')).toBeInTheDocument();
    // A failed refetch puts the read in `error` though it was ready.
    mocks.moments = { status: 'error', moments: [], slotNames: {} };
    update();
    expect(screen.getByTestId('reel')).toHaveAttribute('data-count', '2');
    expect(screen.queryByTestId('player')).toBeNull();
  });

  it('hands an in-app browser that cannot play inline (TikTok) to the two-tile player', () => {
    mocks.inlineUnavailable = true;
    mocks.moments = READY;
    renderCard();
    intersect(0.7);
    expect(screen.getByTestId('player')).toBeInTheDocument();
    expect(screen.queryByTestId('reel')).toBeNull();
  });

  it('holds clip elements only on screen or up next in a feed', () => {
    mocks.moments = READY;
    renderCard();
    // In the near-viewport window but not on screen, and not up next: stills only.
    intersect(
      0.7,
      0,
      record => record.options?.rootMargin !== undefined && record.options.rootMargin !== '0px 0px 100% 0px'
    );
    expect(screen.getByTestId('reel')).toHaveAttribute('data-mount-media', 'false');
    // Up next: the first clip loads ahead.
    intersect(0.5, 600, record => record.options?.rootMargin === '0px 0px 100% 0px');
    expect(screen.getByTestId('reel')).toHaveAttribute('data-mount-media', 'true');
    expect(screen.getByTestId('reel')).toHaveAttribute('data-up-next', 'true');
  });

  it('mounts a tap-to-play card’s reel paused while it is on screen', () => {
    mocks.moments = READY;
    renderCard(false);
    intersect(0.7);
    const reel = screen.getByTestId('reel');
    expect(reel).toHaveAttribute('data-tap-to-play', 'true');
    expect(reel).toHaveAttribute('data-active', 'false');
    expect(reel).toHaveAttribute('data-mount-media', 'true');
    intersect(0);
    expect(screen.queryByTestId('reel')?.getAttribute('data-mount-media') ?? 'false').toBe('false');
  });
});
