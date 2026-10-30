import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PeerSchedule } from '~/core/availability/peer-schedule';

import { type DebateLobbyMember, GeoChatRequestError, type ScheduledDebateRequest } from '../api';
import { ResizeObserverStub } from '../resize-observer-fixtures';
import type { LobbyBooking } from './lobby-schedule';
import type { LobbyPageView } from './lobby-view';

const mocks = vi.hoisted(() => ({
  guest: false,
  phone: false,
  viewerId: 'me' as string | null,
  schedule: undefined as PeerSchedule | undefined,
  requests: [] as ScheduledDebateRequest[],
  cancel: vi.fn(),
  queue: vi.fn(),
  cancelQueue: vi.fn(),
  signIn: vi.fn(),
  queued: null as null | { ready: boolean; run: (intent: string, replay: { isCurrent: () => boolean }) => void },
  booking: null as null | { userId: string; initialSelectedStart?: string; entry?: string; onClose: () => void },
}));
vi.mock('../hooks', () => ({
  usePeerSchedule: () => ({ schedule: mocks.schedule, isPending: false, isError: false }),
}));
vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: { requests: mocks.requests } }),
  useCancelScheduledDebate: () => ({ mutate: mocks.cancel, isPending: false }),
}));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => mocks.viewerId }));
vi.mock('./lobby-guest-hooks', () => ({ useIsLobbyGuest: () => mocks.guest }));
vi.mock('./lobby-guest-sign-in', () => ({ useLobbyGuestSignIn: () => mocks.signIn, lobbyAuthPage: () => ({}) }));
vi.mock('~/core/hooks/use-is-phone-layout', () => ({ useIsPhoneLayout: () => mocks.phone }));
vi.mock('~/core/state/pending-actions', () => ({
  useQueuedAction: (options: typeof mocks.queued) => {
    mocks.queued = options;
    return { queue: mocks.queue, cancel: mocks.cancelQueue };
  },
}));
vi.mock('~/partials/availability/peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: (props: NonNullable<typeof mocks.booking> & { open: boolean }) => {
    mocks.booking = props.open ? props : null;
    return props.open ? (
      <div role="dialog" aria-label="Booking confirmation">
        Confirm your request
      </div>
    ) : null;
  },
}));
vi.mock('./lobby-request-debate', () => ({
  canRequestLobbyMember: (member: DebateLobbyMember, viewerId: string | null) =>
    viewerId && !member.in_debate && member.user_id !== viewerId,
  LobbyRequestDebate: () => <button>Request a debate</button>,
}));
vi.mock('~/core/debates/browse/use-open-debater-profile', () => ({ useOpenDebaterProfile: () => vi.fn() }));

const { LobbyPersonMenu } = await import('./lobby-person-menu');
const { LobbyScheduleProvider } = await import('./lobby-schedule');

const member: DebateLobbyMember = {
  user_id: 'peer',
  profile_space_id: 'peer-space',
  display_name: 'Priya',
  avatar_cid: null,
  role: 'speaker',
  creator: false,
  acting_host: false,
  on_roster_since: '',
  stepped_out: false,
  in_debate: false,
};
const lobby = {
  lobby_id: 'lobby',
  members: [member],
  viewer: { kind: 'member', role: 'speaker', hosting: false, creator: false },
} as LobbyPageView;

function menu(self = false, debating = false) {
  return (
    <LobbyScheduleProvider lobby={lobby}>
      <LobbyPersonMenu
        lobby={lobby}
        member={{ ...member, in_debate: debating }}
        viewerId={mocks.viewerId}
        isSelf={self}
        disagreements={3}
      >
        <button>Open Priya</button>
      </LobbyPersonMenu>
    </LobbyScheduleProvider>
  );
}

window.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

