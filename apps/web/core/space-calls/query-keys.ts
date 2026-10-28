import { dashlessId } from '~/core/debates/api';

/**
 * Every space-call query key. A call's own view (agenda, viewer reminder) is a lobby view, so it
 * stays under `debateQueryKeys.lobby`.
 */
export const spaceCallKeys = {
  /** Every viewer's copy of a space's call list: what the gateway patches and refetches. */
  list: (spaceId: string) => ['debates', 'space-calls', dashlessId(spaceId)] as const,
  /** Under `debates`, so a gateway reconcile refetches it. */
  viewerList: (spaceId: string, accountKey: string | null) => [...spaceCallKeys.list(spaceId), accountKey] as const,
  /** An infinite query, outside `list` so a list patch never reaches its pages. */
  past: (spaceId: string) => ['debates', 'space-past-calls', dashlessId(spaceId)] as const,
  /** Published past calls across spaces, for Explore. */
  explorePast: (limit: number) => ['call-recordings', 'past', limit] as const,
  /** Outside `debates`: a reconnect must not re-sign a playing manifest. */
  recordingPlayback: (callId: string, accountKey: string | null) =>
    ['call-recording-playback', dashlessId(callId), accountKey] as const,
};

export const spaceCallMutationKeys = {
  reminder: ['debates', 'call-reminder'] as const,
  seriesReminder: ['debates', 'call-series-reminder'] as const,
};
