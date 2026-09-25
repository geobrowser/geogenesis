import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GeoChatRequestError } from '~/core/debates/api';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
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
}));

// The week itself is covered by peer-availability.test.tsx; this suite is about what the modal
// sends, which nothing else asserts.
vi.mock('./peer-availability', () => ({
  PeerAvailability: ({
    booking,
  }: {
    booking?: { onRequest: (startsAt: string) => void; error: string | null; requestedStart: string | null };
  }) => (
    <>
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
