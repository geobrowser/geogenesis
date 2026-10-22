import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateRoomPresence } from './room-presence';
import { DebateRoomPresenceIndicator, RoomLateNotice } from './room-presence-indicator';

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

const late = { minutes: 10, expectedAt: '2026-10-21T17:13:00.000Z', note: 'Train is delayed, so sorry!' };

describe('DebateRoomPresenceIndicator: running late (GEO-3427)', () => {
  // The notice itself is in their video slot (RoomLateNotice); the pill above stays.
  it('keeps the pill, and replaces the guess about being on their way with nothing', () => {
    render(
      <DebateRoomPresenceIndicator
        opponentName="Jordan"
        presence={{ ...waiting, state: 'waiting_elsewhere', opponentLate: late }}
      />
    );

    expect(screen.getByText('Waiting for Jordan')).toBeInTheDocument();
    expect(screen.queryByText(/may still be on their way/)).not.toBeInTheDocument();
    expect(screen.queryByText(/running/)).not.toBeInTheDocument();
  });
});

describe('RoomLateNotice (GEO-3427, board 6b)', () => {
  it('says how late, what they wrote and when to expect them', () => {
    render(<RoomLateNotice opponentName="Jordan" opponentUserId="jordan" late={late} />);

    expect(screen.getByText('Jordan is running about 10 minutes late')).toBeInTheDocument();
    expect(screen.getByText('“Train is delayed, so sorry!”')).toBeInTheDocument();
    expect(screen.getByText(/^Expected by about /)).toBeInTheDocument();
  });

  it('says only that they are late when they gave no minutes', () => {
    render(<RoomLateNotice opponentName="Jordan" opponentUserId="jordan" late={{ ...late, minutes: null }} />);
    expect(screen.getByText('Jordan is running late')).toBeInTheDocument();
  });

  // Board 6b: Reschedule beside the expected time, moving this debate without leaving the room.
  it('reschedules this debate from the notice, in the late debater’s week', async () => {
    state.requests = [{ request_id: 'req-1', status: 'accepted', room_id: 'room-1', participants: [] }];
    render(<RoomLateNotice opponentName="Jordan" opponentUserId="jordan" late={late} />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Reschedule' }));
    expect(screen.getByTestId('week')).toHaveAttribute('data-request', 'req-1');
  });

  it('offers no Reschedule when the debate cannot be found', () => {
    render(<RoomLateNotice opponentName="Jordan" opponentUserId="jordan" late={late} />);
    expect(screen.queryByRole('button', { name: 'Reschedule' })).not.toBeInTheDocument();
  });
});
