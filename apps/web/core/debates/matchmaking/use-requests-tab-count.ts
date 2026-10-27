'use client';

import type { DebateActivity, DebateRequestsResponse } from '../api';
import { sameId } from '../rooms/room-presence';
import { useOpenScheduledRequests } from '../rooms/scheduled-awaiting';
import { useScheduledDebates } from '../rooms/scheduling-hooks';
import { useCurrentGeoChatUserId } from '../use-current-geo-chat-user-id';
import { useLiveRequest, useUnexpiredRequests } from './use-request-countdown';

/**
 * How many things are waiting on the viewer's answer (GEO-3463): live requests sent to them, a
 * challenge sent to them, and scheduled invites they have not answered.
 *
 * The Requests tab's badge, its "Needs you (N)" filter and the navbar button all read this one
 * number, so none of them can say something different. It used to count everything pending in both
 * directions on the tab and only the incoming half on the navbar; what you sent is now on the strip
 * above the tabs, and the badge means "you have something to answer".
 *
 * `fetchScheduled` is off for the navbar while the panel is closed, since it mounts on every page.
 * Its observer is then disabled, and a disabled observer is skipped by every refetch — the gateway's
 * invalidation, the interval, focus — while still keeping the cached list alive. So a list left by
 * the panel goes stale under the badge: one invite answered there, a second arriving after it
 * closed, and the badge said 1 while activity, and the panel on reopening, said 2. The cached list
 * counts only while it is newer than activity (`activityUpdatedAt`); otherwise activity's "awaiting
 * your answer" count stands in — the same fallback the tab uses until its list lands.
 */
export function useRequestsTabCount({
  authenticated,
  activity,
  activityUpdatedAt = 0,
  requests,
  fetchScheduled = true,
}: {
  authenticated: boolean;
  activity: DebateActivity | undefined;
  /** When `activity` was read (react-query's `dataUpdatedAt`): what a cached scheduled list must beat. */
  activityUpdatedAt?: number;
  requests: DebateRequestsResponse | undefined;
  fetchScheduled?: boolean;
}) {
  const scheduled = useScheduledDebates(authenticated && fetchScheduled);
  const openScheduled = useOpenScheduledRequests(scheduled.data?.requests);
  const viewerId = useCurrentGeoChatUserId();

  const incoming = useUnexpiredRequests(requests?.incoming ?? []);
  const challenge = useLiveRequest(activity?.challenge);

  if (!authenticated) return 0;

  const instantIncoming = requests ? incoming.length : (activity?.incoming_request_count ?? 0);
  // A challenge counts only once it is known to be addressed to the viewer: one they sent is theirs
  // to wait on, not to answer.
  const challengeToViewer = challenge && viewerId !== null && sameId(challenge.recipient.user_id, viewerId) ? 1 : 0;
  // Fetched here, it is kept current like any read on screen. Only from cache, it counts while it is
  // the newer of the two.
  const listIsCurrent =
    scheduled.data !== undefined && (fetchScheduled || scheduled.dataUpdatedAt >= activityUpdatedAt);
  const scheduledToAnswer = listIsCurrent
    ? openScheduled.filter(request => request.viewer_must_answer).length
    : (activity?.scheduled_awaiting_answer_count ?? 0);

  return instantIncoming + challengeToViewer + scheduledToAnswer;
}
