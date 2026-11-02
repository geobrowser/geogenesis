import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

import * as React from 'react';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  gateway: 'idle' as string,
  getSpaceChatMessages: vi.fn(),
}));

vi.mock('~/core/debates/hooks', () => ({
  useGeoChatAuth: () => ({ ready: true, authenticated: false, accountKey: null, getPrivyIdentityToken: vi.fn() }),
}));
vi.mock('~/core/debates/debate-gateway', () => ({
  useDebateGatewaySnapshot: () => ({ status: mocks.gateway }),
  useSpaceChatRoomScope: () => undefined,
}));
vi.mock('./api', () => ({ getSpaceChatMessages: mocks.getSpaceChatMessages }));

const { useSpaceChatRoom } = await import('./hooks');

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
  mocks.getSpaceChatMessages.mockImplementation(async () => ({ messages: [], next_before: null }));
});
afterEach(() => {
  cleanup();
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
