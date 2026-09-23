import '@testing-library/jest-dom/vitest';
import { cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ScheduledDebateRequest, UpcomingDebateRoom } from '~/core/debates/api';
import { NavUtils } from '~/core/utils/utils';

const mocks = vi.hoisted(() => ({
  respond: vi.fn(),
  pending: false,
  viewerId: 'user-me' as string | null,
  people: [] as { user_id: string; profile_space_id: string; display_name: string | null; avatar_cid: string | null }[],
  requests: [] as ScheduledDebateRequest[],
  rooms: [] as UpcomingDebateRoom[],
  requestsError: null as Error | null,
  roomsError: null as Error | null,
}));

const ADA = {
  user_id: 'user-them',
  profile_space_id: '019fedae-72b6-7ab2-927a-df044d57c566',
  display_name: 'Ada',
  avatar_cid: null,
};

vi.mock('~/core/debates/rooms/scheduling-hooks', () => ({
  useRespondToScheduledDebate: () => ({ mutate: mocks.respond, isPending: mocks.pending }),
  useScheduledDebates: () => ({ data: { requests: mocks.requests }, error: mocks.requestsError }),
}));

vi.mock('~/core/debates/rooms/hooks', () => ({
  useUpcomingDebateRooms: () => ({ data: { rooms: mocks.rooms }, error: mocks.roomsError }),
}));

vi.mock('./hooks', () => ({
  useDebatePeople: () => ({ data: { people: mocks.people } }),
}));

vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => mocks.viewerId,
}));

const { ScheduledDebatesSection, useScheduledContent } = await import('./scheduled-debates-section');

const request = (overrides: Partial<ScheduledDebateRequest> = {}): ScheduledDebateRequest => ({
  request_id: 'request-1',
  status: 'pending',
  scheduled_start_at: '2026-09-24T13:00:00Z',
  scheduled_end_at: '2026-09-24T13:30:00Z',
  invited_by_user_id: 'user-them',
  created_by_admin: false,
  proposed_by_user_id: 'user-them',
  reschedule_count: 0,
  room_id: null,
  participants: [
    { user_id: 'user-me', accepted: true },
    { user_id: 'user-them', accepted: null },
  ],
  viewer_must_answer: true,
  ...overrides,
});

const room = (overrides: Partial<UpcomingDebateRoom> = {}): UpcomingDebateRoom => ({
  room_id: 'room-1',
  starts_at: '2026-09-24T13:00:00Z',
  opens_at: '2026-09-24T12:50:00Z',
  joinable: true,
  due: false,
  others_present: false,
  ...overrides,
});

const setup = (content: {
  answerable?: ScheduledDebateRequest[];
  upcoming?: { room: UpcomingDebateRoom; opponentUserId: string | null }[];
  requestsError?: Error | null;
  roomsError?: Error | null;
}) => ({
  user: userEvent.setup(),
  ...render(
    <ScheduledDebatesSection
      content={{
        answerable: content.answerable ?? [],
        upcoming: content.upcoming ?? [],
        requestsError: content.requestsError ?? null,
        roomsError: content.roomsError ?? null,
      }}
    />
  ),
});

const upcomingRow = (overrides: Partial<UpcomingDebateRoom> = {}, opponentUserId: string | null = 'user-them') => ({
  room: room(overrides),
  opponentUserId,
});

afterEach(() => {
  cleanup();
  mocks.respond = vi.fn();
  mocks.pending = false;
  mocks.viewerId = 'user-me';
  mocks.people = [];
  mocks.requests = [];
  mocks.rooms = [];
  mocks.requestsError = null;
  mocks.roomsError = null;
});

