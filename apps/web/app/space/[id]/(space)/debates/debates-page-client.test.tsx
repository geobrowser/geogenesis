import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebatesPageClient } from './debates-page-client';

const mocks = vi.hoisted(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  replace: vi.fn(),
  recordingUrl: vi.fn(() => Promise.resolve({ url: 'https://media.test/slot.webm' })),
  mediaArtifactMutate: vi.fn(),
  openSidePanel: vi.fn(),
  // Second stage of the feed's gate: which debates the media worker has composed a final_video for.
  media: { processedIds: ['debate-1'] as string[], isLoading: false, hasError: false },
  castVote: vi.fn(),
  /** The feed's debates; null for the suite's usual single debate. */
  debates: null as Debate[] | null,
  /** Each debate the claims panel was mounted for, in order — a remount appends. */
  claimsPanelMounts: [] as string[],
}));

// Stands in for the claims panel so a test can see whether it is remounted or merely handed a new
// debate: only a mount appends. Its content has its own suite.
vi.mock('~/core/debates/browse/debate-claims-panel', async () => {
  const React = await import('react');
  return {
    DebateClaimsPanel: ({ debate }: { debate: Debate }) => {
      React.useEffect(() => {
        mocks.claimsPanelMounts.push(debate.id);
        // Mount-only: a new debate handed to the same panel is exactly what must not register here.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return React.createElement('div', { 'data-testid': 'claims-panel', 'data-debate': debate.id });
    },
  };
});

// Voting reaches the chain and the user's personal space, neither of which exists here. The
// tally logic has its own unit tests; this suite only cares that the feed renders the pills.
vi.mock('~/core/debates/use-debate-votes', () => ({
  useDebateVotes: () => ({
    sharePercentFor: () => null,
    isMyPick: () => false,
    hasVoted: false,
    isVoting: false,
    castVote: mocks.castVote,
  }),
  useDebateVotesByVoter: () => new Map(),
}));

// The real player resolves bylines through react-query. This page suite intentionally stubs
// the player's data dependencies instead of recreating the app provider tree; byline loading
// and rendering have focused coverage in the player and hook suites.
vi.mock('~/core/debates/participant-bylines', () => ({
  useParticipantBylines: () => new Map(),
}));

// The end card's numbers come through react-query too, and it is only drawn once a debate has
// ended, which nothing here does. Its data and its layout have their own suites.
vi.mock('~/core/debates/browse/use-debate-end-card', () => ({
  useDebateEndCard: () => ({}),
}));

vi.mock('~/partials/entity-page/entity-vote-buttons', () => ({
  EntityVoteButtons: () => <div data-testid="entity-vote-buttons" />,
}));

vi.mock('next/navigation', () => ({
  // `prefetch` is for PrefetchLink, which the feed header's space and claim links use.
  useRouter: () => ({ replace: mocks.replace, prefetch: vi.fn() }),
}));

// PrefetchLink hydrates the entity it points at on hover, which reaches for the sync engine.
vi.mock('~/core/sync/use-sync-engine', () => ({
  useSyncEngine: () => ({ hydrate: vi.fn() }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: () => true,
}));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'user-a' }),
  useSpaceDebates: () => ({
    data: { debates: mocks.debates ?? [completedDebate()], matches: [] },
    isLoading: false,
    error: null,
  }),
  useProcessedVideoDebateIds: () => mocks.media,
  useRecordingUrl: () => ({ mutateAsync: mocks.recordingUrl }),
  useDebateMediaArtifactUrl: () => ({ mutate: mocks.mediaArtifactMutate }),
  useDebateMedia: () => ({ data: undefined, isLoading: false, isError: false }),
  useDebateTranscript: () => ({ data: { segments: [] }, isLoading: false, error: null }),
  useDebateClaims: () => ({ data: { claims: [] } }),
  // Reached through the player's claim ticker, which asks per space for the rows behind each
  // claim. This suite's debates carry no claims, so it answers with none.
  useDebateClaimsBySpaces: () => ({ claims: [], isLoading: false, isError: false }),
  // The feed resolves an anchor by id when the space listing does not contain it (GEO-2764).
  // These tests never anchor, so it stays idle.
  useDebate: () => ({ data: null, isLoading: false, error: null }),
}));

// The feed orders itself by the explore "Best" ranking. These tests are about readiness and
// error states, so the ranking is settled and empty — which leaves the feed on recency, the order
// they were written against.
vi.mock('~/core/debates/browse/use-debates-best-order', () => ({
  useDebatesBestOrder: () => ({ rankByDebateId: new Map(), isLoading: false, isError: false }),
}));

// The feed's "Join a debate" button opens the login when signed out, and that hook reaches for
// next-navigation and Privy context this suite does not stand up.
vi.mock('~/core/hooks/use-privy-sign-in', () => ({
  usePrivySignIn: () => vi.fn(),
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: { entity: { name: 'Fashion', image: null } }, isLoading: false }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [], isLoading: false }),
}));

// The feed's comment button opens a panel backed by the entity-comments stack,
// whose storage-backed atoms initialize at import time. Stub it (and the live
// count) the way the other debate suites do.
vi.mock('~/partials/comments/entity-comments-panel', () => ({
  EntityCommentsPanel: () => <div>Comments panel</div>,
}));

vi.mock('~/core/hooks/use-comments', () => ({
  useComments: () => ({ comments: [], totalCount: 0, isLoading: false, error: null, refetch: vi.fn() }),
}));

