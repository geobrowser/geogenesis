import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateRoomPresence } from './room-presence';
import { DebateRoomPresenceIndicator } from './room-presence-indicator';

const state = vi.hoisted(() => ({ requests: [] as unknown[] }));
vi.mock('./room-context', () => ({ useDebateRoomContext: () => ({ roomId: 'room-1' }) }));
vi.mock('./scheduling-hooks', () => ({ useScheduledDebates: () => ({ data: { requests: state.requests } }) }));
vi.mock('~/partials/availability/peer-availability-booking-modal', () => ({
  PeerAvailabilityBookingModal: ({ open, rescheduleRequestId }: { open: boolean; rescheduleRequestId: string }) =>
    open ? <div data-testid="week" data-request={rescheduleRequestId} /> : null,
}));

afterEach(() => {
  cleanup();
  state.requests = [];
});

const waiting: DebateRoomPresence = { state: 'waiting', opponentUserId: 'jordan', opponentPresent: false };

describe('DebateRoomPresenceIndicator: running late (GEO-3427, board 6b)', () => {
  it('says how late, what they wrote and when to expect them', () => {
    render(
      <DebateRoomPresenceIndicator
        opponentName="Jordan"
        presence={{
          ...waiting,
          opponentLate: { minutes: 10, expectedAt: '2026-10-21T17:13:00.000Z', note: 'Train is delayed, so sorry!' },
        }}
      />
    );

    expect(screen.getByText('Waiting for Jordan')).toBeInTheDocument();
    expect(screen.getByText('Jordan is running about 10 minutes late')).toBeInTheDocument();
    expect(screen.getByText('“Train is delayed, so sorry!”')).toBeInTheDocument();
    expect(screen.getByText(/^Expected by about /)).toBeInTheDocument();
  });

  it('replaces the guess about being on their way with what they said', () => {
    render(
      <DebateRoomPresenceIndicator
        opponentName="Jordan"
        presence={{
          ...waiting,
          state: 'waiting_elsewhere',
          opponentLate: { minutes: null, expectedAt: '2026-10-21T17:13:00.000Z', note: null },
        }}
      />
    );

    expect(screen.getByText('Jordan is running late')).toBeInTheDocument();
    expect(screen.queryByText(/may still be on their way/)).not.toBeInTheDocument();
  });

  // Board 6b: Reschedule beside the expected time, moving this debate without leaving the room.
  it('reschedules this debate from the card, in the late debater’s week', async () => {
    state.requests = [{ request_id: 'req-1', status: 'accepted', room_id: 'room-1', participants: [] }];
    render(
      <DebateRoomPresenceIndicator
        opponentName="Jordan"
        presence={{ ...waiting, opponentLate: { minutes: 10, expectedAt: '2026-10-21T17:13:00.000Z', note: null } }}
      />
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reschedule' }));
    expect(screen.getByTestId('week')).toHaveAttribute('data-request', 'req-1');
  });

  it('offers no Reschedule when the debate cannot be found', () => {
    render(
      <DebateRoomPresenceIndicator
        opponentName="Jordan"
        presence={{ ...waiting, opponentLate: { minutes: 10, expectedAt: '2026-10-21T17:13:00.000Z', note: null } }}
      />
    );
    expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
  });

  it('shows nothing extra without a notice', () => {
    render(<DebateRoomPresenceIndicator opponentName="Jordan" presence={waiting} />);
    expect(screen.queryByText(/running/)).not.toBeInTheDocument();
  });
});
