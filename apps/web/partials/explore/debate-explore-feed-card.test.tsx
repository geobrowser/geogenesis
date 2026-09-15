import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import type { ExploreFeedItem } from '~/core/explore/fetch-explore-feed';

import { DebateExploreFeedCard } from './debate-explore-feed-card';

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
  hubOpen: vi.fn(),
  hubClose: vi.fn(),
  /** Whether the debates hub is already showing. */
  hubIsOpen: false,
  openPrivySignIn: vi.fn(),
  /** What the button asked to happen once Privy finishes. */
  privyOnComplete: undefined as undefined | (() => void),
  /** Privy's answer, which is the authority on whether anyone is signed in. */
  authenticated: true,
  /** False while Privy is still restoring the session. */
  authReady: true,
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
  useGeoChatAuth: () => ({ ready: mocks.authReady, authenticated: mocks.authenticated, accountKey: 'user-a' }),
}));

// What "Join a debate" reaches for. Stood up the same way the full-screen feed's suite stands them
// up, so both surfaces' copies of these assertions are asking the same questions of the same seams.
vi.mock('~/core/debates/matchmaking/use-debates-hub', () => ({
  useDebatesHub: () => ({
    isOpen: mocks.hubIsOpen,
    activeTab: 'lobby' as const,
    open: mocks.hubOpen,
    close: mocks.hubClose,
    toggle: vi.fn(),
    setTab: vi.fn(),
  }),
}));

// Reaches for next-navigation and Privy context these tests do not stand up.
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: (onComplete?: () => void) => {
    mocks.privyOnComplete = onComplete;
    return mocks.openPrivySignIn;
  },
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

// Forwards the anchor props it is given rather than only `href`: the title's click handling —
// which is what decides between a panel and a navigation — arrives as `onClick`, and a mock that
// drops it would let a broken title pass.
vi.mock('~/design-system/prefetch-link', () => ({
  PrefetchLink: ({
    children,
    entityId: _entityId,
    spaceId: _spaceId,
    ...props
  }: React.ComponentPropsWithoutRef<'a'> & { entityId?: string; spaceId?: string }) => <a {...props}>{children}</a>,
}));

vi.mock('~/design-system/fallback-image', () => ({
  FallbackImage: () => <div data-testid="image" />,
}));

// The card renders the real `DebateInteractionBar` — sharing it with the full-screen feed is the
// point of these assertions — so only its vote control is stood in for. The real one reaches the
// sync store, Privy and the onboarding atoms, none of which this card's behavior depends on.
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({ entityId, presentation }: { entityId: string; presentation?: string }) => (
    <div data-testid="vote-buttons" data-entity={entityId} data-presentation={presentation} />
  ),
}));

vi.mock('./explore-join-space-button', () => ({
  ExploreJoinSpaceButton: () => <button type="button" data-testid="join-button" />,
}));

// `ExploreCardEntityLink` renders for real — it carries the title's modifier-click and panel rules,
// which is the behavior under test — so only its side-panel sink is stood in for.
const openSidePanel = vi.fn();
vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel, closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));

const item: ExploreFeedItem = {
  entityId: 'fd51f9352063461780397b672b23364c',
  spaceId: 'space-1',
  spaceName: 'Fashion',
  spaceImage: null,
  types: [{ id: 'fd51f93520634617be397b672b23364c', name: 'Debate' }],
  createdAtSec: 0,
  title: 'Fast fashion should be discouraged with higher taxation',
  description: null,
  imageUrl: null,
  commentCount: 3,
  recordingUrls: [],
  debateVideoUrls: [],
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
      // Hyphenated on purpose: geo-chat returns UUIDs where the graph, and every explore route and
      // panel target, spells ids as plain hex. The card has to normalize this.
      claim_entity_id: '9b2a1f30-4d5c-4a8e-9f11-77c0a2b3d4e5',
      claim: 'Waking up early improves health and productivity',
      description: null,
    },
    recordings: [{ participant_slot: 1 }, { participant_slot: 2 }],
    participants: [],
  } as unknown as Debate;
}

