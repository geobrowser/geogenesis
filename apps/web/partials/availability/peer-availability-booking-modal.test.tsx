import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { Provider } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  reschedule: vi.fn(),
  reset: vi.fn(),
  pending: false,
  error: null as Error | null,
  viewerTimezone: 'UTC',
  /** Swapped for a real mutation where the timing of a settle is what is under test. */
  useCreate: null as (() => unknown) | null,
  /** The viewer's scheduled requests, as the reschedule screen reads the one it moves (GEO-3429). */
  requests: [] as { request_id: string; status: string; scheduled_start_at: string; room_id: string | null }[],
  noneWork: vi.fn(),
  noneWorkReset: vi.fn(),
  noneWorkPending: false,
  noneWorkError: null as Error | null,
  /** The zone the week is drawn in, as the cached peer-schedule query has it. */
  viewerZone: undefined as string | undefined,
}));

vi.mock('~/core/debates/hooks', () => ({
  usePeerSchedule: () => ({ schedule: mocks.viewerZone ? { viewerTimezone: mocks.viewerZone } : undefined }),
}));

vi.mock('~/core/debates/rooms/scheduling-hooks', () => ({
  useCreateScheduledDebate: () =>
    mocks.useCreate?.() ?? {
      mutate: mocks.mutate,
      reset: mocks.reset,
      isPending: mocks.pending,
      error: mocks.error,
    },
  useRescheduleScheduledDebate: () => ({
    mutate: mocks.reschedule,
    reset: mocks.reset,
    isPending: mocks.pending,
    error: mocks.error,
  }),
  useScheduledDebates: () => ({ data: { requests: mocks.requests } }),
  useNoTimeWorks: () => ({
    mutate: mocks.noneWork,
    reset: mocks.noneWorkReset,
    isPending: mocks.noneWorkPending,
    error: mocks.noneWorkError,
  }),
}));

// Can't make it is GEO-3427's own screen, tested there; here it only has to be the one that opens.
vi.mock('~/partials/scheduled-debates/scheduled-debate-notice', () => ({
  ScheduledDebateNoticeDialog: ({ requestId, initialStep }: { requestId: string; initialStep: string }) => (
    <output aria-label="notice">{`${initialStep} ${requestId}`}</output>
  ),
}));

// The week itself is covered by peer-availability.test.tsx; this suite is about what the modal
// sends, which nothing else asserts.
vi.mock('./peer-availability', async importOriginal => ({
  ...(await importOriginal<typeof import('./peer-availability')>()),
  PeerAvailability: ({
    booking,
  }: {
    booking?: {
      mode?: string;
      requestId?: string | null;
      moving?: { startsAt: string; agreed: boolean } | null;
      disabled?: boolean;
      noTimeWorks?: { onPress: () => void; disabled?: boolean; error: string | null } | null;
      onRequest: (startsAt: string, pick: { viewerIsFree: boolean | null; viewerTimezone: string }) => void;
      error: string | null;
    };
  }) => (
    <>
      <output aria-label="mode">{booking?.mode ?? ''}</output>
      <output aria-label="moving">{booking?.requestId ?? ''}</output>
      <button
        type="button"
        onClick={() =>
          booking?.onRequest('2026-09-24T13:00:00.000Z', { viewerIsFree: null, viewerTimezone: mocks.viewerTimezone })
        }
      >
        pick
      </button>
      <output aria-label="error">{booking?.error ?? ''}</output>
      <output aria-label="current">
        {booking?.moving ? `${booking.moving.startsAt} ${booking.moving.agreed ? 'agreed' : 'pending'}` : ''}
      </output>
      <output aria-label="propose disabled">{booking?.disabled ? 'yes' : 'no'}</output>
      {booking?.noTimeWorks && (
        <>
          <button type="button" disabled={booking.noTimeWorks.disabled} onClick={booking.noTimeWorks.onPress}>
            none work
          </button>
          <output aria-label="none work error">{booking.noTimeWorks.error ?? ''}</output>
        </>
      )}
    </>
  ),
}));

const { PeerAvailabilityBookingModal } = await import('./peer-availability-booking-modal');
const { Toast } = await import('~/core/hooks/use-toast');

