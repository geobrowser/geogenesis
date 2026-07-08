import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Debate, DebateMatch } from './api';
import { DebateMatchPrompt } from './match-prompt';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  currentUserId: vi.fn(),
  acceptMutate: vi.fn(),
  declineMutate: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
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
});

afterEach(() => {
  cleanup();
});

describe('DebateMatchPrompt', () => {
  it('opens a match modal and lets the first participant choose a format before accepting', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.getByRole('dialog', { name: 'The protocol should ship debates' })).toBeInTheDocument();
    expect(screen.getByText('Debate request')).toBeInTheDocument();
    expect(screen.getByText('Bri makes an argument')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Debate format'), { target: { value: 'extended-standard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith(
      { matchId: 'match-1', formatId: 'extended-standard' },
      expect.any(Object)
    );
  });

  it('shows a disabled block menu for the other participant only', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.queryByRole('button', { name: 'More actions for You' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Bri' }));

    const blockAction = screen.getByRole('menuitem', { name: 'Block Bri' });
    expect(blockAction).toBeDisabled();
  });

  it('hides the format selector from the second participant', () => {
    mocks.currentUserId.mockReturnValue('user-against');

    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.getByText('Debate format')).toBeInTheDocument();
    expect(screen.queryByLabelText('Debate format')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith({ matchId: 'match-1', formatId: undefined }, expect.any(Object));
  });

  it('rejects the matched person for the question', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    expect(mocks.declineMutate).toHaveBeenCalledWith('match-1', expect.any(Object));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves the first accepter into the debate once polling shows it exists', () => {
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
    prepare_started_at: null,
    prepare_ends_at: null,
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
      },
    ],
    recordings: [],
    recording_error: null,
  };
}
