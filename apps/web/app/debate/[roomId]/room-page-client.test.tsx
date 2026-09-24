import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sessionStatus: null as string | null,
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: vi.fn() }) }));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('~/core/debates/rooms/hooks', () => ({
  useDebateRoom: () => ({
    data: {
      room_id: 'room-1',
      access: { status: 'admitted' },
      starts_at: '2026-09-24T13:00:00.000Z',
      opens_at: '2026-09-24T12:50:00.000Z',
      scheduled_end_at: null,
      participants: [],
      occupants: [],
      waiting: null,
      rematch_session_id: 'session-1',
    },
    error: null,
    isError: false,
  }),
  useRoomPresence: () => ({ connectionId: 'c', rejoin: vi.fn() }),
  useDebateRoomPresence: () => null,
  useRoomSessionStatus: () => mocks.sessionStatus,
}));

vi.mock('../../space/[id]/(space)/debates/rematches/[sessionId]/rematch-page-client', () => ({
  DebateRematchPageClient: ({ sessionId }: { sessionId: string }) => <div>picker for {sessionId}</div>,
}));

const { DebateRoomPageClient } = await import('./room-page-client');

afterEach(() => {
  cleanup();
  mocks.sessionStatus = null;
  mocks.replace.mockReset();
});

describe('DebateRoomPageClient', () => {
  // Mounting the picker on a used room flashed its claims, then bounced into the finished debate.
  it('says a used room has already had its debate, rather than opening the picker', () => {
    mocks.sessionStatus = 'converted';
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText('That debate has already finished.')).toBeInTheDocument();
    expect(screen.queryByText(/picker for/)).not.toBeInTheDocument();
  });

  // Converting while the viewer is in the room is the handoff into the debate, which the picker does.
  it('keeps the picker through a conversion this visit saw happen', () => {
    mocks.sessionStatus = 'browsing';
    const view = render(<DebateRoomPageClient roomId="room-1" />);
    expect(screen.getByText('picker for session-1')).toBeInTheDocument();

    mocks.sessionStatus = 'converted';
    view.rerender(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText('picker for session-1')).toBeInTheDocument();
  });

  it('waits for the session status before choosing', () => {
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.queryByText(/picker for/)).not.toBeInTheDocument();
    expect(screen.getByText('Getting your claims ready…')).toBeInTheDocument();
  });
});
