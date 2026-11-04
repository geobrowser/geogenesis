import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gateway: 'idle' as string,
  getSpaceChatMessages: vi.fn(),
  listSpaceChatRooms: vi.fn(),
  postSpaceChatMessage: vi.fn(),
  setSpaceChatReaction: vi.fn(),
  authenticated: false,
  visible: true,
  scope: vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({
    ready: true,
    authenticated: mocks.authenticated,
    accountKey: mocks.authenticated ? 'account' : null,
    getPrivyIdentityToken: vi.fn(),
  }),
}));
vi.mock('~/core/debates/debate-gateway', () => ({
  useSpaceChatRoomScope: (...args: unknown[]) => {
    mocks.scope(...args);
    return mocks.gateway === 'ready';
  },
}));
vi.mock('~/core/debates/debate-attention', () => ({ useDebateVisibility: () => mocks.visible }));
vi.mock('./api', () => ({
  getSpaceChatMessages: mocks.getSpaceChatMessages,
  listSpaceChatRooms: mocks.listSpaceChatRooms,
  postSpaceChatMessage: mocks.postSpaceChatMessage,
  setSpaceChatReaction: mocks.setSpaceChatReaction,
}));

const { useSpaceChatRoom, useSpaceChatRooms } = await import('./hooks');

const ROOM = { id: 'room1', space_id: 'space1', kind: 'member' as const };
const message = (n: number) => ({
  id: `0195000000007000800000000000${String(n).padStart(4, '0')}`,
  room_id: 'room1',
  room_kind: 'member' as const,
  author_id: 'a',
  client_nonce: `c-${n}`,
  reply_to_message_id: null,
  body: `m${n}`,
  attachment_ids: [],
  created_at: '2026-11-02T12:00:00Z',
  edited_at: null,
  deleted_at: null,
  reactions: [],
});

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mocks.getSpaceChatMessages.mockReset();
  mocks.postSpaceChatMessage.mockReset();
  mocks.getSpaceChatMessages.mockImplementation(async () => ({ messages: [], next_before: null }));
});
afterEach(() => {
  cleanup();
  mocks.authenticated = false;
  mocks.visible = true;
  mocks.gateway = 'idle';
  mocks.scope.mockReset();
  vi.useRealTimers();
});

describe('useSpaceChatRoom signed out', () => {
  it('reads the first page, polls after the newest message, and reads in full again every 30s', async () => {
    mocks.getSpaceChatMessages.mockResolvedValueOnce({ messages: [message(2), message(1)], next_before: null });
    const { result } = renderHook(() => useSpaceChatRoom(ROOM), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(mocks.getSpaceChatMessages.mock.calls[0]![1]).toMatchObject({ limit: 50 });
    expect(mocks.getSpaceChatMessages.mock.calls[0]![1].after).toBeUndefined();

    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(mocks.getSpaceChatMessages).toHaveBeenCalledTimes(2));
    expect(mocks.getSpaceChatMessages.mock.calls[1]![1]).toMatchObject({ after: message(2).id, limit: 20 });

    await vi.advanceTimersByTimeAsync(30_000);
    const full = mocks.getSpaceChatMessages.mock.calls.slice(2).filter(call => call[1].after === undefined);
    expect(full.length).toBeGreaterThan(0);
  });
});

