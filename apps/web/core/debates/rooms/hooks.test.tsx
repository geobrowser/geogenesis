import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { describe, expect, it, vi } from 'vitest';

import type { DebateRoomView } from '../api';
import { useDebateRoomPresence } from './hooks';

const VIEWER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OPPONENT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// The room view sends dashed uuids; the session token's `user_id` is dashless. The hook has to
// compare them, so the fixtures use the two real spellings rather than one synthetic id.
const VIEWER_DASHLESS = VIEWER.replace(/-/g, '');

vi.mock('../use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => VIEWER_DASHLESS,
}));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('../debate-attention', () => ({ useDebateVisibility: () => true }));

function withQueryClient({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function room(occupants: string[], waiting: DebateRoomView['waiting'] = { reason: 'opponent_late' }): DebateRoomView {
  return {
    room_id: 'room-1',
    access: { status: 'admitted' },
    starts_at: '2026-09-22T09:00:00.000Z',
    opens_at: '2026-09-22T08:50:00.000Z',
    scheduled_end_at: null,
    participants: [VIEWER, OPPONENT],
    occupants,
    waiting,
    rematch_session_id: 'session-1',
  };
}

describe('useDebateRoomPresence', () => {
  it('reads the opponent across the dashed and dashless spellings', () => {
    const { result } = renderHook(() => useDebateRoomPresence(room([VIEWER, OPPONENT], null)));

    expect(result.current?.state).toBe('present');
    expect(result.current?.opponentUserId).toBe(OPPONENT);
  });

  // Whoever arrives second sees the room already occupied, so `opponentPresent` and the room id
  // change in the same commit.
  it('says they left when the opponent was already there on arrival', () => {
    const { result, rerender } = renderHook(({ view }) => useDebateRoomPresence(view), {
      initialProps: { view: room([VIEWER, OPPONENT], null) },
    });
    expect(result.current?.state).toBe('present');

    rerender({ view: room([VIEWER]) });
    expect(result.current?.state).toBe('left');
  });

  it('says they left when the opponent arrives and then goes', () => {
    const { result, rerender } = renderHook(({ view }) => useDebateRoomPresence(view), {
      initialProps: { view: room([VIEWER]) },
    });
    expect(result.current?.state).toBe('waiting');

    rerender({ view: room([VIEWER, OPPONENT], null) });
    expect(result.current?.state).toBe('present');

    rerender({ view: room([VIEWER]) });
    expect(result.current?.state).toBe('left');
  });

  // Someone who never came is not someone who left.
  it('keeps waiting when the opponent has never been seen', () => {
    const { result, rerender } = renderHook(({ view }) => useDebateRoomPresence(view), {
      initialProps: { view: room([VIEWER]) },
    });
    rerender({ view: room([VIEWER]) });

    expect(result.current?.state).toBe('waiting');
  });

  // One room's memory must not describe another.
  it('forgets the opponent when the room changes', () => {
    const { result, rerender } = renderHook(({ view }) => useDebateRoomPresence(view), {
      initialProps: { view: room([VIEWER, OPPONENT], null) },
    });
    expect(result.current?.state).toBe('present');

    rerender({ view: { ...room([VIEWER]), room_id: 'room-2' } });
    expect(result.current?.state).toBe('waiting');
  });
});

describe('useRoomPresence', () => {
  it('sends the departure with keepalive, so a closing tab still records it', async () => {
    const { renderHook: render } = await import('@testing-library/react');
    const { useRoomPresence } = await import('./hooks');
    const api = await import('../api');
    const spy = vi.spyOn(api, 'setDebateRoomPresence').mockResolvedValue({} as never);

    const { unmount } = render(() => useRoomPresence('room-1', true), { wrapper: withQueryClient });
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    unmount();
    await vi.waitFor(() => expect(spy.mock.calls.some(call => call[1].joined === false)).toBe(true));

    const leave = spy.mock.calls.find(call => call[1].joined === false);
    // The fifth argument is `keepalive`. Without it the request dies with the document and the
    // opponent keeps seeing a green "is here" for someone who has gone.
    expect(leave?.[4]).toBe(true);
    spy.mockRestore();
  });

  // Occupancy is the latest event per connection, so a join still on the wire when the leave goes
  // out would land after it and leave the viewer an occupant. StrictMode's mount, cleanup, mount is
  // exactly that sequence.
  it('sends the leave only after an in-flight join has settled', async () => {
    const { renderHook: render } = await import('@testing-library/react');
    const { useRoomPresence } = await import('./hooks');
    const api = await import('../api');
    // Held on an object so TypeScript does not narrow it to `null` past the closure assignment.
    const join: { settle: (() => void) | null } = { settle: null };
    const spy = vi.spyOn(api, 'setDebateRoomPresence').mockImplementation((_room, body) =>
      body.joined
        ? new Promise(resolve => {
            join.settle = () => resolve({} as never);
          })
        : Promise.resolve({} as never)
    );

    const { unmount } = render(() => useRoomPresence('room-1', true), { wrapper: withQueryClient });
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    unmount();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(spy).toHaveBeenCalledTimes(1);

    join.settle?.();
    await vi.waitFor(() => expect(spy.mock.calls.some(call => call[1].joined === false)).toBe(true));
    spy.mockRestore();
  });

  // The queue's ordering guarantee is worth nothing at `pagehide`: there is no later turn for a
  // queued continuation to run in, so a leave behind an in-flight join is simply never sent.
  it('sends the leave during pagehide even while the join is still in flight', async () => {
    const { renderHook: render } = await import('@testing-library/react');
    const { useRoomPresence } = await import('./hooks');
    const api = await import('../api');
    const join: { settle: (() => void) | null } = { settle: null };
    const spy = vi.spyOn(api, 'setDebateRoomPresence').mockImplementation((_room, body) =>
      body.joined
        ? new Promise(resolve => {
            join.settle = () => resolve({} as never);
          })
        : Promise.resolve({} as never)
    );

    const { unmount } = render(() => useRoomPresence('room-1', true), { wrapper: withQueryClient });
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // The join never settles, which is the tab closing mid-request.
    window.dispatchEvent(new Event('pagehide'));

    await vi.waitFor(() => expect(spy.mock.calls.some(call => call[1].joined === false)).toBe(true));
    const leave = spy.mock.calls.find(call => call[1].joined === false);
    expect(leave?.[4]).toBe(true);
    // The presence queue is module state: a join left hanging would stall every later test's sends.
    join.settle?.();
    unmount();
    spy.mockRestore();
  });

  // A repeat join is how a room with a finished session gets a new one; the room page sends it.
  it('sends another join when asked to rejoin', async () => {
    const { renderHook: render } = await import('@testing-library/react');
    const { useRoomPresence } = await import('./hooks');
    const api = await import('../api');
    const spy = vi.spyOn(api, 'setDebateRoomPresence').mockResolvedValue({} as never);

    const { result } = render(() => useRoomPresence('room-1', true), { wrapper: withQueryClient });
    await vi.waitFor(() => expect(spy.mock.calls.filter(call => call[1].joined).length).toBe(1));

    await expect(result.current.rejoin()).resolves.toBe(true);

    await vi.waitFor(() => expect(spy.mock.calls.filter(call => call[1].joined).length).toBe(2));
    spy.mockRestore();
  });

  // Occupancy is the latest event per connection, so a join retried after the leave would record
  // someone who has gone as present until the room closes.
  it('does not retry a failed join once the viewer has left', async () => {
    const { renderHook: render } = await import('@testing-library/react');
    const { useRoomPresence } = await import('./hooks');
    const api = await import('../api');
    vi.useFakeTimers();
    const spy = vi
      .spyOn(api, 'setDebateRoomPresence')
      .mockImplementation((_room, body) =>
        body.joined ? Promise.reject(new Error('offline')) : Promise.resolve({} as never)
      );
    try {
      const { unmount } = render(() => useRoomPresence('room-1', true), { wrapper: withQueryClient });
      await vi.advanceTimersByTimeAsync(0);
      expect(spy.mock.calls.filter(call => call[1].joined)).toHaveLength(1);

      // Leaves while that failed join waits to retry.
      unmount();
      await vi.advanceTimersByTimeAsync(30_000);

      const kinds = spy.mock.calls.map(call => call[1].joined);
      expect(kinds).toContain(false);
      expect(kinds.slice(kinds.indexOf(false))).not.toContain(true);
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('useFinishedRoomIds', () => {
  const upcoming = (roomId: string, sessionId: string | null) => ({
    room_id: roomId,
    starts_at: '2026-09-22T09:00:00.000Z',
    opens_at: '2026-09-22T08:50:00.000Z',
    joinable: true,
    due: true,
    others_present: false,
    rematch_session_id: sessionId,
  });

  it('names the rooms whose session has become a debate', async () => {
    const { renderHook: render } = await import('@testing-library/react');
    const { useFinishedRoomIds } = await import('./hooks');
    const api = await import('../api');
    const spy = vi
      .spyOn(api, 'getDebateRematch')
      .mockImplementation(
        async sessionId => ({ status: sessionId === 'session-done' ? 'converted' : 'browsing' }) as never
      );
    const rooms = [
      upcoming('room-done', 'session-done'),
      upcoming('room-open', 'session-open'),
      upcoming('room-new', null),
    ];

    const { result } = render(() => useFinishedRoomIds(rooms), { wrapper: withQueryClient });

    await vi.waitFor(() => expect([...result.current]).toEqual(['room-done']));
    // A room with no session yet has nothing to ask about.
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
