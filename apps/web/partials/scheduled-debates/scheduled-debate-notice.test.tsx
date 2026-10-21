import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

import { ScheduledDebateNoticeDialog } from './scheduled-debate-notice';

const REQUEST = '6676b145-0970-4c1c-bfbc-7497d9721b39';
const VIEWER = 'aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa';
const MAYA = 'bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb';

type Mutation = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: unknown;
  data?: unknown;
};
const idle = (): Mutation => ({ mutate: vi.fn(), isPending: false, isSuccess: false, isError: false, error: null });

const state = vi.hoisted(() => ({
  requests: { data: undefined, isPending: false, isError: false } as {
    data?: { requests: unknown[] };
    isPending: boolean;
    isError: boolean;
  },
  rooms: { data: { rooms: [] as unknown[] } },
  late: null as unknown as Mutation,
  cant: null as unknown as Mutation,
  viewerName: 'Jordan' as string | null,
}));

vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => ({ authenticated: true, ready: true }) }));
vi.mock('~/core/debates/rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => state.requests,
  useReportRunningLate: () => state.late,
  useCantMakeIt: () => state.cant,
}));
vi.mock('~/core/debates/rooms/hooks', () => ({ useUpcomingDebateRooms: () => state.rooms }));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => VIEWER }));
vi.mock('~/core/debates/matchmaking/use-geo-chat-user-summaries', () => ({
  useGeoChatUserSummaries: (ids: string[]) =>
    [
      { user_id: MAYA, profile_space_id: 'maya-space', display_name: 'Maya', avatar_cid: null },
      { user_id: VIEWER, profile_space_id: 'jordan-space', display_name: state.viewerName, avatar_cid: null },
    ].filter(person => ids.includes(person.user_id)),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('~/partials/availability/peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: ({
    rescheduleRequestId,
    rescheduleNote,
    userId,
  }: {
    rescheduleRequestId: string;
    rescheduleNote?: string;
    userId: string;
  }) => (
    <div data-testid="week" data-request={rescheduleRequestId} data-note={rescheduleNote ?? ''} data-user={userId} />
  ),
}));

