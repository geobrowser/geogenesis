'use client';

import * as React from 'react';

import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

import type { DebateActivity, DebateRequestsResponse } from '../api';
import { useScheduledDebates } from '../rooms/scheduling-hooks';
import { useUnexpiredRequests } from './use-request-countdown';

/**
 * The Requests tab's badge: everything pending that the tab lists, in both directions.
 *
 * Deliberately broader than the navbar button, which counts only what is waiting on the viewer —
 * that one is asking for attention, where this one says how much the tab holds. A scheduled request
 * you sent is still pending until they answer, and belongs in the count for the same reason it
 * belongs in the list.
 *
 * Scheduled requests come from the list itself when the flag is on, so the number cannot disagree
 * with the rows underneath it; until that list lands, activity's "awaiting your answer" count
 * stands in, which is the most the badge knew before.
 */
export function useRequestsTabCount({
  authenticated,
  activity,
  requests,
}: {
  authenticated: boolean;
  activity: DebateActivity | undefined;
  requests: DebateRequestsResponse | undefined;
}) {
  const schedulingEnabled = usePeerAvailabilityEnabled();
  const scheduled = useScheduledDebates(schedulingEnabled && authenticated);

  const incoming = useUnexpiredRequests(requests?.incoming ?? []);
  const reportedOutbound = requests ? requests.outbound : (activity?.outbound_request ?? null);
  const outbound = useUnexpiredRequests(
    React.useMemo(() => (reportedOutbound?.status === 'pending' ? [reportedOutbound] : []), [reportedOutbound])
  );
  // The claimless challenge sits in the tab under Sent or Received, whichever way it points.
  const reportedChallenge = activity?.challenge?.status === 'pending' ? activity.challenge : null;
  const challenge = useUnexpiredRequests(
    React.useMemo(() => (reportedChallenge ? [reportedChallenge] : []), [reportedChallenge])
  );

  if (!authenticated) return 0;

  const instantIncoming = requests ? incoming.length : (activity?.incoming_request_count ?? 0);

  // The same predicate the tab's "Scheduled" section draws from.
  const scheduledPending = !schedulingEnabled
    ? 0
    : scheduled.data
      ? scheduled.data.requests.filter(request => request.status === 'pending' && !request.room_id).length
      : (activity?.scheduled_awaiting_answer_count ?? 0);

  return instantIncoming + outbound.length + challenge.length + scheduledPending;
}