beforeEach(() => {
  vi.clearAllMocks();
  observers = [];
  mocks.debateQuery = { data: undefined, isError: false };
  mocks.mediaQuery = { data: undefined, isError: false };
  // Not mock fns, so `clearAllMocks` does not restore them.
  mocks.hubIsOpen = false;
  mocks.authenticated = true;
  mocks.authReady = true;
  mocks.privyOnComplete = undefined;

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

function renderCard() {
  return render(<DebateExploreFeedCard item={item} fallback={<div data-testid="fallback" />} />);
}

describe('DebateExploreFeedCard', () => {
  it('shows the card chrome with video placeholders while the debate loads', () => {
    renderCard();
    expect(screen.getByText('Fast fashion should be discouraged with higher taxation')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Join a debate' })).toBeDefined();
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByTestId('fallback')).toBeNull();
  });

  /**
   * The card carries the full-screen header's own "Join a debate", which replaced a "View all"
   * link into the space's debates. It is the shared `JoinDebateButton`, so these check the card is
   * wired to it rather than re-deciding anything — the decisions themselves are the same code the
   * full-screen feed's suite covers.
   */
  describe('Join a debate', () => {
    it('opens the debates hub on Lobby', () => {
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: 'Join a debate' }));
      expect(mocks.hubOpen).toHaveBeenCalledWith('lobby');
    });

    it('sends a signed-out viewer to sign in, then opens the hub without a second press', () => {
      mocks.authenticated = false;
      renderCard();

      fireEvent.click(screen.getByRole('button', { name: 'Join a debate' }));
      expect(mocks.openPrivySignIn).toHaveBeenCalledOnce();
      expect(mocks.hubOpen).not.toHaveBeenCalled();

      act(() => mocks.privyOnComplete?.());
      expect(mocks.hubOpen).toHaveBeenCalledWith('lobby');
    });

    it('does nothing until Privy has restored the session', () => {
      mocks.authReady = false;
      mocks.authenticated = false;
      renderCard();

      fireEvent.click(screen.getByRole('button', { name: 'Join a debate' }));
      expect(mocks.openPrivySignIn).not.toHaveBeenCalled();
      expect(mocks.hubOpen).not.toHaveBeenCalled();
    });

    it('closes the hub when pressed a second time', () => {
      mocks.hubIsOpen = true;
      renderCard();

      fireEvent.click(screen.getByRole('button', { name: 'Join a debate' }));
      expect(mocks.hubClose).toHaveBeenCalledOnce();
      expect(mocks.hubOpen).not.toHaveBeenCalled();
    });

    // The hub dismisses itself on outside pointerdown and exempts anything marked as an opener.
    it('marks the button as a hub opener so the panel does not dismiss on pointerdown', () => {
      renderCard();
      expect(screen.getByRole('button', { name: 'Join a debate' }).hasAttribute('data-debates-hub-opener')).toBe(true);
    });
  });

  /**
   * GEO-2879. The Debate entity's name is `"<A> vs. <B> on <claim>"`; full screen titles the
   * debate with the claim alone, and so does the card.
   */
  it('titles the card with the claim once the debate resolves', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    expect(screen.getByRole('heading').textContent).toBe('Waking up early improves health and productivity');
    expect(screen.queryByText('Fast fashion should be discouraged with higher taxation')).toBeNull();
  });

  it('points the title at the claim entity in the claim’s own space, with ids normalized', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    // A real href on a real anchor, so cmd-click still opens the claim in a new tab (GEO-2701).
    expect(screen.getByRole('link', { name: /Waking up early/ }).getAttribute('href')).toBe(
      '/space/52c7ae149838b6d47ce0f3b2a5974546/9b2a1f304d5c4a8e9f1177c0a2b3d4e5'
    );
  });

  it('opens the claim in the side panel on an unmodified click when Explore asks for it', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    render(<DebateExploreFeedCard item={item} titleOpensSidePanel fallback={<div />} />);

    fireEvent.click(screen.getByRole('link', { name: /Waking up early/ }));
    expect(openSidePanel).toHaveBeenCalledWith(
      '9b2a1f304d5c4a8e9f1177c0a2b3d4e5',
      '52c7ae149838b6d47ce0f3b2a5974546',
      false
    );
  });

  it('leaves the entity name as the title until the claim is known', () => {
    renderCard();
    expect(screen.getByRole('heading').textContent).toBe('Fast fashion should be discouraged with higher taxation');
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

    const player = screen.getByTestId('player');
    expect(player.getAttribute('data-active')).toBe('false');

    intersectAll(0.7);
    expect(screen.getByTestId('player').getAttribute('data-active')).toBe('true');

    intersectAll(0.4);
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

  /**
   * Both orientations are always in the DOM and the container query hides one, so these scope to
   * the rail — the arrangement the card shows wherever it has room, and the one that matches the
   * full-screen feed. jsdom applies no CSS, so an unscoped query would match either.
   */
  const rail = () => within(screen.getByTestId('debate-card-interaction-rail'));
  const row = () => within(screen.getByTestId('debate-card-interaction-row'));

  it("renders the same interaction bar the full-screen feed does, with the card's own counts", () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    // The bar's vertical presentation, as a rail beside the videos — not the inline arrows the
    // other explore cards use.
    expect(rail().getByTestId('vote-buttons').getAttribute('data-presentation')).toBe('debate-vertical');

    // Counts come from what the card already has: the feed's comment count and the shared
    // transcript-claims query, rather than a thread fetch per card. The vertical bar sets its
    // count under the button rather than inside it, so the count lives on the wrapper.
    const comments = rail().getByRole('button', { name: 'Comments' });
    expect(comments.parentElement?.textContent).toBe('3');
    expect(rail().getByRole('button', { name: 'Claims' }).parentElement?.textContent).toBe('3');

    // Marked as an opener so pressing it while the global comments panel is open switches the
    // panel to this debate instead of reading as an outside click that dismisses it.
    expect(comments.hasAttribute('data-entity-comments-opener')).toBe(true);
  });

  /** Cards too narrow for a rail get the same bar as a row beneath the videos. */
  it('carries a horizontal fallback of the same bar for narrow cards', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    expect(row().getByTestId('vote-buttons').getAttribute('data-presentation')).toBe('debate-horizontal');
    expect(row().getByRole('button', { name: 'Claims' }).textContent).toBe('3');
  });

  it('keeps votes and comments while the debate is still loading', () => {
    renderCard();
    expect(rail().getByTestId('vote-buttons')).toBeDefined();
    expect(rail().getByRole('button', { name: 'Comments' })).toBeDefined();
  });

  it('shows Claims and Share actions once the debate is ready, opening the claims panel on demand', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    expect(rail().getByRole('button', { name: 'Share debate' })).toBeDefined();

    expect(screen.queryByTestId('claims-panel')).toBeNull();
    fireEvent.click(rail().getByRole('button', { name: 'Claims' }));
    expect(screen.getByTestId('claims-panel')).toBeDefined();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('claims-panel')).toBeNull();
  });

  /**
   * One set of dialogs for both orientations: a `hidden` wrapper still mounts its children, so a
   * share dialog owned by the losing bar would portal itself on screen anyway.
   */
  it('opens one claims panel however many bars are mounted', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    fireEvent.click(row().getByRole('button', { name: 'Claims' }));
    expect(screen.getAllByTestId('claims-panel')).toHaveLength(1);
  });

  it('hides Claims and Share while the debate is still loading', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Claims' })).toBeNull();
    expect(screen.queryByRole('button', { name: /share/i })).toBeNull();
  });

  it('shows the Join-space chip to non-members and honors hideJoinButton', () => {
    const nonMemberItem = { ...item, isMemberOrEditor: false };

    const { unmount } = render(<DebateExploreFeedCard item={nonMemberItem} fallback={<div />} />);
    expect(screen.getByTestId('join-button')).toBeDefined();
    unmount();

    render(<DebateExploreFeedCard item={nonMemberItem} hideJoinButton fallback={<div />} />);
    expect(screen.queryByTestId('join-button')).toBeNull();
  });

  it('does not show the Join-space chip to members', () => {
    renderCard();
    expect(screen.queryByTestId('join-button')).toBeNull();
  });
});
