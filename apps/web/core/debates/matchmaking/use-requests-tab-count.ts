'use client';

import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

import type { DebateActivity, DebateRequestsResponse } from '../api';
import { useOpenScheduledRequests, useScheduledAwaitingBadgeCount } from '../rooms/scheduled-awaiting';
import { useScheduledDebates } from '../rooms/scheduling-hooks';
import { useLiveRequest, useUnexpiredRequests } from './use-request-countdown';

/**
 * The Requests tab's badge: everything pending that the tab lists, in both directions.
 *
 * Deliberately broader than the navbar button, which counts only what is waiting on the viewer —
 * that one is asking for attention, where this one says how much the tab holds. A scheduled request
 * you sent is still pending until they answer, and belongs in the count for the same reason it
 * belongs in the list.
 *
 * Scheduled requests come from the list itself when the flag is on, so the number cannot disagree
 * with the rows underneath it; until that list lands, the navbar's "awaiting your answer" count
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
  const scheduledAwaiting = useScheduledAwaitingBadgeCount(activity);
  const openScheduled = useOpenScheduledRequests(scheduled.data?.requests);

  const incoming = useUnexpiredRequests(requests?.incoming ?? []);
  // `??`, as every surface that draws the sent request derives it, so the count matches the card.
  const outbound = useLiveRequest(requests?.outbound ?? activity?.outbound_request);
  // The claimless challenge sits in the tab under Sent or Received, whichever way it points.
  const challenge = useLiveRequest(activity?.challenge);

  if (!authenticated) return 0;

  const instantIncoming = requests ? incoming.length : (activity?.incoming_request_count ?? 0);
  const scheduledPending = schedulingEnabled && scheduled.data ? openScheduled.length : scheduledAwaiting;

  return instantIncoming + (outbound ? 1 : 0) + (challenge ? 1 : 0) + scheduledPending;
}
