import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

import type { DebateActivity, ScheduledDebateRequest } from '../api';

/**
 * Still open: pending, and not yet booked into a room. What the Requests tab's "Scheduled" section
 * lists and its badge counts, so the two cannot disagree.
 */
export function isOpenScheduledRequest(request: ScheduledDebateRequest) {
  return request.status === 'pending' && !request.room_id;
}

/**
 * Scheduled requests waiting on the viewer's answer, for the request badges. Gated on the flag
 * here, because activity carries the count for everyone.
 */
export function useScheduledAwaitingBadgeCount(activity: DebateActivity | undefined) {
  const enabled = usePeerAvailabilityEnabled();
  return enabled ? (activity?.scheduled_awaiting_answer_count ?? 0) : 0;
}
