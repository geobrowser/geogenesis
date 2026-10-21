import { DisconnectReason } from 'livekit-client';

/*
 * LiveKit disconnect reasons, named and roughly attributed. Shared by the community-call drop
 * telemetry (GEO-2584) and the pre-debate voice call telemetry (GEO-3340), so one reason reads the
 * same in both. Moved here from `core/community-calls/disconnect-telemetry.ts`.
 */

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
