import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api';
import { GeoChatRequestError, type ScheduledDebateRequest } from '../api';
import { debateQueryKeys } from '../hooks';
import { useScheduledDebates } from './scheduling-hooks';

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('../debate-attention', () => ({ useDebateVisibility: () => true }));

const listing = (requestId: string) => ({ requests: [{ request_id: requestId } as ScheduledDebateRequest] });

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useScheduledDebates', () => {
  // The gateway retries a failed invalidation three times and then gives up with the socket still
  // ready, so no reconnect reconciles it. The mounted list has to recover on its own.
  it('recovers after an event-triggered refetch fails past its retries, with no further event', async () => {
    vi.useFakeTimers();
    // jsdom reports the document hidden, and react-query skips interval refetches while unfocused.
    focusManager.setFocused(true);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const list = vi.spyOn(api, 'listScheduledDebates').mockResolvedValue(listing('before') as never);

    // Read during render, as the Requests tab does, so react-query tracks both fields.
    const { result } = renderHook(
      () => {
        const { data, isError } = useScheduledDebates();
        return { data, isError };
      },
      { wrapper }
    );
    await vi.waitFor(() => expect(result.current.data?.requests[0]?.request_id).toBe('before'));

    // The event's refetch and the gateway's three retries, all rate limited.
    list.mockRejectedValue(new GeoChatRequestError('slow down', 'rate_limited', 429));
    for (let attempt = 0; attempt < 4; attempt++) {
      await client.invalidateQueries({ queryKey: debateQueryKeys.scheduledDebates('acct'), refetchType: 'active' });
    }
    await vi.waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data?.requests[0]?.request_id).toBe('before');

    list.mockResolvedValue(listing('after') as never);
    await vi.advanceTimersByTimeAsync(60_000);

    await vi.waitFor(() => expect(result.current.data?.requests[0]?.request_id).toBe('after'));
  });
});
