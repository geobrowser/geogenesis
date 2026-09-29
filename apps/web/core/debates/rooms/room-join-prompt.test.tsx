import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipantSummary, UpcomingDebateRoom } from '../api';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  opponent: null as DebateParticipantSummary | null,
  now: Date.parse('2026-09-21T08:52:00.000Z'),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('./room-opponent', async importOriginal => ({
  ...(await importOriginal<typeof import('./room-opponent')>()),
  useUpcomingRoomOpponent: () => mocks.opponent,
}));
vi.mock('../matchmaking/use-request-countdown', () => ({ useServerClock: () => ({ now: () => mocks.now }) }));
vi.mock('~/design-system/avatar', () => ({ Avatar: () => <span data-testid="avatar" /> }));

const { DebateRoomJoinPrompt, scheduleLabel } = await import('./room-join-prompt');

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
  mocks.now = Date.parse('2026-09-21T08:52:00.000Z');
});

describe('DebateRoomJoinPrompt', () => {
  it('says the room is open, whether the opponent is in, then when it was scheduled', () => {
    mocks.opponent = ALEX;
    const { container } = render(<DebateRoomJoinPrompt room={room()} onNotNow={vi.fn()} />);

    const lines = container.querySelectorAll('p');
    expect([...lines].map(line => line.textContent)).toEqual([
      'Your debate room is open',
      'Alex hasn’t joined yet',
      'Scheduled in 8 mins',
    ]);
  });

  // The time line re-renders every minute; inside the live region a screen reader would read out
  // each tick for as long as the banner is up.
  it('announces the room and the arrival, but not the minute-by-minute time', () => {
    mocks.opponent = ALEX;
    render(<DebateRoomJoinPrompt room={room()} onNotNow={vi.fn()} />);

    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('Your debate room is open');
    expect(live).toHaveTextContent('Alex hasn’t joined yet');
    expect(live).not.toHaveTextContent('Scheduled in 8 mins');
    expect(screen.getByText('Scheduled in 8 mins')).toBeInTheDocument();
  });

  it('says when the opponent is already in the room', () => {
    mocks.opponent = ALEX;
    render(<DebateRoomJoinPrompt room={room({ others_present: true })} onNotNow={vi.fn()} />);

    expect(screen.getByText('Alex is waiting')).toBeInTheDocument();
  });

  it('counts up from the start once it has passed', () => {
    mocks.now = Date.parse('2026-09-21T09:03:30.000Z');
    render(<DebateRoomJoinPrompt room={room({ due: true })} onNotNow={vi.fn()} />);

    expect(screen.getByText('Scheduled for 3 mins ago')).toBeInTheDocument();
  });

  // Their name comes from the graph, which can lag or miss; the banner still has to make sense.
  it('stands in a generic name until the opponent is known', () => {
    render(<DebateRoomJoinPrompt room={room()} onNotNow={vi.fn()} />);

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

describe('scheduleLabel', () => {
  const MIN = 60_000;

  it.each([
    [8 * MIN, 'Scheduled in 8 mins'],
    // Rounded up, so it never claims "in 0 mins" while the start is still ahead.
    [30_000, 'Scheduled in 1 min'],
    [0, 'Starting now'],
    [-59_000, 'Starting now'],
    [-MIN, 'Scheduled for 1 min ago'],
    [-12.5 * MIN, 'Scheduled for 12 mins ago'],
  ])('%d ms to the start reads "%s"', (untilStartMs, expected) => {
    expect(scheduleLabel(untilStartMs)).toBe(expected);
  });

  it('says nothing for an unparseable start', () => {
    expect(scheduleLabel(NaN)).toBeNull();
  });
});
