import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

type Query<T> = { data: T | undefined; isLoading: boolean };

const mocks = vi.hoisted(() => ({
  session: { data: undefined, isLoading: true } as {
    data: { status: string; converted_debate_id: string | null } | undefined;
    isLoading: boolean;
  },
  debateStatus: { data: undefined, isLoading: false } as { data: string | undefined; isLoading: boolean },
  replace: vi.fn(),
  access: { status: 'admitted' } as { status: string; opens_at?: string },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace, push: vi.fn() }) }));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('~/core/debates/rooms/hooks', () => ({
  useDebateRoom: () => ({
    data: {
      room_id: 'room-1',
      access: mocks.access,
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
  useRoomSession: () => mocks.session,
  useDebateStatus: (debateId: string | null) =>
    debateId ? mocks.debateStatus : ({ data: undefined, isLoading: false } satisfies Query<string>),
}));

vi.mock('../../space/[id]/(space)/debates/rematches/[sessionId]/rematch-page-client', () => ({
  DebateRematchPageClient: ({ sessionId }: { sessionId: string }) => <div>picker for {sessionId}</div>,
}));

const { DebateRoomPageClient } = await import('./room-page-client');

const live = (status: string) => ({ data: { status, converted_debate_id: null }, isLoading: false });
const converted = { data: { status: 'converted', converted_debate_id: 'debate-1' }, isLoading: false };

afterEach(() => {
  cleanup();
  mocks.session = { data: undefined, isLoading: true };
  mocks.debateStatus = { data: undefined, isLoading: false };
  mocks.replace.mockReset();
  mocks.access = { status: 'admitted' };
});

describe('DebateRoomPageClient', () => {
  // Someone early has nothing to do here yet, so the notice says when and sends them somewhere useful.
  it('tells an early arrival when the room opens and offers Explore', () => {
    mocks.access = { status: 'not_yet_open', opens_at: '2026-09-24T12:50:00.000Z' };
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(
      screen.getByText(/^The debate room opens 10 minutes early at .+\. In the meantime explore Geo\.$/)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '/explore');
    expect(screen.queryByText(/picker for/)).not.toBeInTheDocument();
  });

  // geo-chat stores the lead per room, so the copy follows the room rather than a constant.
  it('reads how early the room opens off the room itself', () => {
    mocks.access = { status: 'not_yet_open', opens_at: '2026-09-24T12:45:00.000Z' };
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText(/^The debate room opens 15 minutes early at /)).toBeInTheDocument();
  });

  // Mounting the picker on a used room flashed its claims, then bounced into the finished debate.
  it('says a room whose debate is over has already had it', () => {
    mocks.session = converted;
    mocks.debateStatus = { data: 'complete', isLoading: false };
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText('That debate has already finished.')).toBeInTheDocument();
    expect(screen.queryByText(/picker for/)).not.toBeInTheDocument();
  });

  // A session converts on acceptance, while the debate is still to happen: a refresh mid-handoff or
  // a second tab must still get the picker, which routes into the live debate.
  it('opens the picker for a converted session whose debate is live', () => {
    mocks.session = converted;
    mocks.debateStatus = { data: 'ready', isLoading: false };
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText('picker for session-1')).toBeInTheDocument();
  });

  it('keeps the picker through a conversion this visit saw happen', () => {
    mocks.session = live('browsing');
    const view = render(<DebateRoomPageClient roomId="room-1" />);
    expect(screen.getByText('picker for session-1')).toBeInTheDocument();

    mocks.session = converted;
    mocks.debateStatus = { data: undefined, isLoading: true };
    view.rerender(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText('picker for session-1')).toBeInTheDocument();
  });

  it('says a cancelled debate has already had its turn too', () => {
    mocks.session = converted;
    mocks.debateStatus = { data: 'cancelled', isLoading: false };
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText('That debate has already finished.')).toBeInTheDocument();
  });

  // Mounting the picker before the debate's status is known would flash it and redirect.
  it('waits while the debate is being read', () => {
    mocks.session = converted;
    mocks.debateStatus = { data: undefined, isLoading: true };
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.queryByText(/picker for/)).not.toBeInTheDocument();
    expect(screen.getByText('Getting your claims ready…')).toBeInTheDocument();
  });

  it('waits while the session is being read', () => {
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.queryByText(/picker for/)).not.toBeInTheDocument();
    expect(screen.getByText('Getting your claims ready…')).toBeInTheDocument();
  });

  // A failed read is not a reason to strand anyone on a spinner.
  it('falls back to the picker when the session cannot be read', () => {
    mocks.session = { data: undefined, isLoading: false };
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText('picker for session-1')).toBeInTheDocument();
  });

  it('falls back to the picker when the debate cannot be read', () => {
    mocks.session = converted;
    mocks.debateStatus = { data: undefined, isLoading: false };
    render(<DebateRoomPageClient roomId="room-1" />);

    expect(screen.getByText('picker for session-1')).toBeInTheDocument();
  });
});
