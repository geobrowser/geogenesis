import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api';
import { GeoChatRequestError, type ScheduledDebateRequest } from '../api';
import { debateQueryKeys } from '../hooks';
import {
  useCreateScheduledDebate,
  useRescheduleScheduledDebate,
  useRespondToScheduledDebate,
  useScheduledDebates,
} from './scheduling-hooks';

const capture = vi.hoisted(() => vi.fn());
vi.mock('~/core/analytics', () => ({ capture }));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('../debate-attention', () => ({ useDebateVisibility: () => true }));

const listing = (requestId: string) => ({ requests: [{ request_id: requestId } as ScheduledDebateRequest] });

afterEach(() => {
  capture.mockClear();
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

function mutationWrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

// Analytics rides on the server's answer, in the hook rather than at the call site: a shared link's
// modal can close while the request is in flight, and a caller's own callbacks die with it.
describe('scheduling analytics', () => {
  const startsAt = new Date(Date.now() + 3 * 3_600_000);
  const sent = { request_id: 'req-1' } as ScheduledDebateRequest;

  it('records a sent request with where it came from, once the server accepts it', async () => {
    vi.spyOn(api, 'createScheduledDebate').mockResolvedValue(sent);
    const { result } = renderHook(() => useCreateScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() =>
      result.current.mutateAsync({
        opponentUserId: 'them',
        startsAt,
        minutes: 30,
        analytics: { entry: 'people_time', viewerIsFree: true },
      })
    );

    expect(capture).toHaveBeenCalledWith('debate_scheduled_request_sent', {
      mode: 'request',
      entry: 'people_time',
      request_id: 'req-1',
      viewer_is_free: true,
      lead_time_minutes: 180,
    });
  });

  it('records a moved request as a reschedule', async () => {
    vi.spyOn(api, 'rescheduleScheduledDebate').mockResolvedValue(sent);
    const { result } = renderHook(() => useRescheduleScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() =>
      result.current.mutateAsync({
        requestId: 'req-1',
        startsAt,
        minutes: 30,
        analytics: { entry: 'reschedule_link', viewerIsFree: null },
      })
    );

    expect(capture).toHaveBeenCalledWith(
      'debate_scheduled_request_sent',
      expect.objectContaining({ mode: 'reschedule', entry: 'reschedule_link', viewer_is_free: null })
    );
  });

  it("records a refusal by status and code, never geo-chat's message", async () => {
    vi.spyOn(api, 'createScheduledDebate').mockRejectedValue(
      new GeoChatRequestError('Ada is already booked then', 'slot_taken', 409)
    );
    const { result } = renderHook(() => useCreateScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() =>
      result.current.mutateAsync({ opponentUserId: 'them', startsAt, minutes: 30 }).catch(() => undefined)
    );

    expect(capture).toHaveBeenCalledWith('debate_scheduled_request_failed', {
      mode: 'request',
      entry: 'unknown',
      error_name: 'GeoChatRequestError',
      error_status: 409,
      error_code: 'slot_taken',
    });
    expect(JSON.stringify(capture.mock.calls)).not.toContain('Ada');
  });

  it('records an answer, telling a clash apart from a recorded one', async () => {
    vi.spyOn(api, 'respondToScheduledDebate').mockResolvedValue({
      outcome: 'conflict',
      conflicting_request_id: 'other',
      conflicting_start_at: startsAt.toISOString(),
      conflicting_end_at: startsAt.toISOString(),
    });
    const { result } = renderHook(() => useRespondToScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() => result.current.mutateAsync({ requestId: 'req-1', accepted: true }));

    expect(capture).toHaveBeenCalledWith('debate_scheduled_request_answered', {
      request_id: 'req-1',
      accepted: true,
      outcome: 'conflict',
    });
  });
});
