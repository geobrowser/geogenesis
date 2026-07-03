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
  it('opens a match modal and lets the for side choose a format before accepting', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    expect(screen.getByRole('dialog', { name: 'Bri wants to debate' })).toBeInTheDocument();
    expect(screen.getByText('Bri wants to debate')).toBeInTheDocument();

    fireEvent.click(screen.getByText('45/45 20/20'));
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    expect(mocks.acceptMutate).toHaveBeenCalledWith(
      { matchId: 'match-1', formatId: 'extended-open' },
      expect.any(Object)
    );
  });

  it('can be minimized and reopened', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Match found: Bri')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(screen.getByRole('dialog', { name: 'Bri wants to debate' })).toBeInTheDocument();
  });

  it('skips the matched person for ten minutes', () => {
    render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Skip this person for 10 min' }));

    expect(mocks.declineMutate).toHaveBeenCalledWith('match-1', expect.any(Object));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves the first accepter into the debate once polling shows it exists', () => {
    mocks.acceptMutate.mockImplementation((_variables, options) => {
      options.onSuccess({ match: { ...match(), for_accepted: true }, debate: null });
    });

    const { rerender } = render(<DebateMatchPrompt spaceId="space-1" matches={[match()]} debates={[]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    expect(screen.getByText('Waiting for the other person')).toBeInTheDocument();

    rerender(<DebateMatchPrompt spaceId="space-1" matches={[]} debates={[debate()]} />);

    expect(mocks.push).toHaveBeenCalledWith('/space/space-1/debates/debate-1');
  });
});

function match(): DebateMatch {
  return {
    id: 'match-1',
    status: 'pending',
    question: {
      id: 'question-1',
      space_id: 'space-1',
      question_entity_id: 'question-entity-1',
      question: 'Should the protocol ship debates?',
      description: null,
      side_labels: { for: 'Yes', against: 'No' },
    },
    for: {
      user_id: 'user-for',
      profile_space_id: 'profile-for',
      display_name: 'Alex',
      avatar_cid: null,
    },
    against: {
      user_id: 'user-against',
      profile_space_id: 'profile-against',
      display_name: 'Bri',
      avatar_cid: null,
    },
    for_accepted: false,
    against_accepted: false,
    turn_format_id: null,
    debate_id: null,
    created_at: '2026-07-02T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
  };
}

function debate(): Debate {
  return {
    id: 'debate-1',
    question: {
      id: 'question-1',
      space_id: 'space-1',
      question_entity_id: 'question-entity-1',
      question: 'Should the protocol ship debates?',
      description: null,
      side_labels: { for: 'Yes', against: 'No' },
    },
    status: 'ready',
    room_name: 'geo-debate-debate-1',
    first_side: 'for',
    current_turn_index: 0,
    current_speaker_side: null,
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
        side: 'for',
        joined_at: null,
      },
      {
        user_id: 'user-against',
        profile_space_id: 'profile-against',
        display_name: 'Bri',
        avatar_cid: null,
        side: 'against',
        joined_at: null,
      },
    ],
    recordings: [],
    recording_error: null,
  };
}