describe('answering in the tab', () => {
  it('renders nothing when there is nothing scheduled', () => {
    const { container } = setup({});
    expect(container).toBeEmptyDOMElement();
  });

  it('accepts a request pointed at the viewer', async () => {
    const { user } = setup({ answerable: [request()] });

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(mocks.respond).toHaveBeenCalledTimes(1);
    expect(mocks.respond.mock.calls[0][0]).toEqual({ requestId: 'request-1', accepted: true });
  });

  it('offers no answer on one the viewer is not holding up', () => {
    setup({ answerable: [request({ viewer_must_answer: false })] });

    expect(screen.getByText('Waiting on their answer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it('reports a clash, which is a refusal rather than a failure', async () => {
    mocks.respond = vi.fn((_vars, options) =>
      options.onSuccess({ outcome: 'conflict', conflicting_start_at: '2026-09-24T13:00:00Z' })
    );
    const { user } = setup({ answerable: [request()] });

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(screen.getByText(/That clashes with a debate/)).toBeInTheDocument();
  });

  it('reports a rejected answer rather than looking inert', async () => {
    mocks.respond = vi.fn((_vars, options) => options.onError(new Error('Already answered.')));
    const { user } = setup({ answerable: [request()] });

    await user.click(screen.getByRole('button', { name: 'Decline' }));

    expect(screen.getByText('Already answered.')).toBeInTheDocument();
  });
});

describe('joining from the tab', () => {
  // The tab carries what the popup carries, since the popup can be dismissed.
  it('offers the way in, and says who is already there', () => {
    mocks.people = [ADA];
    setup({ upcoming: [upcomingRow({ others_present: true, due: true })] });

    expect(screen.getByText('Ada is waiting for you now')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Join debate' })).toHaveAttribute('href', '/debate/room-1');
  });

  it('says when a shut room opens rather than offering a dead link', () => {
    setup({ upcoming: [upcomingRow({ joinable: false })] });

    expect(screen.getByText(/^Opens at/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Join debate' })).not.toBeInTheDocument();
  });
});


describe('naming the other person', () => {
  it('links a resolved opponent to their profile', () => {
    mocks.people = [ADA];
    setup({ answerable: [request()] });

    expect(screen.getByRole('link', { name: 'Ada' })).toHaveAttribute('href', NavUtils.toSpace(ADA.profile_space_id));
  });

  it('falls back to a bare label when the roster does not have them', () => {
    setup({ answerable: [request()] });

    expect(screen.getByText('Your opponent')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Your opponent' })).not.toBeInTheDocument();
  });

  it('never reads the viewer as their own opponent', () => {
    mocks.people = [ADA, { ...ADA, user_id: 'user-me', display_name: 'Me' }];
    mocks.viewerId = 'user-me';
    setup({ answerable: [request()] });

    expect(screen.queryByText('Me')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ada' })).toBeInTheDocument();
  });
});


describe('pairing a room with the request that booked it', () => {
  // geo-chat sends the room's id dashless and the request's dashed, so a literal compare misses.
  it('matches across the two uuid spellings', () => {
    const dashed = '1f14c588-e233-41d7-81df-1287edd8d4f0';
    mocks.requests = [request({ status: 'accepted', room_id: dashed, viewer_must_answer: false })];
    mocks.rooms = [room({ room_id: dashed.replace(/-/g, '') })];

    const { result } = renderHook(() => useScheduledContent(true));

    expect(result.current.upcoming).toHaveLength(1);
    expect(result.current.upcoming[0].opponentUserId).toBe('user-them');
  });

  it('leaves the opponent unknown when no request owns the room', () => {
    mocks.rooms = [room()];

    const { result } = renderHook(() => useScheduledContent(true));

    expect(result.current.upcoming[0].opponentUserId).toBeNull();
  });

  it('keeps an accepted request out of the answerable list', () => {
    mocks.requests = [request({ status: 'accepted', room_id: 'room-1' })];

    const { result } = renderHook(() => useScheduledContent(true));

    expect(result.current.answerable).toHaveLength(0);
  });
});


describe('a schedule that could not be read', () => {
  // An unread schedule drawn as an empty one tells someone with a debate in four minutes that
  // they have nothing on.
  it('says so rather than rendering as nothing scheduled', () => {
    setup({ requestsError: new Error('Service unavailable.') });

    expect(screen.getByText(/Could not read your scheduled debates: Service unavailable./)).toBeInTheDocument();
  });

  it('reports a failed room read too, not only a failed request read', () => {
    mocks.roomsError = new Error('Rooms are down.');

    const { result } = renderHook(() => useScheduledContent(true));

    expect(result.current.roomsError?.message).toBe('Rooms are down.');
    expect(result.current.requestsError).toBeNull();
  });

  // One read failing must not take the other's rows with it: a joinable room is the most
  // time-critical thing this tab shows.
  it('still offers an open room when the request read failed', () => {
    setup({ upcoming: [upcomingRow()], requestsError: new Error('Requests are down.') });

    expect(screen.getByRole('link', { name: 'Join debate' })).toBeInTheDocument();
    expect(screen.getByText(/Could not read your scheduled debates/)).toBeInTheDocument();
  });

  it('still offers Accept when the room read failed', () => {
    setup({ answerable: [request()], roomsError: new Error('Rooms are down.') });

    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(screen.getByText(/Could not read your upcoming debates/)).toBeInTheDocument();
  });
});
