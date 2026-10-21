import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { afterEach, describe, expect, it } from 'vitest';

import type { DebateRoomPresence } from './room-presence';
import { DebateRoomPresenceIndicator } from './room-presence-indicator';

afterEach(cleanup);

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

  it('shows nothing extra without a notice', () => {
    render(<DebateRoomPresenceIndicator opponentName="Jordan" presence={waiting} />);
    expect(screen.queryByText(/running/)).not.toBeInTheDocument();
  });
});
