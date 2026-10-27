import { renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateActivity, DebateRequestsResponse } from '../api';

const mocks = vi.hoisted(() => ({
  scheduled: undefined as
    { requests: { status: string; room_id: string | null; scheduled_start_at?: string }[] } | undefined,
}));

vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: () => ({ data: mocks.scheduled }),
}));

// Expiry has its own suite. This stands in with the same rule: a finite past expiry is dropped, and
// an unparseable one is kept.
vi.mock('./use-request-countdown', () => ({
  useUnexpiredRequests: <T extends { expires_at: string }>(requests: T[]) =>
    requests.filter(request => !(new Date(request.expires_at).getTime() <= Date.now())),
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
  mocks.scheduled = undefined;
});

describe('the Requests tab count', () => {
  it('counts sent and received instant requests', () => {
    expect(count({ requests: { outbound: pendingRequest, incoming: [pendingRequest, pendingRequest] } })).toBe(3);
  });

  // The rule every other surface uses for the sent request (`requests.outbound ?? activity`), so the
  // badge cannot drop one the tab is still drawing.
  it('falls back to activity for the sent request when the loaded list has none', () => {
    expect(
      count({
        activity: { outbound_request: pendingRequest } as Partial<DebateActivity>,
        requests: { outbound: null, incoming: [] },
      })
    ).toBe(1);
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

  // The list drops these at their start, so the badge has to as well or the two disagree.
  it('stops counting a scheduled request once its start has passed', () => {
    mocks.scheduled = {
      requests: [
        { status: 'pending', room_id: null, scheduled_start_at: '2020-01-01T13:00:00Z' },
        { status: 'pending', room_id: null, scheduled_start_at: '2099-01-01T13:00:00Z' },
      ],
    };

    expect(count({})).toBe(1);
  });

  it("falls back to activity's awaiting count until the scheduled list lands", () => {
    expect(count({ activity: { scheduled_awaiting_answer_count: 1 } })).toBe(1);
  });

  it('counts nothing signed out, whatever a stale cache says', () => {
    expect(count({ authenticated: false, requests: { outbound: pendingRequest, incoming: [pendingRequest] } })).toBe(0);
  });
});
