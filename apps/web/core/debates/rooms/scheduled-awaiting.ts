import { usePeerAvailabilityEnabled } from '~/core/state/feature-flags';

import type { DebateActivity } from '../api';

/**
 * Scheduled requests waiting on the viewer's answer, for the request badges. Gated on the flag
 * here, because activity carries the count for everyone.
 */
export function useScheduledAwaitingBadgeCount(activity: DebateActivity | undefined) {
  const enabled = usePeerAvailabilityEnabled();
  return enabled ? (activity?.scheduled_awaiting_answer_count ?? 0) : 0;
}
