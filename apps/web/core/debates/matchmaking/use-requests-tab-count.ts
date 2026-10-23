'use client';

import type { DebateActivity, DebateRequestsResponse } from '../api';
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
 * `fetchScheduled` is off for the navbar, which mounts on every page: it reads the scheduled list
 * only if something else already loaded it, and stands in with activity's "awaiting your answer"
 * count otherwise — the same fallback the tab uses until its list lands.
 */
export function useRequestsTabCount({
  authenticated,
  activity,
  requests,
  fetchScheduled = true,
}: {
  authenticated: boolean;
  activity: DebateActivity | undefined;
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
  const challengeToViewer = challenge && viewerId !== null && challenge.recipient.user_id === viewerId ? 1 : 0;
  const scheduledToAnswer = scheduled.data
    ? openScheduled.filter(request => request.viewer_must_answer).length
    : (activity?.scheduled_awaiting_answer_count ?? 0);

  return instantIncoming + challengeToViewer + scheduledToAnswer;
}
