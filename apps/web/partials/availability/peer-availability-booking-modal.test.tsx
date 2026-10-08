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
      onRequest: (startsAt: string, pick: { viewerIsFree: boolean | null; viewerTimezone: string }) => void;
      error: string | null;
    };
  }) => (
    <>
      <output aria-label="mode">{booking?.mode ?? ''}</output>
      <button
        type="button"
        onClick={() =>
          booking?.onRequest('2026-09-24T13:00:00.000Z', { viewerIsFree: null, viewerTimezone: mocks.viewerTimezone })
        }
      >
        pick
      </button>
      <output aria-label="error">{booking?.error ?? ''}</output>
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
  });

  it('books a new request when no request is named', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('button', { name: 'pick' }));

    expect(mocks.reschedule).not.toHaveBeenCalled();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('mode')).toHaveTextContent('request');
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
      'Someone has already joined this debate, so its time can no longer be changed.',
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
