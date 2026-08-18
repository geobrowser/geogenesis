/**
 * Thin client for the curator-backend community-call API, via the same-origin
 * proxy. Every authenticated call forwards the user's Privy identity token as a
 * Bearer header; curator-backend verifies it and resolves the caller's Person.
 */
import { COMMUNITY_CALL_API } from './constants';
import {
  CallAttendee,
  CallChatLogMessage,
  CallParticipant,
  CommunityCallToken,
  OccurrenceAgendaBlock,
  OccurrenceDraft,
  Recording,
  SubscriptionStatus,
  TranscriptSegment,
  ViewerToken,
} from './types';

type Json = Record<string, unknown>;

async function call<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, headers, ...rest } = init;
  const res = await fetch(`${COMMUNITY_CALL_API}/${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`community-call ${path} failed (${res.status}): ${body || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

/** Mint a LiveKit join token (time-gated, editor/member role resolved server-side). */
export function getCommunityCallToken(
  args: { spaceId: string; callId: string },
  token: string
): Promise<CommunityCallToken> {
  return call('community-call/token', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Start LiveKit egress recording for the room (editor-only, enforced server-side). */
export function startRecording(args: { room: string }, token: string): Promise<{ egressId: string }> {
  return call('community-call/recordings/start', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Stop recording for the room. */
export function stopRecording(args: { egressId: string; room: string }, token: string): Promise<Json> {
  return call('community-call/recordings/stop', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Pre-publish upcoming occurrence entities (when autoPublishAhead > 0). */
export function reconcileAutoPublish(args: { spaceId: string; callId: string }, token: string): Promise<Json> {
  return call(`community-call/auto-publish/reconcile/${args.spaceId}/${args.callId}`, { method: 'POST', token });
}

/** Subscribe the signed-in user to a call's calendar invites / RSVP (rendezvous). */
export function subscribeToCall(
  args: { spaceId: string; callId: string; email: string },
  token: string
): Promise<{ sent: boolean; reason: string | null }> {
  return call(`community-call/subscribe/${args.spaceId}/${args.callId}`, {
    method: 'POST',
    token,
    body: JSON.stringify({ email: args.email }),
  });
}

/** Mint an anonymous, watch-only LiveKit token for a non-member/signed-out viewer. */
export function getViewerToken(args: { spaceId: string; callId: string }): Promise<ViewerToken> {
  return call('community-call/viewer-token', { method: 'POST', body: JSON.stringify(args) });
}

/** Editor-only: mute a participant's mic/camera/screen-share track. */
export function muteParticipant(
  args: {
    room: string;
    identity: string;
    trackSid: string;
    muted: boolean;
    trackType?: 'microphone' | 'camera' | 'screen_share';
  },
  token: string
): Promise<{ ok: boolean }> {
  return call('community-call/participants/mute', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Editor-only: remove a participant from the room. */
export function removeParticipant(
  args: { room: string; identity: string; livekitToken: string },
  token: string
): Promise<{ ok: boolean }> {
  return call('community-call/participants/remove', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Editor-only: end the call for everyone (deletes the LiveKit room). */
export function endCall(args: { room: string }, token: string): Promise<{ ok: boolean }> {
  return call('community-call/end', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Delete a recording (editor-only). */
export function deleteRecording(args: { filename: string }, token: string): Promise<{ ok: boolean }> {
  return call('community-call/recordings/delete', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Persist a chat message sent over the LiveKit data channel (fire-and-forget after live send). */
export function sendChatMessage(
  args: { spaceId: string; callId: string; occurrenceStart: number; id: string; content: string; timestamp: number },
  token: string
): Promise<{ ok: boolean }> {
  return call('community-call/chat/messages', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Persist a system event (join/leave/mute/etc) for the Call Log. */
export function logSystemEvent(
  args: { spaceId: string; callId: string; occurrenceStart: number; content: string },
  token: string
): Promise<{ ok: boolean }> {
  return call('community-call/system-event', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Best-effort: bump + resend calendar invites (iMIP) after a series edit. */
export function notifyCommunityCallUpdate(
  args: { spaceId: string; callId: string },
  token: string
): Promise<{ notified: number }> {
  return call(`community-call/notify-update/${args.spaceId}/${args.callId}`, { method: 'POST', token });
}

/** Best-effort: send calendar CANCEL (iMIP) after a series delete. */
export function notifyCommunityCallCancel(
  args: { spaceId: string; callId: string },
  token: string
): Promise<{ cancelled: number }> {
  return call(`community-call/notify-cancel/${args.spaceId}/${args.callId}`, { method: 'POST', token });
}

/** RSVP counts for the signed-in user + the call overall. */
export function getSubscriptionStatus(
  args: { spaceId: string; callId: string; recurrenceId?: string },
  token: string
): Promise<SubscriptionStatus> {
  const { spaceId, callId, recurrenceId } = args;
  return call(`community-call/subscription-status/${spaceId}/${callId}`, {
    method: 'POST',
    token,
    body: JSON.stringify(recurrenceId ? { recurrenceId } : {}),
  });
}

/** Read a single occurrence's pre-publish agenda draft (Neo4j-backed, editor-only). */
export function getOccurrenceDraft(
  args: { spaceId: string; callId: string; occurrenceStart: number },
  token: string
): Promise<OccurrenceDraft> {
  return call(`community-call/occurrence-draft/${args.spaceId}/${args.callId}/${args.occurrenceStart}`, {
    method: 'GET',
    token,
  });
}

/** List every draft for a series (used by the occurrence selector to fold in orphan drafts). */
export function listOccurrenceDrafts(
  args: { spaceId: string; callId: string },
  token: string
): Promise<{ drafts: OccurrenceDraft[] }> {
  return call(`community-call/occurrence-drafts/${args.spaceId}/${args.callId}`, { method: 'GET', token });
}

/** Save (or update) an occurrence's agenda draft before publishing on-chain. */
export function upsertOccurrenceDraft(
  args: {
    spaceId: string;
    callId: string;
    occurrenceStart: number;
    agendaBlocks: OccurrenceAgendaBlock[];
    startOverride: number | null;
    endOverride: number | null;
  },
  token: string
): Promise<OccurrenceDraft> {
  const { spaceId, callId, occurrenceStart, ...payload } = args;
  return call(`community-call/occurrence-draft/${spaceId}/${callId}/${occurrenceStart}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  });
}

/** Clear a draft after it's been published on-chain. */
export function deleteOccurrenceDraft(
  args: { spaceId: string; callId: string; occurrenceStart: number },
  token: string
): Promise<{ ok: boolean }> {
  return call(`community-call/occurrence-draft/${args.spaceId}/${args.callId}/${args.occurrenceStart}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * List finished recordings across the caller's editor spaces. There's no per-call
 * filter server-side — filter the result by `roomName` (buildRoomName) client-side.
 */
export function listRecordings(token: string): Promise<{ recordings: Recording[] }> {
  return call('community-call/recordings', { method: 'GET', token });
}

/** Exchange a recording's S3 key for a short-lived signed playback URL (editor-only). */
export function getRecordingUrl(args: { filename: string }, token: string): Promise<{ url: string }> {
  return call('community-call/recordings/url', { method: 'POST', token, body: JSON.stringify(args) });
}

/** Persisted chat history for one occurrence (editor-only). */
export function getCallChat(
  args: { spaceId: string; callId: string; occurrenceStart: number },
  token: string
): Promise<{ messages: CallChatLogMessage[] }> {
  return call(`community-call/chat/${args.spaceId}/${args.callId}/${args.occurrenceStart}`, { method: 'GET', token });
}

/** Attendance records for one occurrence (public). */
export function getCallAttendees(args: {
  spaceId: string;
  callId: string;
  occurrenceStart: number;
}): Promise<{ attendees: CallAttendee[]; callEnded: boolean }> {
  return call(`community-call/attendees/${args.spaceId}/${args.callId}/${args.occurrenceStart}`, { method: 'GET' });
}

/** Who's currently in a live call room, right now (public, no LiveKit join required). */
export function getLiveParticipants(args: {
  spaceId: string;
  callId: string;
  occurrenceStart: number;
}): Promise<{ participants: CallParticipant[]; isEnded: boolean }> {
  return call(`community-call/participants/${args.spaceId}/${args.callId}/${args.occurrenceStart}`, {
    method: 'GET',
  });
}

/**
 * Speaker-attributed transcript for one occurrence, served by rapporteur — a
 * separate upstream from curator-backend, so this bypasses `call()` (which
 * always targets curator-backend) and hits the dedicated proxy route directly.
 */
export function getCallTranscript(args: {
  spaceId: string;
  callId: string;
  occurrenceStart: number;
}): Promise<{ segments: TranscriptSegment[] }> {
  return fetch(`/api/community-call/transcripts/${args.spaceId}/${args.callId}/${args.occurrenceStart}`).then(res => {
    if (!res.ok) throw new Error(`transcripts fetch failed (${res.status})`);
    return res.json();
  });
}
