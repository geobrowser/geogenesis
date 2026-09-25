import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  pending: false,
  error: null as Error | null,
  data: undefined as { scheduled_start_at: string } | undefined,
  scheduled: [] as unknown[] | undefined,
  scheduledStatus: 'success' as 'pending' | 'error' | 'success',
}));

vi.mock('~/core/debates/rooms/scheduling-hooks', () => ({
  useCreateScheduledDebate: () => ({
    mutate: mocks.mutate,
    reset: mocks.reset,
    isPending: mocks.pending,
    error: mocks.error,
    data: mocks.data,
  }),
  useScheduledDebates: () => ({
    data: mocks.scheduled && { requests: mocks.scheduled },
    status: mocks.scheduledStatus,
  }),
}));

// The week itself is covered by peer-availability.test.tsx; this suite is about what the modal
// sends, which nothing else asserts.
vi.mock('./peer-availability', () => ({
  PeerAvailability: ({
    booking,
  }: {
    booking?: { onRequest: (startsAt: string) => void; replacesStart: string | null; replacementUnknown: boolean };
  }) => (
    <>
      <button type="button" onClick={() => booking?.onRequest('2026-09-24T13:00:00.000Z')}>
        pick
      </button>
      <output aria-label="replaces">{booking?.replacesStart ?? 'nothing'}</output>
      <output aria-label="unknown">{String(booking?.replacementUnknown)}</output>
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
  mocks.scheduled = [];
  mocks.scheduledStatus = 'success';
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

describe('an invitation this would replace', () => {
  const ME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const THEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const request = (overrides: Record<string, unknown> = {}) => ({
    request_id: 'request-1',
    status: 'pending',
    scheduled_start_at: '2026-09-25T10:00:00.000Z',
    invited_by_user_id: ME,
    participants: [
      { user_id: ME, accepted: true },
      { user_id: THEM, accepted: null },
    ],
    ...overrides,
  });
  const replaces = () => screen.getByLabelText('replaces').textContent;

  // geo-chat spells the same uuid dashed and dashless, so the modal's id need not match as written.
  it('finds the open one the viewer sent this person', () => {
    mocks.scheduled = [request()];
    setup(THEM.replace(/-/g, ''));
    expect(replaces()).toBe('2026-09-25T10:00:00.000Z');
  });

  it.each([
    ['one this person sent the viewer', { invited_by_user_id: THEM }],
    ['one already settled', { status: 'accepted' }],
    ['an admin-arranged match', { invited_by_user_id: null }],
    [
      'one to someone else',
      {
        participants: [
          { user_id: ME, accepted: true },
          { user_id: OTHER, accepted: null },
        ],
      },
    ],
  ])('ignores %s', (_label, overrides) => {
    mocks.scheduled = [request(overrides)];
    setup(THEM);
    expect(replaces()).toBe('nothing');
  });

  it('knows there is nothing to replace once the list has loaded empty', () => {
    setup(THEM);
    expect(replaces()).toBe('nothing');
    expect(screen.getByLabelText('unknown').textContent).toBe('false');
  });

  // The week can load before the list does, or without it. A time is still pickable, so what
  // sending may replace has to be said rather than read as nothing.
  it.each([['loading', 'pending'] as const, ['failed with nothing cached', 'error'] as const])(
    'treats a list that is %s as unknown',
    (_label, status) => {
      mocks.scheduled = undefined;
      mocks.scheduledStatus = status;
      setup(THEM);
      expect(replaces()).toBe('nothing');
      expect(screen.getByLabelText('unknown').textContent).toBe('true');
    }
  );
});
