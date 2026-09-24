import { atom } from 'jotai';

import type { ScheduledDebateRequest } from '../api';

/**
 * Scheduled requests waiting on the viewer's answer, for the request badges. An atom rather than a
 * query so the badges read a number without mounting a query client of their own; the watcher in
 * `DebateCoordinator` fills it. Zero wherever scheduling is off.
 */
export const scheduledAwaitingCountAtom = atom(0);

export function scheduledAwaitingCount(requests: ScheduledDebateRequest[] | undefined) {
  return (requests ?? []).filter(
    request => request.status === 'pending' && !request.room_id && request.viewer_must_answer
  ).length;
}
