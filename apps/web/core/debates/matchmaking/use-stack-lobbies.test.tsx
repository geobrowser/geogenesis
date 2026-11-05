import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateLobbyCalendarRow } from '../api';

const mocks = vi.hoisted(() => ({
  week: [] as DebateLobbyCalendarRow[],
  auth: { ready: true, authenticated: true, accountKey: 'acct' as string | null },
}));

vi.mock('../hooks', () => ({ useGeoChatAuth: () => mocks.auth }));
vi.mock('../lobbies/hooks', () => ({ useDebateLobbyCalendar: () => ({ data: { lobbies: mocks.week } }) }));
vi.mock('../use-current-geo-chat-user-id', () => ({ useCurrentGeoChatUserId: () => 'viewer' }));
vi.mock('~/core/hooks/use-dismissed-notice', () => ({
  useDismissedNotices: () => ({ isDismissed: () => false, remember: vi.fn() }),
}));

const { useStackLobbies } = await import('./use-stack-lobbies');

function upcoming(overrides: Partial<DebateLobbyCalendarRow> = {}): DebateLobbyCalendarRow {
  const startsAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  return {
    lobby_id: 'tonight',
    name: 'AI policy night',
    scheduled: true,
    starts_at: startsAt,
    opens_at: startsAt,
    open: false,
    hosts: [],
    headcount: 0,
    avatars: [],
    debating_count: 0,
    reminder_count: 0,
    viewer_reminded: false,
    viewer_on_roster: false,
    state: 'upcoming',
    closed_at: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  mocks.auth = { ready: true, authenticated: true, accountKey: 'acct' };
});

/** Renders the hook, recording the lobby ids of every committed render. */
function renderCommitted(detailsLobbyId: { current: string | null } = { current: null }) {
  const committed: string[][] = [];
  const view = renderHook(() => {
    const stack = useStackLobbies(detailsLobbyId.current);
    React.useLayoutEffect(() => {
      committed.push(stack.lobbies.map(lobby => lobby.lobby_id));
    });
    return stack;
  });
  return { ...view, committed };
}

describe('useStackLobbies', () => {
  // GEO-3586 review: held from an effect, the lobby was committed gone for a frame after the RSVP,
  // and the stack began sliding its card out before the hold brought it back.
  it('never commits a just-RSVP’d lobby as gone before its Going pause', () => {
    vi.useFakeTimers();
    mocks.week = [upcoming()];
    const committed: string[][] = [];
    const { rerender } = renderHook(() => {
      const stack = useStackLobbies();
      React.useLayoutEffect(() => {
        committed.push(stack.lobbies.map(lobby => lobby.lobby_id));
      });
      return stack;
    });

    mocks.week = [upcoming({ viewer_reminded: true })];
    rerender();
    expect(committed).toEqual([['tonight'], ['tonight']]);

    vi.advanceTimersByTime(700);
    rerender();
    expect(committed.at(-1)).toEqual([]);
  });

  // GEO-3586 review: signing in swaps the signed-out week for the account's, and every lobby the
  // account had already RSVP'd to left the stack as a fresh RSVP would, showing Going first.
  it('lets lobbies RSVP’d before signing in leave at once, without the Going pause', () => {
    mocks.auth = { ready: true, authenticated: false, accountKey: null };
    mocks.week = [upcoming()];
    const { rerender, committed } = renderCommitted();

    mocks.auth = { ready: true, authenticated: true, accountKey: 'acct' };
    mocks.week = [upcoming({ viewer_reminded: true })];
    rerender();
    expect(committed.at(-1)).toEqual([]);
  });

  // GEO-3586 review: a held lobby that opened meanwhile was still drawn as an upcoming card.
  it('drops a held lobby that opens during its Going pause', () => {
    mocks.week = [upcoming()];
    const { rerender, committed } = renderCommitted();

    mocks.week = [upcoming({ viewer_reminded: true, open: true, state: 'open' })];
    rerender();
    expect(committed.at(-1)).toEqual([]);
  });

  // GEO-3586 review: an RSVP from inside the lobby's details took the card, and the details, away.
  it('keeps a just-RSVP’d lobby while its details are open, and lets it go once they close', () => {
    vi.useFakeTimers();
    const details = { current: 'tonight' as string | null };
    mocks.week = [upcoming()];
    const { rerender, committed } = renderCommitted(details);

    mocks.week = [upcoming({ viewer_reminded: true })];
    rerender();
    vi.advanceTimersByTime(800);
    rerender();
    expect(committed.at(-1)).toEqual(['tonight']);

    details.current = null;
    rerender();
    expect(committed.at(-1)).toEqual([]);
  });
});
