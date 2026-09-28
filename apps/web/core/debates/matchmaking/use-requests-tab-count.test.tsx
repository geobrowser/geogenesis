import { renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateActivity, DebateRequestsResponse } from '../api';

const mocks = vi.hoisted(() => ({
  schedulingEnabled: true,
  scheduled: undefined as { requests: { status: string; room_id: string | null }[] } | undefined,
}));

vi.mock('~/core/state/feature-flags', () => ({
  usePeerAvailabilityEnabled: () => mocks.schedulingEnabled,
}));

vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: mocks.scheduled }),
}));

// Expiry has its own suite; here every request handed in is live.
vi.mock('./use-request-countdown', () => ({
  useUnexpiredRequests: <T,>(requests: T[]) => requests,
  useLiveRequest: <T extends { status: string }>(request: T | null | undefined) =>
    request?.status === 'pending' ? request : null,
}));

const { useRequestsTabCount } = await import('./use-requests-tab-count');

const pendingRequest = { status: 'pending', expires_at: '2999-01-01T00:00:00Z' };

function count(input: {
  authenticated?: boolean;
  activity?: Partial<DebateActivity>;
  requests?: { outbound: unknown; incoming: unknown[] };
}) {
  const { result } = renderHook(() =>
    useRequestsTabCount({
      authenticated: input.authenticated ?? true,
      activity: input.activity as DebateActivity | undefined,
      requests: input.requests as DebateRequestsResponse | undefined,
    })
  );
  return result.current;
}

afterEach(() => {
  mocks.schedulingEnabled = true;
  mocks.scheduled = undefined;
});

describe('the Requests tab count', () => {
  it('counts sent and received instant requests', () => {
    expect(count({ requests: { outbound: pendingRequest, incoming: [pendingRequest, pendingRequest] } })).toBe(3);
  });

  it('counts a pending challenge whichever way it points', () => {
    expect(count({ activity: { challenge: pendingRequest } as Partial<DebateActivity> })).toBe(1);
  });

  it('leaves out a sent request that is no longer pending', () => {
    expect(count({ requests: { outbound: { ...pendingRequest, status: 'accepted' }, incoming: [] } })).toBe(0);
  });

  it('counts pending scheduled requests in both directions, and not booked ones', () => {
    mocks.scheduled = {
      requests: [
        { status: 'pending', room_id: null },
        { status: 'pending', room_id: null },
        { status: 'pending', room_id: 'room-1' },
        { status: 'declined', room_id: null },
      ],
    };

    expect(count({ activity: { scheduled_awaiting_answer_count: 1 } })).toBe(2);
  });

  it("falls back to activity's awaiting count until the scheduled list lands", () => {
    expect(count({ activity: { scheduled_awaiting_answer_count: 1 } })).toBe(1);
  });

  it('counts no scheduled requests with the flag off', () => {
    mocks.schedulingEnabled = false;
    mocks.scheduled = { requests: [{ status: 'pending', room_id: null }] };

    expect(count({ activity: { scheduled_awaiting_answer_count: 1 } })).toBe(0);
  });

  it('counts nothing signed out, whatever a stale cache says', () => {
    expect(count({ authenticated: false, requests: { outbound: pendingRequest, incoming: [pendingRequest] } })).toBe(0);
  });
});
