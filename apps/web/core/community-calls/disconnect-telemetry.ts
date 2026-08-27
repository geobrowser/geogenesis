import { DisconnectReason } from 'livekit-client';

import { reportEvent } from '~/core/telemetry/logger';

/**
 * Telemetry for community-call connection drops.
 *
 * Written because GEO-2584 ("users getting kicked out of community calls mid call") could
 * not be diagnosed from the app at all: the overlay tells the participant what happened and
 * nothing tells us. There was no drop count, no reason breakdown, and no reconnect success
 * rate, so answering "was that the server or their wifi" meant asking the person who
 * experienced it what the dialog said.
 *
 * Reported per *episode*, not per event. LiveKit emits `reconnecting` and
 * `signalReconnecting` repeatedly through one outage, so raw transitions would need
 * reassembling before they meant anything. One record per episode, carrying its outcome and
 * duration, is the shape the questions are actually asked in.
 */

/** The name of the Sentry issue every drop episode groups into. Must stay constant. */
const CALL_DISCONNECT_EVENT = 'community-call connection episode';

/**
 * Rough attribution, for triage rather than certainty.
 *
 * The distinction that matters operationally: a `server` cause drops every participant in a
 * room at nearly the same instant, so it correlates across users and is ours to fix, while a
 * `client` cause is one person alone. That is why `roomName` is reported — correlating
 * several participants' episodes within the same room and second is the strongest available
 * evidence of a server-side cause, and it is exactly what we could not do before.
 */
export type DisconnectCause = 'intentional' | 'scheduled' | 'server' | 'client' | 'moderation' | 'unknown';

/**
 * Ambiguous on purpose: SIGNAL_CLOSE means the signalling websocket closed, which happens
 * both when a participant's network drops and when something upstream (proxy, load
 * balancer, ingress) severs it. Calling it `client` would quietly blame users for our
 * outages, so it stays `unknown` and is resolved by correlation instead.
 */
const CAUSE_BY_REASON: Partial<Record<DisconnectReason, DisconnectCause>> = {
  [DisconnectReason.UNKNOWN_REASON]: 'unknown',
  [DisconnectReason.CLIENT_INITIATED]: 'intentional',
  // The user opened the same call in a second tab or device — their action, not a fault.
  [DisconnectReason.DUPLICATE_IDENTITY]: 'client',
  [DisconnectReason.SERVER_SHUTDOWN]: 'server',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'moderation',
  [DisconnectReason.ROOM_DELETED]: 'moderation',
  [DisconnectReason.STATE_MISMATCH]: 'server',
  [DisconnectReason.JOIN_FAILURE]: 'server',
  // A node being drained or rebalanced. Expected during deploys, and a leading suspect
  // whenever several participants drop together.
  [DisconnectReason.MIGRATION]: 'server',
  [DisconnectReason.SIGNAL_CLOSE]: 'unknown',
  [DisconnectReason.ROOM_CLOSED]: 'server',
  // Agent/SIP dispatch reasons; not reachable from a browser participant, mapped for
  // completeness so an unexpected one is still labelled rather than silently 'unknown'.
  [DisconnectReason.USER_UNAVAILABLE]: 'unknown',
  [DisconnectReason.USER_REJECTED]: 'unknown',
};

const REASON_NAME: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.UNKNOWN_REASON]: 'UNKNOWN_REASON',
  [DisconnectReason.CLIENT_INITIATED]: 'CLIENT_INITIATED',
  [DisconnectReason.DUPLICATE_IDENTITY]: 'DUPLICATE_IDENTITY',
  [DisconnectReason.SERVER_SHUTDOWN]: 'SERVER_SHUTDOWN',
  [DisconnectReason.PARTICIPANT_REMOVED]: 'PARTICIPANT_REMOVED',
  [DisconnectReason.ROOM_DELETED]: 'ROOM_DELETED',
  [DisconnectReason.STATE_MISMATCH]: 'STATE_MISMATCH',
  [DisconnectReason.JOIN_FAILURE]: 'JOIN_FAILURE',
  [DisconnectReason.MIGRATION]: 'MIGRATION',
  [DisconnectReason.SIGNAL_CLOSE]: 'SIGNAL_CLOSE',
  [DisconnectReason.ROOM_CLOSED]: 'ROOM_CLOSED',
  [DisconnectReason.USER_UNAVAILABLE]: 'USER_UNAVAILABLE',
  [DisconnectReason.USER_REJECTED]: 'USER_REJECTED',
};

/**
 * A reason LiveKit didn't give us is not the same as `UNKNOWN_REASON`, which it did give
 * us — keep them distinct, since "the event carried no reason" and "the server said it
 * didn't know" point at different places.
 */
export function disconnectReasonName(reason: DisconnectReason | undefined): string {
  if (reason === undefined) return 'NOT_REPORTED';
  return REASON_NAME[reason] ?? `UNMAPPED_${reason}`;
}

export function disconnectCause(reason: DisconnectReason | undefined): DisconnectCause {
  if (reason === undefined) return 'unknown';
  return CAUSE_BY_REASON[reason] ?? 'unknown';
}

/**
 * How an episode finished.
 *
 * - `recovered` — LiveKit's retry got the participant back in; they saw the overlay flash.
 * - `gave_up` — the retry budget was exhausted, leaving the manual rejoin screen. Ours is
 *   extended to ~3 minutes, so reaching this means the transport was gone for minutes.
 * - `left` — a clean, immediate disconnect with no reconnection attempted (Leave pressed,
 *   an editor closing the room, or the scheduled cutoff).
 */
export type EpisodeOutcome = 'recovered' | 'gave_up' | 'left';

export type CallTelemetryContext = {
  spaceId: string;
  callId: string;
  roomName: string;
  occurrenceStart: number;
  role: 'participant' | 'viewer';
};

export type DisconnectEpisode = {
  outcome: EpisodeOutcome;
  reason: DisconnectReason | undefined;
  /** True when the scheduled end-of-call cutoff disconnected this client (GEO-2584). */
  endedByCutoff?: boolean;
  /** Wall-clock time the participant spent in the reconnecting state, if they entered it. */
  reconnectingMs?: number;
  /** How far into the call the episode began — "did this happen at the start or the end". */
  msSinceJoin?: number;
};

/**
 * Record one connection episode.
 *
 * `roomName` is deliberately `extra` rather than a tag: it embeds the occurrence timestamp,
 * so as a tag it would be unbounded cardinality. `callId` is a tag because the set of calls
 * is small and "which call is dropping people" is the first question anyone asks.
 */
export function reportCallDisconnect(context: CallTelemetryContext, episode: DisconnectEpisode): void {
  // A voluntary leave is not a drop, and counting it as one would bury the real signal
  // under the overwhelmingly common case. The scheduled cutoff is still worth recording:
  // it also arrives as CLIENT_INITIATED, and how often it fires is a live product question.
  if (episode.outcome === 'left' && !episode.endedByCutoff) {
    return;
  }

  const cause = episode.endedByCutoff ? 'scheduled' : disconnectCause(episode.reason);

  reportEvent({
    name: CALL_DISCONNECT_EVENT,
    tags: {
      outcome: episode.outcome,
      cause,
      reason: episode.endedByCutoff ? 'SCHEDULED_CUTOFF' : disconnectReasonName(episode.reason),
      role: context.role,
      callId: context.callId,
      spaceId: context.spaceId,
    },
    extra: {
      roomName: context.roomName,
      occurrenceStart: context.occurrenceStart,
      reconnectingMs: episode.reconnectingMs,
      msSinceJoin: episode.msSinceJoin,
    },
  });
}