/** The toast lives in a jotai atom, so each render gets its own store or one test's toast leaks into the next. */
const withToast = (children: React.ReactNode) => (
  <Provider>
    {children}
    <Toast />
  </Provider>
);

afterEach(() => {
  cleanup();
  mocks.mutate = vi.fn();
  mocks.reschedule = vi.fn();
  mocks.reset = vi.fn();
  mocks.pending = false;
  mocks.error = null;
  mocks.viewerTimezone = 'UTC';
  mocks.useCreate = null;
  mocks.requests = [];
  mocks.noneWork = vi.fn();
  mocks.noneWorkReset = vi.fn();
  mocks.noneWorkPending = false;
  mocks.noneWorkError = null;
  mocks.viewerZone = undefined;
});

const setup = (userId = 'user-them', onClose = vi.fn()) => ({
  user: userEvent.setup(),
  onClose,
  ...render(<PeerAvailabilityBookingModal open userId={userId} peerName="Ada" onClose={onClose} />),
});

describe('what reaches the server', () => {
  it('books the person whose week is open, for one slot', async () => {
    const { user } = setup('user-them');

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    const sent = mocks.mutate.mock.calls[0][0];
    expect(sent.opponentUserId).toBe('user-them');
    expect(sent.startsAt.toISOString()).toBe('2026-09-24T13:00:00.000Z');
    // A slot is 30 minutes; a wrong duration here books a debate of the wrong length.
    expect(sent.minutes).toBe(30);
  });

  it('carries whichever person the modal was opened for', async () => {
    const { user } = setup('user-someone-else');

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(mocks.mutate.mock.calls[0][0].opponentUserId).toBe('user-someone-else');
  });

  it('clears the last outcome on close, so the next week does not open showing it', () => {
    const { onClose } = setup();

    screen.getByLabelText('Close').click();

    expect(onClose).toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalled();
  });
});

