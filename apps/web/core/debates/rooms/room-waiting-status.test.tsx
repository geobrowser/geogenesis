import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DebateRoomView, GeoChatRequestError } from '../api';
import type { DebateRoomPresence } from './room-presence';
import { RoomWaitingStatus } from './room-waiting-status';

// GEO-3428, boards 6 and 6b: the waiting debater's card.

const state = vi.hoisted(() => ({
  room: null as unknown,
  presence: null as unknown,
  nudge: { mutate: vi.fn(), isPending: false, error: null as unknown },
}));
vi.mock('./room-context', () => ({
  useDebateRoomContext: () => ({ roomId: 'room-1', room: state.room, presence: state.presence }),
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'maya' }));
// The card reads geo-chat's clock; `serverAhead` puts it ahead of this machine's.
const clock = vi.hoisted(() => ({ serverAhead: 0 }));
vi.mock('../matchmaking/use-request-countdown', () => ({ useServerNow: () => Date.now() + clock.serverAhead }));
vi.mock('./scheduling-hooks', () => ({
  useNudgeDebateRoom: () => state.nudge,
  useScheduledDebates: () => ({
    data: { requests: [{ request_id: 'req-1', status: 'accepted', room_id: 'room-1', participants: [] }] },
  }),
}));
vi.mock('~/partials/availability/peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: () => <div data-testid="week" />,
}));

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function baseRoom(): DebateRoomView {
  return {
    room_id: 'room-1',
    access: { status: 'admitted' },
    starts_at: minutesAgo(5),
    opens_at: minutesAgo(15),
    scheduled_end_at: null,
    participants: ['maya', 'jordan'],
    occupants: ['maya'],
    waiting: { reason: 'opponent_late' },
    rematch_session_id: 'session-1',
    notices: [],
    reminders: [
      { user_id: 'jordan', kind: 'room_open', at: minutesAgo(15) },
      { user_id: 'jordan', kind: 'opponent_waiting', at: minutesAgo(4) },
    ],
    nudges: [],
    presence: [{ user_id: 'jordan', online: false, last_online_at: minutesAgo(12) }],
    viewer_next_nudge_at: minutesAgo(5),
  };
}

const waiting: DebateRoomPresence = { state: 'waiting', opponentUserId: 'jordan', opponentPresent: false };

function show() {
  render(<RoomWaitingStatus opponentName="Jordan" viewerName="Maya" />);
}

afterEach(() => {
  cleanup();
  clock.serverAhead = 0;
  state.nudge = { mutate: vi.fn(), isPending: false, error: null };
});