function agreed(overrides: Record<string, unknown> = {}) {
  return {
    request_id: REQUEST.replace(/-/g, ''),
    status: 'accepted',
    scheduled_start_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    scheduled_end_at: new Date(Date.now() + 27 * 60_000).toISOString(),
    room_id: 'room-1',
    participants: [
      { user_id: VIEWER, accepted: true },
      { user_id: MAYA, accepted: true },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  state.requests = { data: { requests: [agreed()] }, isPending: false, isError: false };
  state.rooms = {
    data: { rooms: [{ room_id: 'room-1', joinable: true, due: true, others_present: true }] },
  };
  state.late = idle();
  state.cant = idle();
  state.viewerName = 'Jordan';
});

afterEach(cleanup);

/** A mutation whose `mutate` succeeds at once with `data`, calling the per-call `onSuccess`. */
function succeedWith(mutation: Mutation, data: unknown) {
  mutation.mutate.mockImplementation((_variables: unknown, options?: { onSuccess?: (result: unknown) => void }) =>
    options?.onSuccess?.(data)
  );
}

function renderOpen(step: 'decide' | 'late' | 'cant') {
  return render(<ScheduledDebateNoticeDialog open requestId={REQUEST} initialStep={step} onClose={vi.fn()} />);
}

function open(step: 'decide' | 'late' | 'cant', onReschedule?: () => void) {
  const onClose = vi.fn();
  render(
    <ScheduledDebateNoticeDialog
      open
      requestId={REQUEST}
      initialStep={step}
      onClose={onClose}
      onReschedule={onReschedule}
    />
  );
  return { onClose };
}

describe('ScheduledDebateNoticeDialog', () => {
  // A mail scanner opening the link must not mark anyone late or cancel anything.
  it('sends nothing on opening, whichever screen it lands on', () => {
    for (const step of ['decide', 'late', 'cant'] as const) {
      open(step);
      cleanup();
    }
    expect(state.late.mutate).not.toHaveBeenCalled();
    expect(state.cant.mutate).not.toHaveBeenCalled();
  });

  describe('decide (the reschedule link once the room is open)', () => {
    it('offers Join now, Running late and Can’t make it, and says Maya is waiting', () => {
      open('decide', vi.fn());

      expect(screen.getByText('Your debate with Maya started 3 minutes ago')).toBeInTheDocument();
      expect(screen.getByText('Maya is in the room, waiting for you')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Join now' })).toHaveAttribute('href', '/debate/room-1');
      expect(screen.getByRole('button', { name: 'I’m running late' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'I can’t make it' })).toBeInTheDocument();
    });

    it('keeps the calendar reachable', async () => {
      const onReschedule = vi.fn();
      open('decide', onReschedule);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Reschedule instead' }));
      expect(onReschedule).toHaveBeenCalled();
    });

    it('moves on to the choice that was pressed', async () => {
      open('decide', vi.fn());
      await userEvent.setup().click(screen.getByRole('button', { name: 'I’m running late' }));
      expect(screen.getByRole('heading')).toHaveTextContent('How late will you be?');
    });
  });

  describe('running late', () => {
    it('sends the picked minutes and the note, trimmed, on the confirm press', async () => {
      const user = userEvent.setup();
      open('late');

      expect(screen.getByRole('radio', { name: '10 min' })).toBeChecked();
      await user.click(screen.getByRole('radio', { name: '15 min' }));
      await user.type(screen.getByLabelText('Add a note for Maya (optional)'), '  Train is delayed  ');
      expect(screen.getByText('“Jordan is running about 15 minutes late. Train is delayed”')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Tell Maya' }));
      expect(state.late.mutate).toHaveBeenCalledWith(
        { requestId: REQUEST.replace(/-/g, ''), minutes: 15, note: 'Train is delayed' },
        expect.anything()
      );
    });

    it('confirms with the time geo-chat will tell Maya, and offers the room', async () => {
      succeedWith(state.late, { expected_at: '2026-10-21T17:13:00.000Z', note: null });
      open('late');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Tell Maya' }));

      expect(screen.getByRole('heading')).toHaveTextContent(/^We’ve told Maya you’ll be there by about /);
      expect(screen.getByRole('link', { name: 'Join the room' })).toHaveAttribute('href', '/debate/room-1');
    });

    // The calendar invite carries the link, so it can be sent the day before.
    it('offers no Join into a room that is not open yet', async () => {
      state.rooms = { data: { rooms: [{ room_id: 'room-1', joinable: false, due: false, others_present: false }] } };
      succeedWith(state.late, { expected_at: '2026-10-22T17:10:00.000Z', note: null });
      open('late');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Tell Maya' }));

      expect(screen.getByRole('heading')).toHaveTextContent(/^We’ve told Maya/);
      expect(screen.queryByRole('link', { name: 'Join the room' })).not.toBeInTheDocument();
    });

    it('speaks to the viewer in the preview when their own name has not loaded', () => {
      state.viewerName = null;
      open('late');
      expect(screen.getByText('“You’re running about 10 minutes late.”')).toBeInTheDocument();
    });

    it('says plainly when the viewer is already in the room', () => {
      state.late = { ...idle(), isError: true, error: new GeoChatRequestError('raw', 'already_joined', 409) };
      open('late');
      expect(screen.getByRole('alert')).toHaveTextContent('You’re already in the room, so there’s no need.');
    });
  });

  describe('can’t make it', () => {
    it('cancels with the note on the confirm press', async () => {
      const user = userEvent.setup();
      open('cant');
      await user.type(screen.getByLabelText('Add a note for Maya (optional)'), 'Something came up');
      await user.click(screen.getByRole('button', { name: 'Cancel the debate' }));

      expect(state.cant.mutate).toHaveBeenCalledWith(
        { requestId: REQUEST.replace(/-/g, ''), note: 'Something came up' },
        expect.anything()
      );
    });

    it('hands the note to Maya’s week to suggest a time instead, cancelling nothing itself', async () => {
      const user = userEvent.setup();
      open('cant');
      await user.type(screen.getByLabelText('Add a note for Maya (optional)'), 'Sorry!');
      await user.click(screen.getByRole('button', { name: 'Suggest another time instead' }));

      const week = screen.getByTestId('week');
      expect(week).toHaveAttribute('data-request', REQUEST.replace(/-/g, ''));
      expect(week).toHaveAttribute('data-note', 'Sorry!');
      expect(week).toHaveAttribute('data-user', MAYA);
      expect(state.cant.mutate).not.toHaveBeenCalled();
    });

    // The cancel refetches the list, which then says the debate is off. That is the news being
    // confirmed, not a reason to swap the confirmation for "no longer on".
    it('keeps saying it is cancelled once the list says so too', async () => {
      succeedWith(state.cant, {});
      const { rerender } = renderOpen('cant');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel the debate' }));
      expect(screen.getByRole('heading')).toHaveTextContent('Your debate is cancelled. We’ve let Maya know.');

      state.requests = { data: { requests: [agreed({ status: 'cancelled' })] }, isPending: false, isError: false };
      rerender(<ScheduledDebateNoticeDialog open requestId={REQUEST} initialStep="cant" onClose={vi.fn()} />);
      expect(screen.getByRole('heading')).toHaveTextContent('Your debate is cancelled. We’ve let Maya know.');
      expect(screen.queryByText('This debate is no longer on.')).not.toBeInTheDocument();
    });
  });

  describe('a debate that is no longer on', () => {
    it('says it moved, and points at Requests', () => {
      state.requests = {
        data: { requests: [agreed({ status: 'pending', room_id: null })] },
        isPending: false,
        isError: false,
      };
      open('late');
      expect(screen.getByText(/has moved to a new time/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open Requests' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Tell Maya' })).not.toBeInTheDocument();
    });

    it('says it is off once cancelled', () => {
      state.requests = {
        data: { requests: [agreed({ status: 'cancelled' })] },
        isPending: false,
        isError: false,
      };
      open('cant');
      expect(screen.getByText('This debate is no longer on.')).toBeInTheDocument();
    });

    it('says when it cannot find the debate at all', () => {
      state.requests = { data: { requests: [] }, isPending: false, isError: false };
      open('late');
      expect(screen.getByText(/couldn’t find this debate/)).toBeInTheDocument();
    });
  });
});
