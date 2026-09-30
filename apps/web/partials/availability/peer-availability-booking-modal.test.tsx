import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  reschedule: vi.fn(),
  reset: vi.fn(),
  pending: false,
  error: null as Error | null,
  data: undefined as { scheduled_start_at: string } | undefined,
}));

vi.mock('~/core/debates/rooms/scheduling-hooks', () => ({
  useCreateScheduledDebate: () => ({
    mutate: mocks.mutate,
    reset: mocks.reset,
    isPending: mocks.pending,
    error: mocks.error,
    data: mocks.data,
  }),
  useRescheduleScheduledDebate: () => ({
    mutate: mocks.reschedule,
    reset: mocks.reset,
    isPending: mocks.pending,
    error: mocks.error,
    data: mocks.data,
  }),
}));

// The week itself is covered by peer-availability.test.tsx; this suite is about what the modal
// sends, which nothing else asserts.
vi.mock('./peer-availability', () => ({
  PeerAvailability: ({
    booking,
  }: {
    booking?: {
      mode?: string;
      onRequest: (startsAt: string) => void;
      error: string | null;
      requestedStart: string | null;
    };
  }) => (
    <>
      <output aria-label="mode">{booking?.mode ?? ''}</output>
      <button type="button" onClick={() => booking?.onRequest('2026-09-24T13:00:00.000Z')}>
        pick
      </button>
      <output aria-label="error">{booking?.error ?? ''}</output>
      <output aria-label="requested">{booking?.requestedStart ?? ''}</output>
    </>
  ),
}));

const { PeerAvailabilityBookingModal } = await import('./peer-availability-booking-modal');

afterEach(() => {
  cleanup();
  mocks.mutate = vi.fn();
  mocks.reschedule = vi.fn();
  mocks.reset = vi.fn();
  mocks.pending = false;
  mocks.error = null;
  mocks.data = undefined;
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

describe('a refused invitation', () => {
  const LIMIT =
    'you have 100 invitations to this person waiting for an answer; wait for some to be answered before sending more';

  it("hands geo-chat's message to the footer and shows no confirmation", () => {
    mocks.error = new GeoChatRequestError(LIMIT, 'too_many_open_invitations', 409);
    setup();

    expect(screen.getByLabelText('error')).toHaveTextContent(LIMIT);
    expect(screen.getByLabelText('requested')).toBeEmptyDOMElement();
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
