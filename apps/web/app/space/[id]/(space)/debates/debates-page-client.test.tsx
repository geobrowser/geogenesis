import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebatesPageClient } from './debates-page-client';

const mocks = vi.hoisted(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  replace: vi.fn(),
  recordingUrls: vi.fn(),
  mediaArtifactMutate: vi.fn(),
  openSidePanel: vi.fn(),
  debates: [] as Debate[],
  spaceDebatesLoading: false,
  castVote: vi.fn(),
}));

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: () => true,
  useDebatesEnabled: () => true,
}));

vi.mock('~/core/debates/hooks', () => ({
  useSpaceDebates: () => ({
    data: { debates: mocks.debates, matches: [] },
    isLoading: mocks.spaceDebatesLoading,
    error: null,
  }),
  useDebateRecordingUrls: (debate: Debate, enabled: boolean) => {
    mocks.recordingUrls(debate.id, enabled);
    return enabled
      ? {
          slot1: `https://media.test/${debate.id}-1.webm`,
          slot2: `https://media.test/${debate.id}-2.webm`,
          error: null,
        }
      : { slot1: null, slot2: null, error: null };
  },
  useDebateMediaArtifactUrl: () => ({ mutate: mocks.mediaArtifactMutate }),
  useDebateTranscript: () => ({ data: { segments: [] }, isLoading: false, error: null }),
  useDebateClaims: () => ({ data: { claims: [] } }),
  useJoinDebateQueue: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('~/core/hooks/use-space', () => ({
  useSpace: () => ({ space: { entity: { name: 'Fashion', image: null } }, isLoading: false }),
}));

vi.mock('~/core/sync/use-store', () => ({
  useQueryEntities: () => ({ entities: [], isLoading: false }),
}));

vi.mock('~/core/hooks/use-entity-side-panel', () => ({
  useEntitySidePanel: () => ({ openSidePanel: mocks.openSidePanel, closeSidePanel: vi.fn(), sidePanelTarget: null }),
}));

beforeEach(() => {
  mocks.play.mockClear();
  mocks.pause.mockClear();
  mocks.replace.mockClear();
  mocks.mediaArtifactMutate.mockClear();
  mocks.recordingUrls.mockClear();
  mocks.debates = [completedDebate('debate-1', 'Debates are useful')];
  mocks.spaceDebatesLoading = false;
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
  it('renders the claim title, space, join button and both debater videos with no loading pass', () => {
    const { container } = render(<DebatesPageClient spaceId="space-1" />);

    expect(screen.getByRole('heading', { name: 'Debates are useful' })).toBeInTheDocument();
    expect(screen.getAllByText('Fashion').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Join debate' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Winner?').length).toBeGreaterThan(0);
    expect(screen.queryByText('Loading debates\u2026')).not.toBeInTheDocument();

    const videos = container.querySelectorAll('video');
    expect(videos).toHaveLength(2);
    expect(videos[0]).toHaveAttribute('src', 'https://media.test/debate-1-1.webm');
  });

  // The neighbour's signed URLs are in hand before the viewer gets there, so scrolling lands on a
  // painted frame rather than an empty slot waiting on two round trips.
  it("warms the neighbouring debate's recordings while the first one plays", () => {
    mocks.debates.push(completedDebate('debate-2', 'Adjacent debate'));

    const { container } = render(<DebatesPageClient spaceId="space-1" />);

    expect(mocks.recordingUrls).toHaveBeenCalledWith('debate-2', true);
    expect(container.querySelectorAll('video')).toHaveLength(4);
  });

  it('says nothing about an empty space until the debates query has answered', () => {
    mocks.debates = [];
    mocks.spaceDebatesLoading = true;

    const { rerender } = render(<DebatesPageClient spaceId="space-1" />);

    expect(screen.queryByText('No debates to watch yet. Start one from the Claims tab.')).not.toBeInTheDocument();

    mocks.spaceDebatesLoading = false;
    rerender(<DebatesPageClient spaceId="space-1" />);

    expect(screen.getByText('No debates to watch yet. Start one from the Claims tab.')).toBeInTheDocument();
  });
});

function completedDebate(id: string, claim: string): Debate {
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
