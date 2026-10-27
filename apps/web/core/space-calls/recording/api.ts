import {
  type CallRecordingState,
  type DebateLobbyPerson,
  type DebateLobbyView,
  type GetPrivyIdentityToken,
  dashlessId,
  geoChatRequest,
} from '~/core/debates/api';

/* Call recording (GEO-3421): geo-chat's `docs/space-calls.md`, "Recording". */

/** A call view's recording; `null` for a lobby or from geo-chat without recording. */
export function callRecordingOf(view: Pick<DebateLobbyView, 'call'> | null | undefined): CallRecordingState | null {
  const recording = view?.call?.recording;
  return recording && typeof recording.status === 'string' ? recording : null;
}

/** Editors in the call only. Returns the call's view. */
export async function startCallRecording(
  callId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateLobbyView>(`/calls/${dashlessId(callId)}/recording/start`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

/** Editors only; reads `processing` at once. Returns the call's view. */
export async function stopCallRecording(
  callId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateLobbyView>(`/calls/${dashlessId(callId)}/recording/stop`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

/** Editors only, once the call has ended. Returns the recording, not the view. */
export async function setCallRecordingPublished(
  callId: string,
  published: boolean,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<CallRecordingState>(`/calls/${dashlessId(callId)}/recording/published`, {
    method: 'PUT',
    body: { published },
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

/** Signed for 4 hours. `url` is the HLS manifest. */
export type CallRecordingPlayback = {
  url: string;
  hls_url: string;
  dash_url: string;
  thumbnail_url: string | null;
  expires_at: string;
};

/**
 * Signed out works once published. `404 call_recording_not_found` also means unpublished and not
 * an editor; `409 call_recording_not_ready` means still processing.
 */
export async function getCallRecordingPlayback(
  callId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<CallRecordingPlayback>(`/calls/${dashlessId(callId)}/recording/url`, {
    method: 'POST',
    auth: accountKey ? true : 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

/** A published, ready past call. Ids are dashless. */
export type PastCall = {
  call_id: string;
  space_id: string;
  space_name: string | null;
  name: string;
  started_at: string;
  ended_at: string;
  /** The call's, end minus start. */
  duration_seconds: number | null;
  started_by: DebateLobbyPerson | null;
  recording: {
    duration_seconds: number | null;
    /** Signed, expires; `null` without Stream signing. */
    thumbnail_url: string | null;
    thumbnail_expires_at: string | null;
  } | null;
};

export type PastCallsResponse = { calls: PastCall[]; next_cursor: string | null };

/** Public, newest end first. */
export async function listPastCalls(limit: number, signal?: AbortSignal) {
  return geoChatRequest<PastCallsResponse>(`/calls/past?limit=${limit}`, { auth: false, signal });
}
