/**
 * LiveKit's connection errors are transport internals, and the debate room used to put them
 * straight into the room's error banner. The worst of them is
 * "could not establish signal connection: invalid API key", which reads to a debater as something
 * *they* have misconfigured when it actually means the LiveKit server rejected the token geo-chat
 * minted for them — a server-side key mismatch no debater can act on.
 *
 * Translate the reasons we recognise into debater-facing copy. The raw message still goes to
 * telemetry, alongside the reason and HTTP status this module extracts, so a fleet-wide auth
 * failure is one PostHog breakdown away instead of a string search.
 */

/**
 * Mirrors livekit-client's `ConnectionErrorReason` enum, ordered by its numeric values. Duplicated
 * rather than imported: livekit-client is only ever pulled in via `await import(...)` so it stays
 * out of the main bundle, and this module is read from telemetry paths that must not drag it in.
 */
const connectionErrorReasonNames = [
  'NotAllowed',
  'ServerUnreachable',
  'InternalError',
  'Cancelled',
  'LeaveRequest',
  'Timeout',
  'WebSocket',
  'ServiceNotFound',
] as const;

export type LiveKitConnectionErrorReason = (typeof connectionErrorReasonNames)[number] | 'unknown';

type LiveKitConnectionErrorLike = Error & { reason?: unknown; status?: unknown };

/**
 * Duck-typed on `name` for the same reason the enum is duplicated: `instanceof ConnectionError`
 * would need the class, and the class means a static import of the SDK.
 */
export function isLiveKitConnectionError(error: unknown): error is LiveKitConnectionErrorLike {
  return error instanceof Error && error.name === 'ConnectionError';
}

export function liveKitConnectionErrorReason(error: unknown): LiveKitConnectionErrorReason {
  if (!isLiveKitConnectionError(error)) return 'unknown';
  // The numeric `reason`, never the `reasonName` beside it. When a handshake fails the SDK builds
  // an outer `serverUnreachable` error and then copies the inner error's `reason` and `status` onto
  // it — but `reasonName` was already frozen by the constructor, so it keeps saying
  // "ServerUnreachable" over a reason of `NotAllowed`. The number is the one that tells the truth.
  const reason = (error as LiveKitConnectionErrorLike).reason;
  if (typeof reason !== 'number') return 'unknown';
  return connectionErrorReasonNames[reason] ?? 'unknown';
}

export function liveKitConnectionErrorStatus(error: unknown): number | null {
  if (!isLiveKitConnectionError(error)) return null;
  const status = (error as LiveKitConnectionErrorLike).status;
  return typeof status === 'number' ? status : null;
}

export const debateRoomJoinFallbackMessage = 'Could not join the debate room.';

/**
 * Only LiveKit's own errors are rewritten. Everything else — a geo-chat rejection minting the
 * token, our own thrown `Error`s — already carries a message written for a person to read, and
 * losing it would make a real failure harder to diagnose, not easier.
 */
export function debateRoomConnectionErrorMessage(error: unknown): string {
  if (!isLiveKitConnectionError(error)) {
    if (!(error instanceof Error)) return debateRoomJoinFallbackMessage;
    return error.message.trim() === '' ? debateRoomJoinFallbackMessage : error.message;
  }

  const reason = liveKitConnectionErrorReason(error);
  const status = liveKitConnectionErrorStatus(error);

  // The token was minted but the media server would not take it: a rotated or mismatched LiveKit
  // API key, or a revoked grant. Say plainly that it is ours to fix, because the SDK's wording
  // ("invalid API key") sends debaters hunting through their own settings.
  if (reason === 'NotAllowed' || status === 401 || status === 403) {
    return 'The debate server turned down this connection. This is a problem on our end, not with your setup.';
  }

  if (reason === 'ServerUnreachable' || reason === 'Timeout') {
    return 'Could not reach the debate server. Check your connection, then reconnect.';
  }

  return debateRoomJoinFallbackMessage;
}
