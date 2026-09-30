import * as React from 'react';

import type { ScheduledDebateRequest } from '../api';
import { useUnexpiredRequests } from '../matchmaking/use-request-countdown';

/**
 * Still open: pending, and not yet booked into a room. What the Requests tab's "Scheduled" section
 * lists and its badge counts, so the two cannot disagree.
 */
export function isOpenScheduledRequest(request: ScheduledDebateRequest) {
  return request.status === 'pending' && !request.room_id;
}

const NO_REQUESTS: ScheduledDebateRequest[] = [];

/**
 * The open requests that have not yet expired, re-evaluated the moment the next one does.
 *
 * A scheduled request expires when its start arrives unanswered. geo-chat's sweeper marks it so,
 * but only once a minute, and until then it would still offer Accept on a debate already under
 * way — so the start is treated as the expiry here, through the same filter instant requests use.
 */
export function useOpenScheduledRequests(requests: ScheduledDebateRequest[] | undefined) {
  const open = React.useMemo(
    () =>
      (requests ?? NO_REQUESTS)
        .filter(isOpenScheduledRequest)
        .map(request => ({ request, expires_at: request.scheduled_start_at })),
    [requests]
  );
  const live = useUnexpiredRequests(open);
  return React.useMemo(() => live.map(entry => entry.request), [live]);
}