describe('useSpaceChatRoom send', () => {
  it('resends a failed draft with its nonce, and a new draft with a new one', async () => {
    mocks.authenticated = true;
    mocks.gateway = 'ready';
    mocks.postSpaceChatMessage.mockRejectedValueOnce(new Error('network')).mockImplementation(async (_room, body) => ({
      ...message(9),
      client_nonce: body.client_nonce,
    }));
    const { result } = renderHook(() => useSpaceChatRoom(ROOM), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await expect(result.current.send('hello', null)).rejects.toThrow('network');
    await result.current.send('hello', null);
    await result.current.send('another', null);
    const nonces = mocks.postSpaceChatMessage.mock.calls.map(call => call[1].client_nonce);
    expect(nonces[1]).toBe(nonces[0]);
    expect(nonces[2]).not.toBe(nonces[0]);
    mocks.gateway = 'idle';
  });

  it('keeps a failed send’s nonce across other sends, per reply target, until it succeeds', async () => {
    mocks.authenticated = true;
    mocks.gateway = 'ready';
    mocks.postSpaceChatMessage
      .mockRejectedValueOnce(new Error('timeout'))
      .mockImplementation(async (_room, body) => ({ ...message(9), client_nonce: body.client_nonce }));
    const { result } = renderHook(() => useSpaceChatRoom(ROOM), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await expect(result.current.send('yes', 'reply-target')).rejects.toThrow('timeout');
    await result.current.send('in between', null);
    await result.current.send('yes', null);
    await result.current.send('yes', 'reply-target');
    await result.current.send('yes', 'reply-target');
    const nonces = mocks.postSpaceChatMessage.mock.calls.map(call => call[1].client_nonce);
    // The retry after another send reuses the failed nonce; the same text without the reply does not.
    expect(nonces[3]).toBe(nonces[0]);
    expect(nonces[1]).not.toBe(nonces[0]);
    expect(nonces[2]).not.toBe(nonces[0]);
    // Once it succeeded, sending the same reply again is a new message.
    expect(nonces[4]).not.toBe(nonces[0]);
    mocks.gateway = 'idle';
  });
});

describe('useSpaceChatRoom react', () => {
  it('holds a tap until its response settles it, and drops it on failure', async () => {
    mocks.authenticated = true;
    mocks.gateway = 'ready';
    mocks.getSpaceChatMessages.mockResolvedValueOnce({ messages: [message(1)], next_before: null });
    let answer: (value: unknown) => void = () => undefined;
    mocks.setSpaceChatReaction.mockImplementationOnce(() => new Promise(resolve => (answer = resolve)));
    mocks.setSpaceChatReaction.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useSpaceChatRoom(ROOM), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const settled = result.current.react(message(1).id, '👍', true);
    await waitFor(() => expect(result.current.state?.pendingReactions).toHaveLength(1));
    answer({ reaction_version: 1, reactions: [{ value: '👍', count: 1, reacted: true }] });
    await settled;
    await waitFor(() => expect(result.current.state?.pendingReactions).toEqual([]));
    expect(result.current.state?.messages[0]?.reactions).toEqual([{ value: '👍', count: 1, reacted: true }]);

    await expect(result.current.react(message(1).id, '🎉', true)).rejects.toThrow('network');
    await waitFor(() => expect(result.current.state?.pendingReactions).toEqual([]));
    expect(result.current.state?.messages[0]?.reactions).toEqual([{ value: '👍', count: 1, reacted: true }]);
    mocks.gateway = 'idle';
  });
});

describe('useSpaceChatRoom live signed out', () => {
  it('holds the room on the public connection while visible, and lets it go when hidden', async () => {
    const { rerender } = renderHook(() => useSpaceChatRoom(ROOM), { wrapper });
    expect(mocks.scope).toHaveBeenLastCalledWith(ROOM, true, false);
    mocks.visible = false;
    rerender();
    expect(mocks.scope).toHaveBeenLastCalledWith(ROOM, false, false);
  });

  it('never holds an editor room signed out', () => {
    renderHook(() => useSpaceChatRoom({ ...ROOM, kind: 'editor' }), { wrapper });
    expect(mocks.scope).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'editor' }), false, false);
  });

  it('stops polling while the socket is ready, and polls again when it drops', async () => {
    mocks.gateway = 'ready';
    const { result, rerender } = renderHook(() => useSpaceChatRoom(ROOM), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const reads = mocks.getSpaceChatMessages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mocks.getSpaceChatMessages.mock.calls.length).toBe(reads);

    mocks.gateway = 'degraded';
    rerender();
    await vi.advanceTimersByTimeAsync(5_000);
    await waitFor(() => expect(mocks.getSpaceChatMessages.mock.calls.length).toBeGreaterThan(reads));
  });

  it('moves the room to the account connection on sign-in', async () => {
    const { rerender } = renderHook(() => useSpaceChatRoom(ROOM), { wrapper });
    expect(mocks.scope).toHaveBeenLastCalledWith(ROOM, true, false);
    mocks.authenticated = true;
    rerender();
    expect(mocks.scope).toHaveBeenLastCalledWith(ROOM, true, true);
  });
});

describe('useSpaceChatRooms', () => {
  it('re-reads the room list on window focus once it is stale', async () => {
    mocks.listSpaceChatRooms.mockReset();
    mocks.listSpaceChatRooms.mockResolvedValue({ rooms: [] });
    const { result } = renderHook(() => useSpaceChatRooms('space-1', true), { wrapper });
    await waitFor(() => expect(result.current.data?.supported).toBe(true));
    expect(mocks.listSpaceChatRooms).toHaveBeenCalledTimes(1);

    focusManager.setFocused(false);
    focusManager.setFocused(true);
    expect(mocks.listSpaceChatRooms).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_001);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await waitFor(() => expect(mocks.listSpaceChatRooms).toHaveBeenCalledTimes(2));
    focusManager.setFocused(undefined);
  });
});
