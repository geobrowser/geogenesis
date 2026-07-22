import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FeatureFlagId } from '~/core/state/feature-flags';

import type { Debate, DebateMatch } from './api';
import { defaultDebateFormatId } from './formats';
import { DebateMatchPrompt } from './match-prompt';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  currentUserId: vi.fn(),
  acceptMutate: vi.fn(),
  declineMutate: vi.fn(),
  featureFlags: {
    debateFormatSelector: false,
  } as Partial<Record<FeatureFlagId, boolean>>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('~/core/state/feature-flags', () => ({
  useFeatureFlag: (id: FeatureFlagId) => mocks.featureFlags[id] ?? false,
}));

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();

  return {
    ...actual,
    getCurrentGeoChatUserId: () => mocks.currentUserId(),
  };
});

vi.mock('./hooks', async importOriginal => {
  const actual = await importOriginal<typeof import('./hooks')>();

  return {
    ...actual,
    useAcceptDebateMatch: () => ({ mutate: mocks.acceptMutate, isPending: false, error: null }),
    useDeclineDebateMatch: () => ({ mutate: mocks.declineMutate, isPending: false, error: null }),
  };
});

beforeEach(() => {
  mocks.push.mockReset();
  mocks.currentUserId.mockReturnValue('user-for');
  mocks.acceptMutate.mockReset();
  mocks.declineMutate.mockReset();
  mocks.featureFlags = {
    debateFormatSelector: false,
  };
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
});

afterEach(() => {
  cleanup();
});

describe('DebateMatchPrompt', () => {
  it('opens a match modal and the first participant accepts with the default format', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.getByRole('dialog', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(screen.getByText('Debate request')).toBeInTheDocument();
    expect(screen.getByText('Bri makes an argument')).toBeInTheDocument();

    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith(
      { matchId: 'match-1', formatId: defaultDebateFormatId },
      expect.any(Object)
    );
  });

  it('lets the first participant choose a format when the feature flag is enabled', () => {
    mocks.featureFlags.debateFormatSelector = true;

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    fireEvent.change(screen.getByLabelText('Debate format'), { target: { value: 'extended-standard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith(
      { matchId: 'match-1', formatId: 'extended-standard' },
      expect.any(Object)
    );
  });

  it('renders participants as avatar and name without a per-participant menu or position pill', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    // The design shows only the avatar + name in the VS card — no "..." menu, no Yes/No pill.
    expect(screen.queryByRole('button', { name: 'More actions for You' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions for Bri' })).not.toBeInTheDocument();
    expect(screen.getByText('Bri')).toBeInTheDocument();
    expect(screen.queryByText('You chose Yes.')).not.toBeInTheDocument();
  });

  it('locks background scrolling while the match dialog is open', () => {
    const { unmount } = render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('hides the format selector from the second participant', () => {
    mocks.currentUserId.mockReturnValue('user-against');
    mocks.featureFlags.debateFormatSelector = true;

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.getByText('Debate format')).toBeInTheDocument();
    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith({ matchId: 'match-1', formatId: undefined }, expect.any(Object));
  });

  it('hides the format selector after the first participant has accepted', () => {
    mocks.featureFlags.debateFormatSelector = true;
    const acceptedMatch = match();
    acceptedMatch.participants[0]!.accepted = true;

    render(<DebateMatchPrompt spaceId="space-1" matches={[acceptedMatch]} />);

    expect(screen.getByText('Waiting for the other person')).toBeInTheDocument();
    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();
  });

  it('rejects the matched person for the question', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(mocks.declineMutate).toHaveBeenCalledWith('match-1', expect.any(Object));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves the first accepter into the debate once polling shows it exists', () => {
    mocks.featureFlags.debateFormatSelector = true;
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      options.onSuccess({
        match: {
          ...match(),
          participants: match().participants.map(participant =>
            participant.user_id === 'user-for' ? { ...participant, accepted: true } : participant
          ),
        },
        debate: null,
      });
    });

    const { rerender } = render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} debates={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.getByText('Waiting for the other person')).toBeInTheDocument();
    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();

    rerender(<DebateMatchPrompt spaceId="space-1" matches={[]} debates={[debate()]} />);

    expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1');
  });
});

function match(): DebateMatch {
  return {
    id: 'match-1',
    status: 'pending',
    claim: {
      id: 'claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'The protocol should ship debates',
      description: null,
    },
    participants: [
      {
        user_id: 'user-for',
        profile_space_id: 'profile-for',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        accepted: false,
      },
      {
        user_id: 'user-against',
        profile_space_id: 'profile-against',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        accepted: false,
      },
    ],
    turn_format_id: null,
    debate_id: null,
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
  };
}

function debate(): Debate {
  return {
    id: 'debate-1',
    claim: {
      id: 'claim-1',
      space_id: 'space-1',
      claim_entity_id: 'claim-entity-1',
      claim: 'The protocol should ship debates',
      description: null,
    },
    status: 'ready',
    room_name: 'geo-debate-debate-1',
    first_participant_slot: 1,
    current_turn_index: 0,
    current_speaker_slot: null,
    connecting_started_at: null,
    connecting_deadline_at: null,
    turn_started_at: null,
    turn_ends_at: null,
    preflight_ends_at: null,
    turn_format_id: 'quick-open',
    turn_durations_ms: [5000],
    created_at: '2026-07-02T00:00:00.000Z',
    started_at: null,
    completed_at: null,
    participants: [
      {
        user_id: 'user-for',
        profile_space_id: 'profile-for',
        display_name: 'Alex',
        avatar_cid: null,
        participant_slot: 1,
        position: true,
        position_label: 'Yes',
        joined_at: null,
        ready_at: null,
      },
      {
        user_id: 'user-against',
        profile_space_id: 'profile-against',
        display_name: 'Bri',
        avatar_cid: null,
        participant_slot: 2,
        position: false,
        position_label: 'No',
        joined_at: null,
        ready_at: null,
      },
    ],
    recordings: [],
    recording_error: null,
    cancellation_reason: null,
    recording_cancelled_at: null,
    recording_cancelled_by: null,
  };
}
