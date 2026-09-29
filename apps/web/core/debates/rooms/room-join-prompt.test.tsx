import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipantSummary, UpcomingDebateRoom } from '../api';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  opponent: null as DebateParticipantSummary | null,
  remainingMs: 8 * 60_000,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('./room-opponent', () => ({ useUpcomingRoomOpponent: () => mocks.opponent }));
vi.mock('../matchmaking/use-request-countdown', () => ({
  useRequestCountdown: () => ({ label: '', remainingMs: mocks.remainingMs, expired: mocks.remainingMs <= 0 }),
}));
vi.mock('~/design-system/avatar', () => ({ Avatar: () => <span data-testid="avatar" /> }));

const { DebateRoomJoinPrompt } = await import('./room-join-prompt');

const ALEX: DebateParticipantSummary = {
  user_id: 'user-alex',
  profile_space_id: 'space-alex',
  display_name: 'Alex',
  avatar_cid: null,
};

function room(overrides: Partial<UpcomingDebateRoom> = {}): UpcomingDebateRoom {
  return {
    room_id: 'room-1',
    starts_at: '2026-09-21T09:00:00.000Z',
    opens_at: '2026-09-21T08:50:00.000Z',
    joinable: true,
    due: false,
    others_present: false,
    rematch_session_id: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  mocks.push.mockReset();
  mocks.opponent = null;
  mocks.remainingMs = 8 * 60_000;
});

describe('DebateRoomJoinPrompt', () => {
  it('says the room is open, who it is with, and when it starts', () => {
    mocks.opponent = ALEX;
    render(<DebateRoomJoinPrompt room={room()} onNotNow={vi.fn()} />);

    expect(screen.getByText('Your debate room is open')).toBeInTheDocument();
    expect(screen.getByText(/^with Alex · Starts at .+ · in 8 min$/)).toBeInTheDocument();
  });

  it('says when the opponent has not arrived yet', () => {
    mocks.opponent = ALEX;
    render(<DebateRoomJoinPrompt room={room()} onNotNow={vi.fn()} />);

    expect(screen.getByText('Alex hasn’t joined yet')).toBeInTheDocument();
  });

  it('says when the opponent is already in the room', () => {
    mocks.opponent = ALEX;
    render(<DebateRoomJoinPrompt room={room({ others_present: true })} onNotNow={vi.fn()} />);

    expect(screen.getByText('Alex is in the room')).toBeInTheDocument();
  });

  it('says it is starting once the start has passed', () => {
    mocks.opponent = ALEX;
    render(<DebateRoomJoinPrompt room={room({ due: true })} onNotNow={vi.fn()} />);

    expect(screen.getByText('with Alex · Starting now')).toBeInTheDocument();
  });

  // The countdown can reach zero a poll before the server flips `due`.
  it('does not count down past the start while the server catches up', () => {
    mocks.remainingMs = 0;
    render(<DebateRoomJoinPrompt room={room()} onNotNow={vi.fn()} />);

    expect(screen.getByText(/Starting now$/)).toBeInTheDocument();
  });

  // Their name comes from the graph, which can lag or miss; the banner still has to make sense.
  it('stands in a generic name until the opponent is known', () => {
    render(<DebateRoomJoinPrompt room={room()} onNotNow={vi.fn()} />);

    expect(screen.getByText(/^with Your opponent · /)).toBeInTheDocument();
    expect(screen.getByText('Your opponent hasn’t joined yet')).toBeInTheDocument();
  });

  it('joins the room on Join and snoozes it on Not now', () => {
    const onNotNow = vi.fn();
    render(<DebateRoomJoinPrompt room={room()} onNotNow={onNotNow} />);

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onNotNow).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));
    expect(mocks.push).toHaveBeenCalledWith('/debate/room-1');
  });
});