// Leaving the week open after a sent request read as nothing having happened.
describe('a sent request', () => {
  const succeed = (fn: 'mutate' | 'reschedule') => {
    mocks[fn] = vi.fn((_vars, options) => options?.onSuccess?.({ scheduled_start_at: '2026-09-24T13:00:00.000Z' }));
  };

  it('closes the week and confirms in a toast', async () => {
    succeed('mutate');
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(withToast(<PeerAvailabilityBookingModal open userId="user-them" peerName="Ada" onClose={onClose} />));

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mocks.reset).toHaveBeenCalled();
    expect(await screen.findByText(/^Requested .*Ada has to accept before the room is booked\.$/)).toBeInTheDocument();
  });

  it('says a moved request was proposed, not requested', async () => {
    succeed('reschedule');
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      withToast(
        <PeerAvailabilityBookingModal
          open
          userId="user-them"
          peerName="Ada"
          rescheduleRequestId="req"
          onClose={onClose}
        />
      )
    );

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/^Proposed .* instead\. Ada has to accept the new time/)).toBeInTheDocument();
  });

  // The week names its times in the viewer's saved zone, which need not be the browser's.
  it("confirms in the week's zone, not the browser's", async () => {
    succeed('mutate');
    mocks.viewerTimezone = 'Asia/Kathmandu';
    const user = userEvent.setup();
    render(withToast(<PeerAvailabilityBookingModal open userId="user-them" peerName="Ada" onClose={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'pick' }));

    // 13:00Z is 18:45 in Kathmandu.
    expect((await screen.findByText(/^Requested /)).textContent).toContain('6:45');
  });

  it('falls back to a short id rather than an ungrammatical "They has"', async () => {
    succeed('mutate');
    const user = userEvent.setup();
    render(withToast(<PeerAvailabilityBookingModal open userId="user-0123456789" onClose={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(await screen.findByText(/user-012… has to accept/)).toBeInTheDocument();
  });

  // The callbacks ride on the mutate call, and closing resets the mutation, which is what detaches
  // them. A real mutation settled by hand, since a mock that settles at once cannot be closed first.
  describe('settling after the week was closed', () => {
    const inFlight = () => {
      let settle: (value: { scheduled_start_at: string }) => void = () => {};
      function useHeldMutation() {
        return useMutation({
          mutationFn: () =>
            new Promise<{ scheduled_start_at: string }>(resolve => {
              settle = resolve;
            }),
        });
      }
      mocks.useCreate = useHeldMutation;
      return { settle: () => act(async () => settle({ scheduled_start_at: '2026-09-24T13:00:00.000Z' })) };
    };

    const renderFor = (client: QueryClient, peer: { userId: string; name: string }, onClose: () => void) => (
      <QueryClientProvider client={client}>
        {withToast(<PeerAvailabilityBookingModal open userId={peer.userId} peerName={peer.name} onClose={onClose} />)}
      </QueryClientProvider>
    );

    it('still confirms when the week stays open (control)', async () => {
      const request = inFlight();
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(renderFor(new QueryClient(), { userId: 'user-ada', name: 'Ada' }, onClose));

      await user.click(screen.getByRole('button', { name: 'pick' }));
      await request.settle();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(await screen.findByText(/Ada has to accept/)).toBeInTheDocument();
    });

    it("neither closes the next person's week nor toasts the last one", async () => {
      const request = inFlight();
      const client = new QueryClient();
      const onClose = vi.fn();
      const user = userEvent.setup();
      const { rerender } = render(renderFor(client, { userId: 'user-ada', name: 'Ada' }, onClose));

      await user.click(screen.getByRole('button', { name: 'pick' }));
      await user.click(screen.getByLabelText('Close'));
      rerender(renderFor(client, { userId: 'user-bob', name: 'Bob' }, onClose));
      await request.settle();

      // Once, by hand. A second call would be the late success closing Bob's week.
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/has to accept/)).not.toBeInTheDocument();
    });
  });

  it('stays open when the request is refused', async () => {
    const { user, onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('a refused invitation', () => {
  const LIMIT =
    'you have 100 invitations to this person waiting for an answer; wait for some to be answered before sending more';

  it("hands geo-chat's message to the footer", () => {
    mocks.error = new GeoChatRequestError(LIMIT, 'too_many_open_invitations', 409);
    setup();

    expect(screen.getByLabelText('error')).toHaveTextContent(LIMIT);
  });

  it('still sends a retry, and clears the refusal on close', async () => {
    mocks.error = new GeoChatRequestError(LIMIT, 'too_many_open_invitations', 409);
    const { user, onClose } = setup();

    await user.click(screen.getByRole('button', { name: 'pick' }));
    expect(mocks.mutate).toHaveBeenCalledTimes(1);

    screen.getByLabelText('Close').click();
    expect(onClose).toHaveBeenCalled();
    expect(mocks.reset).toHaveBeenCalled();
  });
});

// A scheduling email's "Choose different time" (GEO-2933). Declining and booking afresh would tell the
// proposer "declined, find someone else" before a second invite from the same person arrived.
describe('choosing a different time for an existing request', () => {
  const REQUEST_ID = '6676b145-0970-4c1c-bfbc-7497d9721b39';

  it('moves that request to the picked slot and proposes nothing new', async () => {
    const user = userEvent.setup();
    render(
      <PeerAvailabilityBookingModal
        open
        userId="user-them"
        peerName="Ada"
        rescheduleRequestId={REQUEST_ID}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.reschedule).toHaveBeenCalledTimes(1);
    const sent = mocks.reschedule.mock.calls[0][0];
    expect(sent.requestId).toBe(REQUEST_ID);
    expect(sent.startsAt.toISOString()).toBe('2026-09-24T13:00:00.000Z');
    expect(sent.minutes).toBe(30);
    expect(screen.getByLabelText('mode')).toHaveTextContent('reschedule');
    // Named to the week too, so its analytics can say which debate was being moved (GEO-3432).
    expect(screen.getByLabelText('moving')).toHaveTextContent(REQUEST_ID);
  });

  it('books a new request when no request is named', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(mocks.reschedule).not.toHaveBeenCalled();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('mode')).toHaveTextContent('request');
    expect(screen.getByLabelText('moving')).toBeEmptyDOMElement();
  });
});

// geo-chat's refusals of a move (reschedule of an accepted debate), which otherwise arrive as a
// code and a JSON detail nobody should have to read.
describe('a refused move', () => {
  const REQUEST_ID = '6676b145-0970-4c1c-bfbc-7497d9721b39';
  const renderMoving = () =>
    render(
      <PeerAvailabilityBookingModal
        open
        userId="user-them"
        peerName="Ada"
        rescheduleRequestId={REQUEST_ID}
        onClose={vi.fn()}
      />
    );

  it.each([
    [
      'debate_already_started',
      'someone has already joined this debate',
      'This debate has already started, so its time can no longer be changed.',
    ],
    ['schedule_conflict', '{"conflicting_request_id":"x"}', 'You already have a debate at that time. Pick another.'],
    [
      'reschedule_refused',
      '{"reason":"too_many_reschedules","limit":5}',
      'This debate has been moved too many times. Cancel it and send a new request instead.',
    ],
    ['reschedule_refused', '{"reason":"not_open"}', 'This debate has already been declined, cancelled or expired.'],
  ])('says %s plainly', (code, detail, said) => {
    mocks.error = new GeoChatRequestError(detail, code, 409);
    renderMoving();
    expect(screen.getByLabelText('error')).toHaveTextContent(said);
  });

  it("keeps any other refusal's own message", () => {
    mocks.error = new GeoChatRequestError('the debate must end after it starts', 'invalid_schedule_span', 400);
    renderMoving();
    expect(screen.getByLabelText('error')).toHaveTextContent('the debate must end after it starts');
  });

  it('leaves a new request refused with the same code on its own message', () => {
    mocks.error = new GeoChatRequestError('that time is already committed', 'schedule_conflict', 409);
    setup();
    expect(screen.getByLabelText('error')).toHaveTextContent('that time is already committed');
  });
});

// GEO-3429: the reschedule screen names the debate it moves, can call it off when no time works,
// and won't let an agreed debate be closed on without saying it is still on.
describe('moving a debate', () => {
  const REQUEST_ID = '6676b145-0970-4c1c-bfbc-7497d9721b39';
  const START = '2026-10-22T17:00:00Z';
  const moving = (
    status: 'accepted' | 'pending',
    onClose = vi.fn(),
    extra: Partial<React.ComponentProps<typeof PeerAvailabilityBookingModal>> = {}
  ) => {
    // An agreed debate has its room; a pending one has none yet.
    mocks.requests = [
      {
        request_id: REQUEST_ID.replace(/-/g, ''),
        status,
        scheduled_start_at: START,
        room_id: status === 'accepted' ? 'room-1' : null,
      },
    ];
    render(
      withToast(
        <PeerAvailabilityBookingModal
          open
          userId="user-them"
          peerName="Ada Lovelace"
          rescheduleRequestId={REQUEST_ID}
          onClose={onClose}
          {...extra}
        />
      )
    );
    return { user: userEvent.setup(), onClose };
  };

  it('hands the week the debate it moves', () => {
    moving('accepted');
    expect(screen.getByLabelText('current')).toHaveTextContent(`${START} agreed`);
  });

  it('says nothing about a request it cannot find, and offers no way to call it off', () => {
    render(
      <PeerAvailabilityBookingModal
        open
        userId="user-them"
        peerName="Ada"
        rescheduleRequestId={REQUEST_ID}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText('current')).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'none work' })).not.toBeInTheDocument();
  });

  it('calls it off when no time works, then closes and says so', async () => {
    const { user, onClose } = moving('accepted');
    mocks.noneWork.mockImplementation((_vars, options) => options?.onSuccess?.());

    await user.click(screen.getByRole('button', { name: 'none work' }));

    expect(mocks.noneWork).toHaveBeenCalledWith({ requestId: REQUEST_ID }, expect.anything());
    expect(onClose).toHaveBeenCalledTimes(1);
    // No "still on" warning on the way out: it isn't.
    expect(screen.queryByRole('dialog', { name: /still on/ })).not.toBeInTheDocument();
    expect(
      await screen.findByText('Debate cancelled. We’ve sent Ada your free times to pick from.')
    ).toBeInTheDocument();
  });

  it('warns before closing on an agreed debate, and Keep closes', async () => {
    const { user, onClose } = moving('accepted');

    await user.click(screen.getByLabelText('Close'));

    expect(onClose).not.toHaveBeenCalled();
    const warning = screen.getByRole('dialog', { name: /^Your debate is still on for / });
    expect(warning).toHaveTextContent('Ada will expect you then.');
    await user.click(screen.getByRole('button', { name: /^Keep / }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('goes back to the times from the warning', async () => {
    const { user, onClose } = moving('accepted');

    await user.click(screen.getByLabelText('Close'));
    await user.click(screen.getByRole('button', { name: 'Back to times' }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /still on/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pick' })).toBeInTheDocument();
  });

  it("opens Can't make it from the warning", async () => {
    const { user, onClose } = moving('accepted');

    await user.click(screen.getByLabelText('Close'));
    await user.click(screen.getByRole('button', { name: 'I can’t make it' }));

    expect(screen.getByLabelText('notice')).toHaveTextContent(`cant ${REQUEST_ID}`);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes an unanswered request straight away: nothing is booked to warn about', async () => {
    const { user, onClose } = moving('pending');

    await user.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /still on/ })).not.toBeInTheDocument();
  });

  // Review of #2979: one request at a time, and no "still on" while one is in flight.
  it('holds Propose while None of these work is in flight', () => {
    mocks.noneWorkPending = true;
    moving('accepted');

    expect(screen.getByLabelText('propose disabled')).toHaveTextContent('yes');
    expect(screen.getByRole('button', { name: 'none work' })).toBeDisabled();
  });

  // Never held open: a request with no timeout can hang, and "still on" may be about to be untrue.
  it.each([
    ['the Close button', (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByLabelText('Close'))],
    ['Escape', (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
  ])('closes with %s, without the warning, while a request is in flight', async (_how, press) => {
    mocks.noneWorkPending = true;
    const { user, onClose } = moving('accepted');

    await press(user);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /still on/ })).not.toBeInTheDocument();
  });

  it('holds None of these work while a move is in flight', () => {
    mocks.pending = true;
    moving('accepted');
    expect(screen.getByRole('button', { name: 'none work' })).toBeDisabled();
  });

  it('keeps a refusal on screen after the refetch resolves the request', () => {
    mocks.noneWorkError = new Error('gone');
    mocks.requests = [];
    render(
      <PeerAvailabilityBookingModal
        open
        userId="user-them"
        peerName="Ada"
        rescheduleRequestId={REQUEST_ID}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByLabelText('none work error')).toHaveTextContent('gone');
    // Nothing left to call off.
    expect(screen.getByRole('button', { name: 'none work' })).toBeDisabled();
  });

  it('says an unanswered invite was not cancelled', async () => {
    const { user } = moving('pending');
    mocks.noneWork.mockImplementation((_vars, options) => options?.onSuccess?.());

    await user.click(screen.getByRole('button', { name: 'none work' }));

    expect(await screen.findByText('We’ve sent Ada your free times to pick from.')).toBeInTheDocument();
    expect(screen.queryByText(/Debate cancelled/)).not.toBeInTheDocument();
  });

  it('closes from the room without the warning: the viewer is the one waiting', async () => {
    const { user, onClose } = moving('accepted', vi.fn(), { entry: 'room_late_notice' });

    // Nor "none of these work", which would tell the late one the waiter can't make it.
    expect(screen.queryByRole('button', { name: 'none work' })).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /still on/ })).not.toBeInTheDocument();
  });

  it("hands Can't make it back to a caller that is that screen, rather than opening a second", async () => {
    const onCantMakeIt = vi.fn();
    const { user } = moving('accepted', vi.fn(), { onCantMakeIt });

    await user.click(screen.getByLabelText('Close'));
    await user.click(screen.getByRole('button', { name: 'I can’t make it' }));

    expect(onCantMakeIt).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('notice')).not.toBeInTheDocument();
  });

  it("names the time in the week's zone, as the card and chips do", async () => {
    mocks.viewerZone = 'America/New_York';
    const { user } = moving('accepted');

    await user.click(screen.getByLabelText('Close'));

    expect(screen.getByRole('dialog', { name: 'Your debate is still on for Thu, Oct 22, 1pm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep 1pm' })).toBeInTheDocument();
  });
});
