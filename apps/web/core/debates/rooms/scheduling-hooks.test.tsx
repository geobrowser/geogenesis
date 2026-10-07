import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';

import * as React from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as api from '../api';
import { GeoChatRequestError, type ScheduledDebateRequest } from '../api';
import { debateQueryKeys } from '../hooks';
import {
  useAdminScheduledDebates,
  useCreateScheduledDebate,
  useRescheduleScheduledDebate,
  useRespondToScheduledDebate,
  useScheduledDebates,
} from './scheduling-hooks';

const { capture, revision } = vi.hoisted(() => ({ capture: vi.fn(), revision: { current: 0 } }));
vi.mock('~/core/analytics', () => ({ capture, analyticsContextRevision: () => revision.current }));

vi.mock('../hooks', async importOriginal => ({
  ...(await importOriginal<typeof import('../hooks')>()),
  useGeoChatAuth: () => ({ ready: true, authenticated: true, accountKey: 'acct', getPrivyIdentityToken: vi.fn() }),
}));

vi.mock('../debate-attention', () => ({ useDebateVisibility: () => true }));

const listing = (requestId: string) => ({ requests: [{ request_id: requestId } as ScheduledDebateRequest] });

afterEach(() => {
  capture.mockClear();
  revision.current = 0;
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

describe('useAdminScheduledDebates', () => {
  const from = new Date(2026, 9, 4);
  const wrapper = () => {
    const client = new QueryClient();
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

  it('takes a refusal as the answer: asked once, never an admin', async () => {
    const list = vi
      .spyOn(api, 'listAdminScheduledDebates')
      .mockRejectedValue(new GeoChatRequestError('no', 'scheduling_admin_required', 403));
    const { result } = renderHook(() => useAdminScheduledDebates(true, from), { wrapper: wrapper() });

    await vi.waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isAdmin).toBe(false);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('retries a failure that is not a refusal, so one bad request does not hide the admin view', async () => {
    vi.useFakeTimers();
    vi.spyOn(api, 'listAdminScheduledDebates')
      .mockRejectedValueOnce(new GeoChatRequestError('down', 'internal', 500))
      .mockResolvedValue({ matches: [] });
    const { result } = renderHook(() => useAdminScheduledDebates(true, from), { wrapper: wrapper() });

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.waitFor(() => expect(result.current.isAdmin).toBe(true));
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
      error_code: 'slot_taken',
      http_status: 409,
      error_name: 'GeoChatRequestError',
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

  // GEO-3073's canonical record, alongside the scheduling events: the same `start_debate` and
  // `join_debate` the instant challenge and request cards report, told apart by target type.
  it('reports a booking as a canonical start_debate against the other debater', async () => {
    vi.spyOn(api, 'createScheduledDebate').mockResolvedValue(sent);
    const { result } = renderHook(() => useCreateScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() => result.current.mutateAsync({ opponentUserId: 'them', startsAt, minutes: 30 }));

    expect(capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({
        action_kind: 'start_debate',
        component: 'debate_matchmaking',
        target_type: 'debate_user',
        target_id: 'them',
        outcome: 'succeeded',
      })
    );
  });

  it('reports an acceptance as join_debate, and a decline as no action at all', async () => {
    vi.spyOn(api, 'respondToScheduledDebate').mockResolvedValue({ outcome: 'recorded', ...sent });
    const { result } = renderHook(() => useRespondToScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() => result.current.mutateAsync({ requestId: 'req-1', accepted: false }));
    expect(capture).not.toHaveBeenCalledWith('action_completed', expect.anything());

    await act(() => result.current.mutateAsync({ requestId: 'req-1', accepted: true }));
    expect(capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({
        action_kind: 'join_debate',
        target_type: 'scheduled_debate_request',
        target_id: 'req-1',
      })
    );
  });

  // An answer that lands after a sign-out or account switch belongs to the account that asked, which
  // is no longer the one analytics would file it under.
  it('drops a sent request whose account changed before geo-chat answered', async () => {
    vi.spyOn(api, 'createScheduledDebate').mockImplementation(() => settleAfterSwitch(sent));
    const { result } = renderHook(() => useCreateScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() => result.current.mutateAsync({ opponentUserId: 'them', startsAt, minutes: 30 }));

    expect(capture).not.toHaveBeenCalledWith('debate_scheduled_request_sent', expect.anything());
  });

  it('drops a refused request whose account changed before geo-chat answered', async () => {
    vi.spyOn(api, 'createScheduledDebate').mockImplementation(() =>
      settleAfterSwitch(new GeoChatRequestError('no', 'slot_taken', 409), true)
    );
    const { result } = renderHook(() => useCreateScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() =>
      result.current.mutateAsync({ opponentUserId: 'them', startsAt, minutes: 30 }).catch(() => undefined)
    );

    expect(capture).not.toHaveBeenCalledWith('debate_scheduled_request_failed', expect.anything());
  });

  it('drops a moved or refused reschedule whose account changed before geo-chat answered', async () => {
    const move = vi.spyOn(api, 'rescheduleScheduledDebate').mockImplementation(() => settleAfterSwitch(sent));
    const { result } = renderHook(() => useRescheduleScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() => result.current.mutateAsync({ requestId: 'req-1', startsAt, minutes: 30 }));
    move.mockImplementation(() => settleAfterSwitch(new GeoChatRequestError('no', 'slot_taken', 409), true));
    await act(() => result.current.mutateAsync({ requestId: 'req-1', startsAt, minutes: 30 }).catch(() => undefined));

    expect(capture).not.toHaveBeenCalledWith('debate_scheduled_request_sent', expect.anything());
    expect(capture).not.toHaveBeenCalledWith('debate_scheduled_request_failed', expect.anything());
  });

  it('reports a clashing acceptance as a failed join_debate, while the Requests tab still gets the clash', async () => {
    const clash = {
      outcome: 'conflict' as const,
      conflicting_request_id: 'other',
      conflicting_start_at: startsAt.toISOString(),
      conflicting_end_at: startsAt.toISOString(),
    };
    vi.spyOn(api, 'respondToScheduledDebate').mockResolvedValue(clash);
    const { result } = renderHook(() => useRespondToScheduledDebate(), { wrapper: mutationWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ requestId: 'req-1', accepted: true })).resolves.toEqual(clash);
    });

    expect(capture).toHaveBeenCalledWith(
      'action_completed',
      expect.objectContaining({ action_kind: 'join_debate', outcome: 'failed', failure_code: 'conflict' })
    );
    expect(capture).not.toHaveBeenCalledWith('action_completed', expect.objectContaining({ outcome: 'succeeded' }));
  });

  it('drops an answer whose account changed before geo-chat recorded it', async () => {
    vi.spyOn(api, 'respondToScheduledDebate').mockImplementation(() =>
      settleAfterSwitch({ outcome: 'recorded', ...sent })
    );
    const { result } = renderHook(() => useRespondToScheduledDebate(), { wrapper: mutationWrapper() });

    await act(() => result.current.mutateAsync({ requestId: 'req-1', accepted: false }));

    expect(capture).not.toHaveBeenCalledWith('debate_scheduled_request_answered', expect.anything());
  });
});

/** Geo-chat's answer, arriving after the analytics identity has moved on. */
function settleAfterSwitch<T>(value: T, reject = false): Promise<never> {
  revision.current += 1;
  return (reject ? Promise.reject(value) : Promise.resolve(value)) as Promise<never>;
}