// The feed's Claims badge reads the debate's transcript claims through react-query, and this
// suite renders the feed without a QueryClientProvider. Stub it the way the other debate suites do;
// the grouping and ordering have their own unit tests.
vi.mock('~/core/debates/use-debate-transcript-claims', async () => {
  // The real empty value rather than a hand-rolled copy of it. A literal here has to be updated
  // every time the shape grows a field, and when it isn't, it fails as a runtime TypeError in a
  // suite that has nothing to do with claims.
  const { EMPTY_TRANSCRIPT_CLAIMS } = await vi.importActual<typeof import('~/core/debates/transcript-claims')>(
    '~/core/debates/transcript-claims'
  );

  return {
    useDebateTranscriptClaims: () => ({ claims: EMPTY_TRANSCRIPT_CLAIMS, isLoading: false, error: null }),
  };
});

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel, closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));

beforeEach(() => {
  mocks.play.mockClear();
  mocks.pause.mockClear();
  mocks.replace.mockClear();
  mocks.mediaArtifactMutate.mockClear();
  mocks.media = { processedIds: ['debate-1'], isLoading: false, hasError: false };
  mocks.debates = null;
  mocks.claimsPanelMounts = [];
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: mocks.play });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: mocks.pause });
  class MockIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DebatesPageClient browse feed', () => {
  it('renders the claim title, space, join button and both debater videos', async () => {
    const { container } = render(<DebatesPageClient spaceId="space-1" />);

    expect(screen.getByRole('heading', { name: 'Debates are useful' })).toBeInTheDocument();
    expect(screen.getAllByText('Fashion').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Join a debate' }).length).toBeGreaterThan(0);
    // Both debaters name themselves on their own tile. The "Winner?" pill used to sit here too;
    // it moved off the tile entirely when the name row took the bottom-right corner, and winner
    // voting now happens on the end-of-debate scorecard and in the claims panel.
    expect(screen.getAllByText('Alex').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sam').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('entity-vote-buttons')).toHaveLength(2);

    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(2));
  });

  it('opens the claims panel afresh on each debate the feed scrolls to', () => {
    // The panel follows the active debate. Reused rather than remounted, it carried the old list's
    // scroll offset — and the debater it had been opened at — onto the next debate.
    const second = {
      ...completedDebate(),
      id: 'debate-2',
      room_name: 'debate-2',
      claim: { ...completedDebate().claim, id: 'claim-2', claim_entity_id: 'claim-entity-2', claim: 'Second claim' },
    };
    mocks.debates = [completedDebate(), second];
    mocks.media = { processedIds: ['debate-1', 'debate-2'], isLoading: false, hasError: false };
    const observed: { callback: IntersectionObserverCallback; element: Element }[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(element: Element) {
          observed.push({ callback: this.callback, element });
        }
        unobserve() {}
        disconnect() {}
      }
    );

    render(<DebatesPageClient spaceId="space-1" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Claims (0)' })[0]);
    expect(mocks.claimsPanelMounts).toEqual(['debate-1']);

    const secondItem = observed.find(entry => entry.element.textContent?.includes('Second claim'))!;
    act(() =>
      secondItem.callback(
        [{ isIntersecting: true, intersectionRatio: 0.7, target: secondItem.element } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );

    expect(screen.getByTestId('claims-panel')).toHaveAttribute('data-debate', 'debate-2');
    expect(mocks.claimsPanelMounts).toEqual(['debate-1', 'debate-2']);
  });

  // Both recordings exist, so `isWatchableDebate` passes — only the media gate withholds it.
  it('withholds a debate whose media worker has not composed a final_video', () => {
    mocks.media = { processedIds: [], isLoading: false, hasError: false };

    const { container } = render(<DebatesPageClient spaceId="space-1" />);

    expect(screen.getByText('No debates to watch yet. Start one from the Claims tab.')).toBeInTheDocument();
    expect(container.querySelectorAll('video')).toHaveLength(0);
  });

  it('stays in a loading state while readiness is still in flight', () => {
    mocks.media = { processedIds: [], isLoading: true, hasError: false };

    render(<DebatesPageClient spaceId="space-1" />);

    expect(screen.getByText('Loading debates…')).toBeInTheDocument();
  });

  // The debate list loaded fine, so its own error state can't report this.
  it('reports a failed readiness lookup instead of claiming there are no debates', () => {
    mocks.media = { processedIds: [], isLoading: false, hasError: true };

    render(<DebatesPageClient spaceId="space-1" />);

    expect(
      screen.getByText('Could not check which debates are ready to watch. Try again shortly.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No debates to watch yet. Start one from the Claims tab.')).not.toBeInTheDocument();
  });
});

function completedDebate(): Debate {
  return {
    id: 'debate-1',
    claim: {
      id: 'claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'Debates are useful',
      description: null,
    },
    status: 'complete',
    response_kind: null,
    room_name: 'debate-1',
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
    created_at: '2026-07-02T00:00:00.000Z',
    started_at: '2026-07-02T00:00:10.000Z',
    completed_at: '2026-07-02T00:01:10.000Z',
    participants: [
      {
        user_id: 'user-1',
        profile_space_id: 'profile-1',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        joined_at: null,
        ready_at: null,
      },
      {
        user_id: 'user-2',
        profile_space_id: 'profile-2',
        display_name: 'Sam',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        joined_at: null,
        ready_at: null,
      },
    ],
    recordings: [1, 2].map(slot => ({
      id: `recording-${slot}`,
      participant_slot: slot as 1 | 2,
      position: slot === 1,
      position_label: slot === 1 ? 'Yes' : 'No',
      user_id: `user-${slot}`,
      object_key: `recording-${slot}.webm`,
      filename: `recording-${slot}.webm`,
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
