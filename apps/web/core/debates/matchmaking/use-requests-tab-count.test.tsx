import { renderHook } from '@testing-library/react';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DebateActivity, DebateRequestsResponse } from '../api';

const mocks = vi.hoisted(() => ({
  scheduled: undefined as
    | {
        requests: {
          status: string;
          room_id: string | null;
          scheduled_start_at?: string;
          viewer_must_answer?: boolean;
        }[];
      }
    | undefined,
  scheduledEnabled: [] as boolean[],
  /** When the cached scheduled list was read. */
  scheduledUpdatedAt: 0,
  viewerId: 'user-me' as string | null,
}));

vi.mock('../rooms/scheduling-hooks', () => ({
  useScheduledDebates: (enabled: boolean) => {
    mocks.scheduledEnabled.push(enabled);
    return { data: mocks.scheduled, dataUpdatedAt: mocks.scheduledUpdatedAt };
  },
}));

vi.mock('../use-current-geo-chat-user-id', () => ({
  useCurrentGeoChatUserId: () => mocks.viewerId,
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
  fetchScheduled?: boolean;
  activityUpdatedAt?: number;
}) {
  const { result } = renderHook(() =>
    useRequestsTabCount({
      authenticated: input.authenticated ?? true,
      activity: input.activity as DebateActivity | undefined,
      requests: input.requests as DebateRequestsResponse | undefined,
      fetchScheduled: input.fetchScheduled,
      activityUpdatedAt: input.activityUpdatedAt,
    })
  );
  return result.current;
}

afterEach(() => {
  mocks.scheduled = undefined;
  mocks.scheduledEnabled = [];
  mocks.scheduledUpdatedAt = 0;
  mocks.viewerId = 'user-me';
});

const challengeTo = (recipient: string) => ({
  ...pendingRequest,
  requester: { user_id: recipient === 'user-me' ? 'user-them' : 'user-me' },
  recipient: { user_id: recipient },
});

// GEO-3463: the badge counts only what waits on the viewer's answer. What they sent is on the strip.
describe('the Requests tab count', () => {
  it('counts received instant requests and not the one sent', () => {
    expect(count({ requests: { outbound: pendingRequest, incoming: [pendingRequest, pendingRequest] } })).toBe(2);
  });

  it("falls back to activity's incoming count until the list loads", () => {
    expect(count({ activity: { incoming_request_count: 2 } as Partial<DebateActivity> })).toBe(2);
  });

  it('counts a challenge sent to the viewer', () => {
    expect(count({ activity: { challenge: challengeTo('user-me') } as unknown as Partial<DebateActivity> })).toBe(1);
  });

  // geo-chat spells uuids dashed in one field and dashless in another; the tinted row compares with
  // `sameId`, so the badge has to as well or "Needs you (N)" disagrees with the rows under it.
  it('counts a challenge to the viewer whichever way its id is spelt', () => {
    mocks.viewerId = '0198a4f2-1111-7aaa-8bbb-ccccdddd0001';
    const challenge = challengeTo('0198A4F211117AAA8BBBCCCCDDDD0001');
    expect(count({ activity: { challenge } as unknown as Partial<DebateActivity> })).toBe(1);
  });

  it('leaves out a challenge the viewer sent', () => {
    expect(count({ activity: { challenge: challengeTo('user-them') } as unknown as Partial<DebateActivity> })).toBe(0);
  });

  // Unknown is not "to you": the challenge waits until the id says whose it is.
  it('leaves out a challenge until the viewer id is known', () => {
    mocks.viewerId = null;
    expect(count({ activity: { challenge: challengeTo('user-me') } as unknown as Partial<DebateActivity> })).toBe(0);
  });

  it('counts only open scheduled invites the viewer has to answer', () => {
    mocks.scheduled = {
      requests: [
        { status: 'pending', room_id: null, viewer_must_answer: true },
        { status: 'pending', room_id: null, viewer_must_answer: false },
        { status: 'pending', room_id: 'room-1', viewer_must_answer: true },
        { status: 'declined', room_id: null, viewer_must_answer: true },
      ],
    };

    // The list wins over activity's count once it has landed.
    expect(count({ activity: { scheduled_awaiting_answer_count: 5 } })).toBe(1);
  });

  // The list drops these at their start, so the badge has to as well or the two disagree.
  it('stops counting a scheduled invite once its start has passed', () => {
    mocks.scheduled = {
      requests: [
        { status: 'pending', room_id: null, viewer_must_answer: true, scheduled_start_at: '2020-01-01T13:00:00Z' },
        { status: 'pending', room_id: null, viewer_must_answer: true, scheduled_start_at: '2099-01-01T13:00:00Z' },
      ],
    };

    expect(count({})).toBe(1);
  });

  it("falls back to activity's awaiting count until the scheduled list lands", () => {
    expect(count({ activity: { scheduled_awaiting_answer_count: 1 } })).toBe(1);
  });

  // The navbar mounts everywhere, so it reads the scheduled list only from cache.
  it('does not fetch the scheduled list for the navbar', () => {
    count({ fetchScheduled: false });
    expect(mocks.scheduledEnabled.every(enabled => enabled === false)).toBe(true);
  });

  // The navbar's observer is disabled with the panel closed, so nothing refetches the list it holds:
  // an invite arriving after the panel closed is in activity's count and not in the list.
  it('counts from activity, not a cached list older than it, for the navbar', () => {
    mocks.scheduled = { requests: [{ status: 'pending', room_id: null, viewer_must_answer: true }] };
    mocks.scheduledUpdatedAt = 1_000;

    expect(
      count({ fetchScheduled: false, activityUpdatedAt: 2_000, activity: { scheduled_awaiting_answer_count: 2 } })
    ).toBe(2);
  });

  it('counts from a cached list newer than activity, for the navbar', () => {
    mocks.scheduled = { requests: [{ status: 'pending', room_id: null, viewer_must_answer: true }] };
    mocks.scheduledUpdatedAt = 3_000;

    expect(
      count({ fetchScheduled: false, activityUpdatedAt: 2_000, activity: { scheduled_awaiting_answer_count: 2 } })
    ).toBe(1);
  });

  // Read live, the list is what the panel's rows come from, so it is what "Needs you (N)" counts.
  it('counts from the list it reads itself, however fresh activity is', () => {
    mocks.scheduled = { requests: [{ status: 'pending', room_id: null, viewer_must_answer: true }] };
    mocks.scheduledUpdatedAt = 1_000;

    expect(count({ activityUpdatedAt: 2_000, activity: { scheduled_awaiting_answer_count: 2 } })).toBe(1);
  });

  it('counts nothing signed out, whatever a stale cache says', () => {
    expect(count({ authenticated: false, requests: { outbound: pendingRequest, incoming: [pendingRequest] } })).toBe(0);
  });
});
