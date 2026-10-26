import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateParticipantSummary, UpcomingDebateRoom } from '../api';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  opponent: null as DebateParticipantSummary | null,
  request: { request_id: 'request-1' } as { request_id: string } | undefined,
  now: Date.parse('2026-09-21T08:52:00.000Z'),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('./room-opponent', async importOriginal => ({
  ...(await importOriginal<typeof import('./room-opponent')>()),
  useUpcomingRoomOpponent: () => mocks.opponent,
  useUpcomingRoomRequest: () => mocks.request,
}));
vi.mock('../matchmaking/use-request-countdown', () => ({ useServerNow: () => mocks.now }));
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

function handlers() {
  return { onDismiss: vi.fn(), onNotice: vi.fn() };
}

afterEach(() => {
  cleanup();
  mocks.push.mockReset();
  mocks.opponent = null;
  mocks.request = { request_id: 'request-1' };
  mocks.now = Date.parse('2026-09-21T08:52:00.000Z');
});

describe('DebateRoomJoinPrompt', () => {
  // GEO-3133. A reminded lobby rides the same banner with its own copy.
  it('names a reminded lobby and offers Join lobby', () => {
    const { container } = render(
      <DebateRoomJoinPrompt room={room({ kind: 'lobby', name: 'Debate hour' })} {...handlers()} />
    );

    expect([...container.querySelectorAll('p')].map(line => line.textContent)).toEqual([
      'Debate hour is open',
      'A debate lobby you asked to be reminded of',
      'Scheduled in 8 mins',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Join lobby' }));
    expect(mocks.push).toHaveBeenCalledWith('/debate/room-1');
  });

  it('says the room is open, whether the opponent is in, then when it was scheduled', () => {
    mocks.opponent = ALEX;
    const { container } = render(<DebateRoomJoinPrompt room={room()} {...handlers()} />);

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
    render(<DebateRoomJoinPrompt room={room()} {...handlers()} />);

    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('Your debate room is open');
    expect(live).toHaveTextContent('Alex hasn’t joined yet');
    expect(live).not.toHaveTextContent('Scheduled in 8 mins');
    expect(screen.getByText('Scheduled in 8 mins')).toBeInTheDocument();
  });

  it('says when the opponent is already in the room', () => {
    mocks.opponent = ALEX;
    render(<DebateRoomJoinPrompt room={room({ others_present: true })} {...handlers()} />);

    expect(screen.getByText('Alex is waiting')).toBeInTheDocument();
  });

  it('counts up from the start once it has passed', () => {
    mocks.now = Date.parse('2026-09-21T09:03:30.000Z');
    render(<DebateRoomJoinPrompt room={room({ due: true })} {...handlers()} />);

    expect(screen.getByText('Scheduled for 3 mins ago')).toBeInTheDocument();
  });

  // Their name comes from the graph, which can lag or miss; the banner still has to make sense.
  it('stands in a generic name until the opponent is known', () => {
    render(<DebateRoomJoinPrompt room={room()} {...handlers()} />);

    expect(screen.getByText('Your opponent hasn’t joined yet')).toBeInTheDocument();
  });

  // `Avatar` renders a real photo `h-full w-full`, so the frame around it is the only thing holding
  // it to 36px. Unframed, an opponent's profile photo drew at full resolution across the page.
  it('holds the opponent photo to a clipped 36px circle', () => {
    mocks.opponent = { ...ALEX, avatar_cid: 'ipfs://photo' };
    render(<DebateRoomJoinPrompt room={room()} {...handlers()} />);

    const frame = screen.getByTestId('avatar').parentElement;
    expect(frame).toHaveClass('overflow-hidden', 'rounded-full');
    expect(frame).toHaveStyle({ width: '36px', height: '36px' });
  });

  it('joins the room on Join', () => {
    render(<DebateRoomJoinPrompt room={room()} {...handlers()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Join debate' }));
    expect(mocks.push).toHaveBeenCalledWith('/debate/room-1');
  });

  // GEO-3430. Hiding it said nothing to the person waiting, so a booked debate's banner has no Not
  // now: from the room opening, not only after the start.
  it.each([
    ['before the start', room()],
    ['after the start, with them waiting', room({ due: true, others_present: true })],
  ])('offers Join, Running late and Can’t make it, and no Not now, %s', (_when, row) => {
    mocks.now = Date.parse(row.due ? '2026-09-21T09:03:00.000Z' : '2026-09-21T08:52:00.000Z');
    render(<DebateRoomJoinPrompt room={row} {...handlers()} />);

    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      'Running late',
      'Can’t make it',
      'Join debate',
    ]);
  });

  it.each([
    ['Running late', 'late'],
    ['Can’t make it', 'cant'],
  ])('%s asks for its screen on the request that booked the room', (label, step) => {
    const props = handlers();
    render(<DebateRoomJoinPrompt room={room()} {...props} />);

    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(props.onNotice).toHaveBeenCalledWith({ requestId: 'request-1', step });
    expect(props.onDismiss).not.toHaveBeenCalled();
  });

  // There is no debate to name until the request list has it.
  it('holds Running late and Can’t make it until the request is read', () => {
    mocks.request = undefined;
    render(<DebateRoomJoinPrompt room={room()} {...handlers()} />);

    expect(screen.getByRole('button', { name: 'Running late' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Can’t make it' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join debate' })).toBeEnabled();
  });

  // Board 5 on a phone: Join full width over the other two, all a thumb's height. Measured in a real
  // browser; jsdom has no layout, so this only holds the classes that do it.
  it('lays the three actions out for a phone', () => {
    render(<DebateRoomJoinPrompt room={room()} {...handlers()} />);

    expect(screen.getByRole('button', { name: 'Join debate' })).toHaveClass('md:col-span-2', 'md:h-11');
    expect(screen.getByRole('button', { name: 'Running late' })).toHaveClass('md:h-11');
    expect(screen.getByRole('button', { name: 'Can’t make it' })).toHaveClass('md:h-11');
  });

  // Nobody is waiting on a lobby, so its reminder keeps Not now.
  it('keeps Not now on a reminded lobby', () => {
    const props = handlers();
    render(<DebateRoomJoinPrompt room={room({ kind: 'lobby', name: 'Debate hour' })} {...props} />);

    expect(screen.queryByRole('button', { name: 'Running late' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
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
