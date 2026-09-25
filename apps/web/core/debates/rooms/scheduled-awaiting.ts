import { atom } from 'jotai';

import type { ScheduledDebateRequest } from '../api';

/**
 * Scheduled requests waiting on the viewer's answer, for the request badges. Written by the watcher
 * in `DebateCoordinator`; an atom so the badges need no query client. Zero where scheduling is off.
 */
export const scheduledAwaitingCountAtom = atom(0);

export function scheduledAwaitingCount(requests: ScheduledDebateRequest[] | undefined) {
  return (requests ?? []).filter(
    request => request.status === 'pending' && !request.room_id && request.viewer_must_answer
  ).length;
}
