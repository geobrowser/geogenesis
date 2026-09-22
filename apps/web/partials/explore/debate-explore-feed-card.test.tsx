import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { Provider, useAtomValue } from 'jotai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';
import { DebatePlaybackGate } from '~/core/debates/debate-playback-gate';
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
  playerToggle: vi.fn(),
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

// The card renders the real `DebateInteractionBar` — sharing it with the full-screen feed is the
// point of these assertions — so only its vote control is stood in for. The real one reaches the
// sync store, Privy and the onboarding atoms, none of which this card's behavior depends on.
vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: ({
    entityId,
    presentation,
    responseKind,
  }: {
    entityId: string;
    presentation?: string;
    responseKind?: string | null;
  }) => (
    <div
      data-testid="vote-buttons"
      data-entity={entityId}
      data-presentation={presentation}
      data-response-kind={responseKind ?? 'inferred'}
    />
  ),
}));

vi.mock('~/core/debates/browse/debate-feed-player', () => ({
  DebateFeedPlayer: ({
    debate,
    active,
    reducedOverlays,
  }: {
    debate: Debate;
    active: boolean;
    reducedOverlays?: boolean;
  }) => (
    <button
      type="button"
      data-testid="player"
      data-debate={debate.id}
      data-active={active}
      data-reduced-overlays={reducedOverlays ? 'true' : 'false'}
      onClick={mocks.playerToggle}
    />
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
    // Deliberately not the item's `commentCount`: equal counts would let the comment and claims
    // wirings be swapped without a test noticing.
    claims: { byAuthorSpaceId: new Map(), unattributed: [], totalCount: 18 },
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
  vi.restoreAllMocks();
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

function CardHarness({
  props,
  allowedId,
}: {
  props: Partial<React.ComponentProps<typeof DebateExploreFeedCard>>;
  allowedId?: string | null;
}) {
  const card = <DebateExploreFeedCard item={item} fallback={<div data-testid="fallback" />} {...props} />;

  return (
    <QueryClientProvider client={client}>
      <Provider>
        {allowedId === undefined ? card : <DebatePlaybackGate allowedId={allowedId}>{card}</DebatePlaybackGate>}
        <PanelProbe />
      </Provider>
    </QueryClientProvider>
  );
}

function renderCard(
  props: Partial<React.ComponentProps<typeof DebateExploreFeedCard>> = {},
  allowedId?: string | null
) {
  const result = render(<CardHarness props={props} allowedId={allowedId} />);
  return {
    ...result,
    rerenderCard: () => result.rerender(<CardHarness props={props} allowedId={allowedId} />),
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

  it('keeps compact Activity chrome to one metadata row and two title lines', async () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard({ compactChrome: true });
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
    expect(screen.getByTestId('vote-buttons').parentElement).toHaveClass('gap-2');
    expect(screen.getByTestId('vote-buttons').parentElement).not.toHaveClass('justify-between', 'gap-1');
    expect(screen.getByRole('button', { name: /^Comments/ })).toHaveClass('gap-1', 'px-1.5');
    expect(screen.getByRole('button', { name: 'Share debate' })).toHaveClass('size-7', 'px-0');
    expect(screen.getByRole('button', { name: 'Share debate' }).textContent).toBe('');
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

  it('requests playback before a player interaction', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    const onPlaybackRequest = vi.fn();
    renderCard({ onPlaybackRequest });
    intersectAll(0.7);

    const player = screen.getByTestId('player');
    fireEvent.click(player);
    expect(onPlaybackRequest).toHaveBeenCalledWith('fd51f935-2063-4617-8039-7b672b23364c');
    expect(mocks.playerToggle).toHaveBeenCalledOnce();
  });

  it('consumes an active non-owner click while transferring playback ownership', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    const onPlaybackRequest = vi.fn();
    renderCard({ onPlaybackRequest }, 'another-debate');
    intersectAll(0.7);

    expect(screen.getByTestId('player')).toHaveAttribute('data-active', 'false');
    fireEvent.click(screen.getByTestId('player'));

    expect(onPlaybackRequest).toHaveBeenCalledWith('fd51f935-2063-4617-8039-7b672b23364c');
    expect(mocks.playerToggle).not.toHaveBeenCalled();
  });

  it('brings an inactive player into view before requesting playback', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    const onPlaybackRequest = vi.fn();
    const { container } = renderCard({ onPlaybackRequest });

    // The media look-ahead mounts the player before the card is active. Clicking that visible
    // edge must not transfer the gate to a player which will immediately pause itself.
    intersectAll(0.1);
    const card = container.querySelector('article');
    expect(card).not.toBeNull();
    const scrollIntoView = vi.fn();
    Object.defineProperty(card, 'scrollIntoView', { configurable: true, value: scrollIntoView });

    fireEvent.click(screen.getByTestId('player'));
    expect(onPlaybackRequest).not.toHaveBeenCalled();
    expect(mocks.playerToggle).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest', inline: 'center' });

    // Ownership transfers only after the observer confirms that the clicked player can run.
    intersectAll(0.6);
    expect(onPlaybackRequest).toHaveBeenCalledWith('fd51f935-2063-4617-8039-7b672b23364c');
  });

  it('registers playback availability only while a playable player is mounted', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    const onPlaybackAvailabilityChange = vi.fn();
    renderCard({ onPlaybackAvailabilityChange });
    expect(onPlaybackAvailabilityChange).not.toHaveBeenCalled();

    intersectAll(0.1);
    expect(onPlaybackAvailabilityChange).toHaveBeenLastCalledWith('fd51f935-2063-4617-8039-7b672b23364c', true);

    intersectAll(0);
    expect(onPlaybackAvailabilityChange).toHaveBeenLastCalledWith('fd51f935-2063-4617-8039-7b672b23364c', false);
  });

  it('unregisters stale playable data when a refetch replaces the player with fallback', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    const onPlaybackAvailabilityChange = vi.fn();
    const view = renderCard({ onPlaybackAvailabilityChange });
    intersectAll(0.7);
    expect(onPlaybackAvailabilityChange).toHaveBeenLastCalledWith('fd51f935-2063-4617-8039-7b672b23364c', true);

    // TanStack Query retains the previous data when a background refetch fails.
    mocks.debateQuery = { data: watchableDebate(), isError: true };
    view.rerenderCard();

    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(onPlaybackAvailabilityChange).toHaveBeenLastCalledWith('fd51f935-2063-4617-8039-7b672b23364c', false);
  });

  it('does not request playback from a loading skeleton that may resolve to the fallback', () => {
    const onPlaybackRequest = vi.fn();
    const { container } = renderCard({ onPlaybackRequest });

    const skeleton = container.querySelector<HTMLElement>('[aria-hidden="true"] .animate-pulse')?.parentElement;
    expect(skeleton).not.toBeNull();
    fireEvent.click(skeleton as HTMLElement);

    expect(onPlaybackRequest).not.toHaveBeenCalled();
  });

  it('evicts the player outside the media window and remounts it on reverse scroll', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();

    intersectAll(0.7);
    expect(screen.getByTestId('player')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Claims/ })).toBeDefined();

    // A row stays in the infinite feed, but its media/query subtree does not.
    intersectAll(0);
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Claims/ })).toBeNull();

    // Re-entering the look-ahead band restores a warm, inactive player before it is visible.
    intersectAll(0.1);
    expect(screen.getByTestId('player').getAttribute('data-active')).toBe('false');
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

    fireEvent.click(screen.getByRole('button', { name: /^Claims/ }));
    expect(screen.getByTestId('claims-panel')).toBeDefined();

    // The player and the control that opened it both stand down; what is open stays open.
    intersectAll(0);
    expect(screen.queryByTestId('player')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Claims/ })).toBeNull();
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

  it('shows Claims and Share actions once the debate is ready, opening the claims panel on demand', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.1);

    expect(screen.getByRole('button', { name: 'Share debate' })).toBeDefined();

    expect(screen.queryByTestId('claims-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Claims/ }));
    expect(screen.getByTestId('claims-panel')).toBeDefined();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('claims-panel')).toBeNull();
  });

  it("renders the same interaction bar the full-screen feed does, with the card's own counts", () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.1);

    // The shared bar in its horizontal arrangement, beneath the videos - not the inline arrows the
    // other explore cards use.
    expect(screen.getByTestId('vote-buttons').getAttribute('data-presentation')).toBe('debate-horizontal');

    // Counts come from what the card already has: the feed's comment count and the shared
    // transcript-claims query, rather than a thread fetch per card.
    const comments = screen.getByRole('button', { name: /^Comments/ });
    expect(comments.textContent).toBe('3');
    expect(screen.getByRole('button', { name: /^Claims/ }).textContent).toBe('18');

    // Marked as an opener so pressing it while the global comments panel is open switches the
    // panel to this debate instead of reading as an outside click that dismisses it.
    expect(comments.hasAttribute('data-entity-comments-opener')).toBe(true);
  });

  it('keeps votes and comments while the debate is still loading', () => {
    renderCard();
    expect(screen.getByTestId('vote-buttons')).toBeDefined();
    expect(screen.getByRole('button', { name: /^Comments/ })).toBeDefined();
  });

  /**
   * GEO-2879 headed the card with the claim, which left nothing on the card pointing at the debate
   * itself — the open question in that ticket's notes. This control is the answer, and it has to
   * stay a real link: the Debate entity's page *is* the full-screen feed anchored to that debate.
   */
  describe('column width', () => {
    /** The one element carrying the column budget: the card's single inner column. */
    const column = (container: HTMLElement) => container.querySelector('article > div') as HTMLElement;

    it('caps itself at the card width, fitted to the viewport, by default', () => {
      const { container } = renderCard();

      expect(column(container).className).toContain('max-w-[var(--debate-card-column-width)]');
      expect(column(container).style.getPropertyValue('--debate-card-column-width')).toBe(
        'clamp(320px, calc(83dvh - 178px), 560px)'
      );
    });

    it('raises the ceiling to the container under fullWidth without dropping the viewport budget', () => {
      // `fullWidth` means "this column is already the reading width, don't cap me at 560px". It
      // used to drop the `max-w` and the budget together, which on the claim page's 840px column
      // made the card ~1140px tall — so on a 900px viewport the second debater and the interaction
      // bar could not be seen together, which is the one thing the budget guarantees.
      const { container } = renderCard({ fullWidth: true });

      expect(column(container).className).toContain('max-w-[var(--debate-card-column-width)]');
      expect(column(container).style.getPropertyValue('--debate-card-column-width')).toBe(
        'max(320px, min(calc(83dvh - 178px), 100%))'
      );
    });
  });

  describe('full-screen control', () => {
    it('links to the Debate entity, which is the anchored full-screen feed', () => {
      renderCard();

      const expand = screen.getByRole('link', { name: 'Watch this debate full screen' });
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
   * GEO-2660. Naming the response kind skips `EntityVoteButtons`' entity lookup, and with it the
   * space resolution that finds an entity's own votes when a surface is listing it from elsewhere
   * — which an explore card does whenever a data block row carries a debate from another space.
   * The full-screen feed names it, because it only ever shows a space its own debates.
   */
  it('lets the vote control work out the response kind, so it can resolve the home space', () => {
    renderCard();

    expect(screen.getByTestId('vote-buttons').getAttribute('data-response-kind')).toBe('inferred');
  });

  /**
   * The app's comments panel is an in-flow panel with no dialog role and no focus trap, so the
   * control that opens it says how it stands without sending a reader looking for a dialog.
   * `EntityCommentsButton`, which this replaced on explore cards, announced exactly this much.
   */
  it('reports the comments panel as expanded without claiming it is a dialog', () => {
    renderCard();

    const comments = screen.getByRole('button', { name: /^Comments/ });
    expect(comments.getAttribute('aria-expanded')).toBe('false');
    expect(comments.hasAttribute('aria-haspopup')).toBe(false);
  });

  /** Share really does open a dialog, and still says so. */
  it('keeps the dialog announcement on Share, which opens one', () => {
    mocks.debateQuery = { data: watchableDebate(), isError: false };
    mocks.mediaQuery = { data: { artifacts: [{ kind: 'final_video' }] }, isError: false };
    renderCard();
    intersectAll(0.1);

    expect(screen.getByRole('button', { name: 'Share debate' }).getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('hides Claims and Share while the debate is still loading', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: /^Claims/ })).toBeNull();
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
