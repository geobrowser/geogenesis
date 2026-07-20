import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebatesPageClient } from './debates-page-client';

const mocks = vi.hoisted(() => ({
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  replace: vi.fn(),
  recordingUrl: vi.fn(() => Promise.resolve({ url: 'https://media.test/slot.webm' })),
  openSidePanel: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: () => true,
  useDebatesEnabled: () => true,
}));

vi.mock('~/core/debates/hooks', () => ({
  useSpaceDebates: () => ({ data: { debates: [completedDebate()], matches: [] }, isLoading: false, error: null }),
  useRecordingUrl: () => ({ mutateAsync: mocks.recordingUrl }),
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
    expect(screen.getAllByRole('button', { name: 'Join debate' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Winner?').length).toBeGreaterThan(0);

    await waitFor(() => expect(container.querySelectorAll('video')).toHaveLength(2));
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
