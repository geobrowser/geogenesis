import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
  noProfiles: false,
  finished: false as boolean | null,
}));

vi.mock('~/core/debates/hooks', () => ({ useGeoChatAuth: () => ({ authenticated: true, ready: true }) }));
vi.mock('~/core/debates/rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => state.requests,
  useReportRunningLate: () => state.late,
  useCantMakeIt: () => state.cant,
}));
vi.mock('~/core/debates/rooms/hooks', () => ({
  useUpcomingDebateRooms: () => state.rooms,
  useRoomFinished: (room: unknown) => (room ? state.finished : false),
}));
vi.mock('~/core/debates/use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => VIEWER }));
vi.mock('~/core/debates/matchmaking/use-geo-chat-user-summaries', () => ({
  useGeoChatUserSummaries: (ids: string[]) =>
    (state.noProfiles
      ? []
      : [
          { user_id: MAYA, profile_space_id: 'maya-space', display_name: 'Maya', avatar_cid: null },
          { user_id: VIEWER, profile_space_id: 'jordan-space', display_name: state.viewerName, avatar_cid: null },
        ]
    ).filter(person => ids.includes(person.user_id)),
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
    onCantMakeIt,
  }: {
    rescheduleRequestId: string;
    rescheduleNote?: string;
    userId: string;
    onCantMakeIt?: () => void;
  }) => (
    <div data-testid="week" data-request={rescheduleRequestId} data-note={rescheduleNote ?? ''} data-user={userId}>
      {/* The week's close warning, reduced to its Can't make it (GEO-3429). */}
      <button type="button" onClick={onCantMakeIt}>
        warning: I cant make it
      </button>
    </div>
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
  state.noProfiles = false;
  state.finished = false;
});

afterEach(cleanup);

/** The heading the screen draws; the dialog's own title is for assistive tech only. */
function heading() {
  const visible = screen.getAllByRole('heading').filter(element => !element.closest('.sr-only'));
  expect(visible).toHaveLength(1);
  return visible[0];
}

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
      expect(heading()).toHaveTextContent('How late will you be?');
    });
  });

  describe('running late from an email (board 1b)', () => {
    // A note shows in full in the other debater's room only up to 100 characters.
    it('stops the note at 100 characters and counts up to it', async () => {
      open('late');
      const field = screen.getByLabelText('Note for Maya (optional)');
      expect(field).toHaveAttribute('maxLength', '100');
      expect(field).toHaveAccessibleDescription('0/100');
      fireEvent.change(field, { target: { value: 'Train is delayed' } });
      expect(field).toHaveAccessibleDescription('16/100');
    });

    it('says which debate, then sends the picked minutes and the note on the confirm press', async () => {
      const user = userEvent.setup();
      open('late');

      expect(screen.getByText('Your debate with Maya')).toBeInTheDocument();
      expect(heading()).toHaveTextContent('Tell Maya you’re running late');
      expect(screen.getByRole('button', { name: '10 min', pressed: true })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '15 min' }));
      expect(screen.getByRole('button', { name: '15 min', pressed: true })).toBeInTheDocument();
      await user.type(screen.getByLabelText('Note for Maya (optional)'), '  Train is delayed  ');
      // Board 1b has no preview and no way back: it is where the email lands.
      expect(screen.queryByText('What Maya sees')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Send to Maya' }));
      expect(state.late.mutate).toHaveBeenCalledWith(
        { requestId: REQUEST.replace(/-/g, ''), minutes: 15, note: 'Train is delayed' },
        expect.anything()
      );
    });

    it('confirms with the time geo-chat will tell Maya, and offers the room', async () => {
      succeedWith(state.late, { expected_at: '2026-10-21T17:13:00.000Z', note: null });
      open('late');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Send to Maya' }));

      expect(heading()).toHaveTextContent(/^We’ve told Maya you’ll be there by about /);
      expect(screen.getByRole('link', { name: 'Join the room' })).toHaveAttribute('href', '/debate/room-1');
    });

    // geo-chat refuses it before the room opens; the calendar invite carries the link a day out.
    it('says when it can be sent while the room is not open yet, offering nothing to press', () => {
      state.rooms = {
        data: {
          rooms: [
            {
              room_id: 'room-1',
              joinable: false,
              due: false,
              others_present: false,
              opens_at: '2026-10-22T16:50:00.000Z',
            },
          ],
        },
      };
      open('late');

      expect(screen.getByText(/^You can tell Maya you’re running late once the room opens, at /)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send to Maya' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'I can’t make it at all' })).toBeInTheDocument();
    });

    it('offers no Join into a room it cannot see', async () => {
      state.rooms = { data: { rooms: [] } };
      succeedWith(state.late, { expected_at: '2026-10-22T17:10:00.000Z', note: null });
      open('late');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Send to Maya' }));

      expect(heading()).toHaveTextContent(/^We’ve told Maya/);
      expect(screen.queryByRole('link', { name: 'Join the room' })).not.toBeInTheDocument();
    });

    it('says plainly when the viewer already joined', () => {
      state.late = { ...idle(), isError: true, error: new GeoChatRequestError('raw', 'already_joined', 409) };
      open('late');
      expect(screen.getByRole('alert')).toHaveTextContent('You’ve already joined this debate, so there’s no need.');
    });

    // React Query keeps the list through a failed refetch; one dropped poll must not lose the step.
    it('keeps the step through a failed refetch', async () => {
      const user = userEvent.setup();
      const { rerender } = renderOpen('late');
      await user.type(screen.getByLabelText('Note for Maya (optional)'), 'On my way');

      state.requests = { ...state.requests, isError: true };
      rerender(<ScheduledDebateNoticeDialog open requestId={REQUEST} initialStep="late" onClose={vi.fn()} />);
      expect(screen.getByLabelText('Note for Maya (optional)')).toHaveValue('On my way');
      expect(screen.queryByText(/Couldn’t load your debate/)).not.toBeInTheDocument();
    });
  });

  describe('running late from the choices (board 3)', () => {
    it('asks how late, previews what Maya sees, and goes back to the choices', async () => {
      const user = userEvent.setup();
      open('decide', vi.fn());
      await user.click(screen.getByRole('button', { name: 'I’m running late' }));

      expect(heading()).toHaveTextContent('How late will you be?');
      await user.type(screen.getByLabelText('Add a note for Maya (optional)'), 'Train is delayed');
      expect(screen.getByText('“Jordan is running about 10 minutes late. Train is delayed”')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tell Maya' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(heading()).toHaveTextContent('Your debate with Maya started 3 minutes ago');
    });

    it('speaks to the viewer in the preview when their own name has not loaded', async () => {
      state.viewerName = null;
      open('decide', vi.fn());
      await userEvent.setup().click(screen.getByRole('button', { name: 'I’m running late' }));
      expect(screen.getByText('“You’re running about 10 minutes late.”')).toBeInTheDocument();
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

    // The week needs only their id, which the request carries; the graph's name may never come.
    it('opens the week to suggest a time even when their profile has not loaded', async () => {
      state.noProfiles = true;
      open('cant');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Suggest another time instead' }));
      expect(screen.getByTestId('week')).toHaveAttribute('data-user', MAYA);
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

    // GEO-3429: closing that week and choosing I can't make it comes back here, with the note.
    it('comes back from the week with the note still typed', async () => {
      const user = userEvent.setup();
      open('cant');
      await user.type(screen.getByLabelText('Add a note for Maya (optional)'), 'Flight delayed');
      await user.click(screen.getByRole('button', { name: 'Suggest another time instead' }));
      await user.click(screen.getByRole('button', { name: 'warning: I cant make it' }));

      expect(screen.queryByTestId('week')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Add a note for Maya (optional)')).toHaveValue('Flight delayed');
    });

    // The note lives with the dialog, so a newer one survives a hop to Running late and back.
    it('keeps the latest note across Running late and back', async () => {
      const user = userEvent.setup();
      open('cant');
      await user.type(screen.getByLabelText('Add a note for Maya (optional)'), 'A');
      await user.click(screen.getByRole('button', { name: 'Suggest another time instead' }));
      await user.click(screen.getByRole('button', { name: 'warning: I cant make it' }));
      const field = screen.getByLabelText('Add a note for Maya (optional)');
      await user.clear(field);
      await user.type(field, 'B');
      await user.click(screen.getByRole('button', { name: 'I’m only running late' }));
      await user.click(screen.getByRole('button', { name: 'I can’t make it at all' }));

      expect(screen.getByLabelText('Add a note for Maya (optional)')).toHaveValue('B');
    });

    // The cancel refetches the list, which then says the debate is off. That is the news being
    // confirmed, not a reason to swap the confirmation for "no longer on".
    it('keeps saying it is cancelled once the list says so too', async () => {
      succeedWith(state.cant, {});
      const { rerender } = renderOpen('cant');
      await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel the debate' }));
      expect(heading()).toHaveTextContent('Your debate is cancelled. We’ve let Maya know.');

      state.requests = { data: { requests: [agreed({ status: 'cancelled' })] }, isPending: false, isError: false };
      rerender(<ScheduledDebateNoticeDialog open requestId={REQUEST} initialStep="cant" onClose={vi.fn()} />);
      expect(heading()).toHaveTextContent('Your debate is cancelled. We’ve let Maya know.');
      expect(screen.queryByText('This debate is no longer on.')).not.toBeInTheDocument();
    });
  });

  // geo-chat lists a room whose debate already happened as joinable until it is swept.
  it('treats a debate that already happened as over, with nothing to press', () => {
    state.finished = true;
    open('late');
    expect(screen.getByText('This debate is no longer on.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to Maya' })).not.toBeInTheDocument();
  });

  // The pressed button is gone once the screen changes, so the new screen's heading takes focus.
  it('moves focus to the new screen’s heading after a press', async () => {
    const user = userEvent.setup();
    open('decide', vi.fn());
    await user.click(screen.getByRole('button', { name: 'I’m running late' }));
    expect(heading()).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(heading()).toHaveFocus();
  });

  it('keeps a visible title on a screen without its own heading', () => {
    state.requests = { data: { requests: [] }, isPending: false, isError: false };
    open('late');
    expect(screen.getByRole('heading', { name: 'Running late' })).toBeInTheDocument();
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