beforeEach(() => {
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
  mocks.guest = false;
  mocks.viewerId = 'me';
  mocks.phone = false;
  mocks.requests = [];
  mocks.booking = null;
  mocks.schedule = {
    userId: 'peer',
    viewerTimezone: 'UTC',
    peerTimezone: 'UTC',
    viewerHasSchedule: true,
    peerHasSchedule: true,
    theirWeekKnown: true,
    slots: [
      { start: '2026-10-23T15:00:00Z', end: '2026-10-23T16:00:00Z', viewerIsFree: true },
      { start: '2026-10-24T15:00:00Z', end: '2026-10-24T16:00:00Z', viewerIsFree: false },
    ],
  };
  vi.clearAllMocks();
  mocks.cancel.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('scheduling from a lobby person menu', () => {
  it.each([false, true])('hands off a picked time to confirmation with phone=%s, without sending', async phone => {
    mocks.phone = phone;
    render(menu());
    fireEvent.click(screen.getByRole('button', { name: 'Open Priya' }));
    const chips = screen.getAllByRole('button', { name: /Schedule a debate with Priya/ });
    expect(chips[0]).toHaveAttribute('data-viewer-free', 'true');
    expect(chips[1]).not.toHaveAttribute('data-viewer-free');
    if (phone) expect(chips[0].className).toContain('md:min-h-11');
    fireEvent.click(chips[0]);
    await screen.findByRole('dialog', { name: 'Booking confirmation' });
    expect(mocks.booking).toMatchObject({
      userId: 'peer',
      initialSelectedStart: '2026-10-23T15:00:00.000Z',
      entry: 'lobby_time',
    });
    expect(screen.queryByTestId('lobby-person-card')).toBeNull();
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it('opens More times without selecting a slot', async () => {
    render(menu());
    fireEvent.click(screen.getByText('Open Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'More times for Priya' }));
    await waitFor(() =>
      expect(mocks.booking).toMatchObject({ entry: 'lobby_more_times', initialSelectedStart: undefined })
    );
  });

  it('offers the booking fallback when they have no availability', async () => {
    mocks.schedule = { ...mocks.schedule!, peerHasSchedule: false, slots: [] };
    render(menu());
    fireEvent.click(screen.getByText('Open Priya'));
    expect(screen.getByText('Priya hasn’t set any availability yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ask for a time' }));
    await screen.findByRole('dialog');
    expect(mocks.booking?.entry).toBe('lobby_schedule');
  });

  it('keeps scheduling for someone in a debate and omits it from your own menu', () => {
    const view = render(menu(false, true));
    fireEvent.click(screen.getByText('Open Priya'));
    expect(screen.getByRole('region', { name: 'Schedule for later' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request a debate' })).toBeNull();
    view.unmount();
    render(menu(true));
    fireEvent.click(screen.getByText('Open Priya'));
    expect(screen.queryByRole('region', { name: 'Schedule for later' })).toBeNull();
  });

  it('reopens a pending outgoing request and cancels through the existing mutation', () => {
    mocks.requests = [
      {
        request_id: 'request',
        status: 'pending',
        room_id: null,
        proposed_by_user_id: 'me',
        viewer_must_answer: false,
        scheduled_start_at: '2026-10-24T15:00:00Z',
        participants: [{ user_id: 'me' }, { user_id: 'peer' }],
      } as ScheduledDebateRequest,
    ];
    render(menu());
    fireEvent.click(screen.getByText('Open Priya'));
    expect(screen.getByText(/Requested/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(screen.getByText('Cancel your request to Priya?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(mocks.cancel).toHaveBeenCalledWith({ requestId: 'request' }, expect.anything());
  });

  it.each(['Asia/Tokyo', 'Pacific/Honolulu'])(
    'keeps pending request and chip labels in the same %s timezone',
    timezone => {
      mocks.schedule = { ...mocks.schedule!, viewerTimezone: timezone };
      const start = mocks.schedule.slots[0].start;
      mocks.requests = [
        {
          request_id: 'request',
          status: 'pending',
          room_id: null,
          proposed_by_user_id: 'me',
          viewer_must_answer: false,
          scheduled_start_at: start,
          participants: [{ user_id: 'me' }, { user_id: 'peer' }],
        } as ScheduledDebateRequest,
      ];
      render(menu());
      fireEvent.click(screen.getByText('Open Priya'));
      const chip = screen.getAllByRole('button', { name: /Schedule a debate with Priya/ })[0];
      expect(screen.getByText(/^Requested /)).toHaveTextContent(`Requested ${chip.textContent}`);
    }
  );

  it('clears the open booking when the account changes, including switching back', async () => {
    const view = render(menu());
    fireEvent.click(screen.getByText('Open Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'More times for Priya' }));
    await screen.findByRole('dialog', { name: 'Booking confirmation' });
    mocks.viewerId = 'someone-else';
    view.rerender(menu());
    expect(screen.queryByRole('dialog', { name: 'Booking confirmation' })).toBeNull();
    mocks.viewerId = 'me';
    view.rerender(menu());
    expect(screen.queryByRole('dialog', { name: 'Booking confirmation' })).toBeNull();
  });

  it('updates time chips as the minute passes while a menu remains open', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
    mocks.phone = true;
    mocks.schedule = {
      ...mocks.schedule!,
      slots: [{ start: '2026-10-22T12:01:00Z', end: '2026-10-22T13:00:00Z', viewerIsFree: true }],
    };
    render(menu());
    fireEvent.click(screen.getByText('Open Priya'));
    const first = screen.getByRole('button', { name: /Schedule a debate with Priya/ }).textContent;
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole('button', { name: /Schedule a debate with Priya/ }).textContent).not.toBe(first);
  });

  it('uses the shared cancellation refusal message', () => {
    mocks.cancel.mockImplementation((_vars, options) =>
      options.onError(new GeoChatRequestError('already started', 'debate_already_started', 409))
    );
    mocks.requests = [
      {
        request_id: 'request',
        status: 'pending',
        room_id: null,
        proposed_by_user_id: 'me',
        viewer_must_answer: false,
        scheduled_start_at: '2026-10-24T15:00:00Z',
        participants: [{ user_id: 'me' }, { user_id: 'peer' }],
      } as ScheduledDebateRequest,
    ];
    render(menu());
    fireEvent.click(screen.getByText('Open Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(screen.getByText('This debate has already started, so it can no longer be cancelled.')).toBeInTheDocument();
  });

  it('queues the booking across signup, then opens confirmation instead of sending', async () => {
    mocks.guest = true;
    mocks.viewerId = null;
    const view = render(menu());
    fireEvent.click(screen.getByText('Open Priya'));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to schedule' }));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalled());
    expect(screen.queryByTestId('lobby-person-card')).toBeNull();
    expect(mocks.booking).toBeNull();
    expect(mocks.queued?.ready).toBe(false);
    const intent = mocks.queue.mock.calls[0][0] as string;
    expect(JSON.parse(intent)).toMatchObject({
      userId: 'peer',
      entry: 'lobby_schedule',
    } satisfies Partial<LobbyBooking>);
    expect(mocks.signIn.mock.calls[0][1]).toEqual({ onCancel: mocks.cancelQueue });
    mocks.guest = false;
    mocks.viewerId = 'me';
    view.rerender(menu());
    expect(mocks.queued?.ready).toBe(true);
    act(() => mocks.queued!.run(intent, { isCurrent: () => true }));
    expect(screen.getByRole('dialog', { name: 'Booking confirmation' })).toBeInTheDocument();
  });
});
