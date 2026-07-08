import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate } from '~/core/debates/api';

import { DebateRoomPageClient } from './debate-room-page-client';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  joinMutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: () => true,
}));

vi.mock('~/core/debates/hooks', () => ({
  useAbortDebate: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCompleteLocalRecordingUpload: () => ({ mutateAsync: vi.fn() }),
  useCreateLocalRecordingUpload: () => ({ mutateAsync: vi.fn() }),
  useDebate: () => ({ data: completedDebate(), isLoading: false, error: null }),
  useJoinDebateQueue: () => ({ mutate: mocks.joinMutate, isPending: false, error: null }),
  useLiveKitJoin: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMarkDebateJoined: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeEach(() => {
  mocks.push.mockReset();
  mocks.replace.mockReset();
  mocks.joinMutate.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('DebateRoomPageClient', () => {
  it('shows a continuation prompt after a completed debate and can leave unselected', async () => {
    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    expect(await screen.findByText('Continue debating this claim?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(mocks.joinMutate).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/claims');
  });

  it('rejoins the queue with the chosen position from the completed debate prompt', async () => {
    mocks.joinMutate.mockImplementation((_variables, options) => {
      options.onSuccess();
    });

    render(<DebateRoomPageClient spaceId="space-1" debateId="debate-1" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Yes' }));

    expect(mocks.joinMutate).toHaveBeenCalledWith(
      {
        claimId: 'claim-entity-1',
        request: {
          position: true,
        },
      },
      expect.any(Object)
    );
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith('/space/space-1/claims');
    });
  });
});

function completedDebate(): Debate {
  return {
    id: 'debate-1',
    claim: {
      id: 'debate-claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'The protocol should ship debates',
      description: null,
    },
    status: 'complete',
    room_name: 'geo-debate-debate-1',
    first_participant_slot: 1,
    current_turn_index: 0,
    current_speaker_slot: null,
    prepare_started_at: null,
    prepare_ends_at: null,
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
        user_id: 'user-a',
        profile_space_id: 'profile-a',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        joined_at: '2026-07-02T00:00:00.000Z',
      },
      {
        user_id: 'user-b',
        profile_space_id: 'profile-b',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        joined_at: '2026-07-02T00:00:00.000Z',
      },
    ],
    recordings: [],
    recording_error: null,
  };
}
