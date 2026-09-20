import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, useAtomValue } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';
import { NavUtils } from '~/core/utils/utils';

import { DebateExploreFeedCard } from './debate-explore-feed-card';
import { entitySidePanelAtom } from '~/atoms';

// Reached through the claims panel, which now carries the shared response controls. The module's
// top-level `atomWithStorage` runs on import, and under Node's own webstorage — which shadows
// jsdom's with an object that has no getItem — that import takes the suite down before a test runs.
vi.mock('~/core/state/pending-personal-space', () => ({
  usePendingPersonalSpace: () => ({ isPending: false, pending: null }),
  pendingPersonalSpaceId: (topicId: string) => `pending:${topicId}`,
  isPendingPersonalSpaceId: () => false,
  PENDING_PERSONAL_SPACE_PREFIX: 'pending:',
}));

const mocks = vi.hoisted(() => ({
  debateQuery: { data: undefined as Debate | undefined, isError: false },
  mediaQuery: { data: undefined as { artifacts: { kind: string }[] } | undefined, isError: false },
}));

type ObserverRecord = {
  callback: IntersectionObserverCallback;
  elements: Set<Element>;
  instance: IntersectionObserver;
};

let observers: ObserverRecord[] = [];

vi.mock('~/core/state/feature-flags', () => ({}));

vi.mock('~/core/debates/hooks', () => ({
  useDebate: () => mocks.debateQuery,
  useDebateMedia: () => mocks.mediaQuery,
}));

vi.mock('~/core/debates/use-debate-votes', () => ({
  useDebateVotes: () => ({
    sharePercentFor: () => null,
    isMyPick: () => false,
    hasVoted: false,
    isVoting: false,
    castVote: vi.fn(),
  }),
}));

vi.mock('~/core/debates/browse/debate-feed-player', () => ({
  DebateFeedPlayer: ({ debate, active }: { debate: Debate; active: boolean }) => (
    <div data-testid="player" data-debate={debate.id} data-active={active} />
  ),
}));

vi.mock('~/core/debates/browse/use-debate-share-action', () => ({
  useDebateShareAction: () => ({ open: false, onOpen: vi.fn(), onOpenChange: vi.fn() }),
}));

vi.mock('~/core/debates/browse/share-dialog', () => ({
  DebateShareDialog: () => null,
}));

vi.mock('~/core/debates/use-debate-transcript-claims', () => ({
  useDebateTranscriptClaims: () => ({
    claims: { byAuthorSpaceId: new Map(), unattributed: [], totalCount: 3 },
    isLoading: false,
    error: null,
  }),
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
  vi.unstubAllGlobals();
});

function intersectAll(ratio: number) {
  act(() => {
    for (const record of observers) {
      for (const element of record.elements) {
        record.callback(
          [{ target: element, isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry],
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

// The card is rendered inside the app's query provider — its comment count reads the comments cache —
// so the harness has to provide one too, or the double is laxer than the real tree.
let client: QueryClient;

function renderCard(props: Partial<React.ComponentProps<typeof DebateExploreFeedCard>> = {}) {
  return render(
    <QueryClientProvider client={client}>
      <Provider>
        <DebateExploreFeedCard item={item} fallback={<div data-testid="fallback" />} {...props} />
        <PanelProbe />
      </Provider>
    </QueryClientProvider>
  );
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
    expect(screen.getByText('View all')).toBeDefined();
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByTestId('fallback')).toBeNull();
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

  it('evicts the player outside the media window and remounts it on reverse scroll', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    intersectAll(0.7);
    expect(screen.getByTestId('player')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Claims' })).toBeDefined();

    // A row stays in the infinite feed, but its media/query subtree does not.
    intersectAll(0);
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Claims' })).toBeNull();

    // Re-entering the look-ahead band restores a warm, inactive player before it is visible.
    intersectAll(0.1);
    expect(screen.getByTestId('player').getAttribute('data-active')).toBe('false');
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

  it('shows Claims and Share actions once the debate is ready, opening the claims panel on demand', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.1);

    expect(screen.getByRole('button', { name: 'Share debate' })).toBeDefined();

    expect(screen.queryByTestId('claims-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Claims' }));
    expect(screen.getByTestId('claims-panel')).toBeDefined();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('claims-panel')).toBeNull();
  });

  it('hides Claims and Share while the debate is still loading', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Claims' })).toBeNull();
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull();
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