describe('RoomWaitingStatus', () => {
  it('says they have not joined, when they were last on Geo, and what we sent them', () => {
    state.room = baseRoom();
    state.presence = waiting;
    show();

    expect(screen.getByText('Jordan hasn’t joined yet')).toBeInTheDocument();
    expect(screen.getByText('Last online 12 minutes ago')).toBeInTheDocument();
    expect(screen.getByText('Room opened. We emailed Jordan.')).toBeInTheDocument();
    expect(screen.getByText('Jordan hadn’t joined. We emailed again: “Maya is waiting for you”.')).toBeInTheDocument();
  });

  it('says Online now while they are on Geo, and nothing else about what they are doing', () => {
    state.room = { ...baseRoom(), presence: [{ user_id: 'jordan', online: true, last_online_at: null }] };
    state.presence = waiting;
    show();
    expect(screen.getByText('Online now')).toBeInTheDocument();
    expect(screen.queryByText(/Last online/)).not.toBeInTheDocument();
  });

  it('nudges, then reads Nudged and cannot be pressed, with the nudge in the timeline', async () => {
    state.room = baseRoom();
    state.presence = waiting;
    show();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Nudge' }));
    expect(state.nudge.mutate).toHaveBeenCalledTimes(1);

    cleanup();
    state.room = {
      ...baseRoom(),
      nudges: [{ from_user_id: 'maya', to_user_id: 'jordan', channel: 'email', at: minutesAgo(0) }],
      viewer_next_nudge_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    show();
    expect(screen.getByRole('button', { name: 'Nudged' })).toBeDisabled();
    expect(screen.getByText('You nudged Jordan by email.')).toBeInTheDocument();
  });

  it('says which one was sent when it was a popup', () => {
    state.room = {
      ...baseRoom(),
      nudges: [{ from_user_id: 'maya', to_user_id: 'jordan', channel: 'popup', at: minutesAgo(1) }],
      viewer_next_nudge_at: null,
    };
    state.presence = waiting;
    show();
    expect(screen.getByText('You nudged Jordan on Geo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nudged' })).toBeDisabled();
  });

  it('says so when the nudge was refused because they just came in', () => {
    state.room = baseRoom();
    state.presence = waiting;
    state.nudge.error = new GeoChatRequestError('here', 'already_here', 409);
    show();
    expect(screen.getByText('Jordan just came in.')).toBeInTheDocument();
  });

  // Leave is the room's own button in the viewer's card, not a second one here.
  it('offers Reschedule in the other debater’s week, and no second Leave', async () => {
    state.room = baseRoom();
    state.presence = waiting;
    show();
    expect(screen.queryByRole('button', { name: 'Leave' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reschedule' }));
    expect(screen.getByTestId('week')).toBeInTheDocument();
  });

  // Board 6b: the late notice in their video slot has how late and Reschedule.
  it('after Running late keeps the timeline, with nobody to nudge', () => {
    state.room = {
      ...baseRoom(),
      notices: [
        { user_id: 'jordan', kind: 'running_late', at: minutesAgo(2), expected_at: minutesAgo(-8), note: null },
      ],
    };
    state.presence = {
      ...waiting,
      opponentLate: { minutes: 10, expectedAt: minutesAgo(-8), note: null },
    };
    show();
    expect(screen.getByText('Jordan said they’re running late.')).toBeInTheDocument();
    expect(screen.queryByText('Jordan hasn’t joined yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nudge/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
  });

  // The pill says "Jordan left"; the card must not say they never came.
  it('drops the heading after they came and left, keeping the rest', () => {
    state.room = baseRoom();
    state.presence = { ...waiting, state: 'left' };
    show();
    expect(screen.queryByText('Jordan hasn’t joined yet')).not.toBeInTheDocument();
    expect(screen.getByText('Last online 12 minutes ago')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nudge' })).toBeEnabled();
  });

  // `viewer_next_nudge_at` is geo-chat's time, so it is compared with geo-chat's clock.
  it('reads Nudge readiness on the server clock, not this machine’s', () => {
    state.room = { ...baseRoom(), viewer_next_nudge_at: new Date(Date.now() + 2 * 60_000).toISOString() };
    state.presence = waiting;
    show();
    expect(screen.getByRole('button', { name: 'Nudge' })).toBeDisabled();
    cleanup();

    clock.serverAhead = 3 * 60_000;
    show();
    expect(screen.getByRole('button', { name: 'Nudge' })).toBeEnabled();
  });

  // Running late leaves nothing for the footer: the late notice has Reschedule.
  it('draws no footer row after Running late', () => {
    state.room = baseRoom();
    state.presence = { ...waiting, opponentLate: { minutes: 10, expectedAt: minutesAgo(-8), note: null } };
    show();
    expect(screen.getByTestId('room-waiting-status').querySelectorAll('button')).toHaveLength(0);
    expect(screen.getByTestId('room-waiting-status').lastElementChild?.tagName).toBe('OL');
  });

  // Before the first nudge, the start: the room poll can show the card a few seconds early.
  it('says Nudge, not Nudged, before the viewer has sent one', () => {
    state.room = { ...baseRoom(), viewer_next_nudge_at: new Date(Date.now() + 5_000).toISOString() };
    state.presence = waiting;
    show();
    expect(screen.getByRole('button', { name: 'Nudge' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Nudged' })).not.toBeInTheDocument();
  });

  it('says so when they cannot be reached at all', () => {
    state.room = baseRoom();
    state.presence = waiting;
    state.nudge.error = new GeoChatRequestError('no way', 'cant_reach', 409);
    show();
    expect(
      screen.getByText('Jordan isn’t on Geo and has no email we can use, so we can’t nudge them.')
    ).toBeInTheDocument();
  });

  // Between a nudge and the room's refetch, the endpoint's answer holds the button.
  it('reads Nudged from the nudge’s own answer before the room catches up', () => {
    state.room = baseRoom();
    state.presence = waiting;
    (state.nudge as { data?: unknown }).data = {
      channel: 'email',
      at: minutesAgo(0),
      next_nudge_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    show();
    expect(screen.getByRole('button', { name: 'Nudged' })).toBeDisabled();
  });

  it('is not shown before the start or once they are here', () => {
    state.room = baseRoom();
    for (const s of ['arrived_early', 'present'] as const) {
      state.presence = { ...waiting, state: s };
      show();
      expect(screen.queryByTestId('room-waiting-status')).not.toBeInTheDocument();
      cleanup();
    }
  });
});
