/**
 * Shared constants for the community-calls feature.
 *
 * The frontend talks to curator-backend through the same-origin pass-through
 * proxy at /api/community-call (see app/api/community-call/[...path]/route.ts).
 */

/** Same-origin base path for the curator-backend proxy. */
export const COMMUNITY_CALL_API = '/api/community-call';

/**
 * GRC-20 schema IDs that curator-backend reads off the on-chain CommunityCall
 * entity. These MUST match the curator-backend deployment for the
 * schedule/listing to interoperate. Defaults are curator's live testnet schema,
 * read off a real entity on the geo indexer; override per-deploy via the
 * NEXT_PUBLIC_* vars.
 */
export const CALL_SCHEMA = {
  /** The "Community Call" type entity. */
  COMMUNITY_CALL_TYPE: process.env.NEXT_PUBLIC_COMMUNITY_CALL_TYPE_ID ?? '6e76a82830e14bad93a1097d05ab688a',
  /** iCalendar schedule (DTSTART/DTEND/RRULE), SCHEDULE data type. */
  MEETING_TIME_PROPERTY: process.env.NEXT_PUBLIC_COMMUNITY_CALL_MEETING_TIME_ID ?? '3ae3d1efebfc433da4bdebaa823348c9',
  /** Future occurrences to pre-publish (0–5), an INTEGER property on the series entity. */
  AUTO_PUBLISH_AHEAD_PROPERTY:
    process.env.NEXT_PUBLIC_COMMUNITY_CALL_AUTO_PUBLISH_AHEAD_ID ?? '84f323d3f8bf81c1ae00b0fd1225f56f',
} as const;

/**
 * `Community call event` (single occurrence) schema. `OCCURRENCE_ORIGINAL_START_PROPERTY`
 * is confirmed **not deployed yet** — matching a republished/rescheduled occurrence back to
 * its RRULE slot is best-effort by `occurrenceStart` until it ships.
 */
export const EVENT_SCHEMA = {
  COMMUNITY_CALL_EVENT_TYPE: process.env.NEXT_PUBLIC_COMMUNITY_CALL_EVENT_TYPE_ID ?? '0419ca20118b4cdb84dfdb9ed73b50c2',
  DESCRIPTION_PROPERTY:
    process.env.NEXT_PUBLIC_COMMUNITY_CALL_EVENT_DESCRIPTION_ID ?? '9b1f76ff9711404c861e59dc3fa7d037',
  START_TIME_PROPERTY: process.env.NEXT_PUBLIC_COMMUNITY_CALL_EVENT_START_TIME_ID ?? '2d696bf0510f403e985b8cd1e73feb9b',
  END_TIME_PROPERTY: process.env.NEXT_PUBLIC_COMMUNITY_CALL_EVENT_END_TIME_ID ?? 'c3445f6be2c04f25b73a5eb876c4f50c',
  COMMUNITY_CALL_PARENT_PROPERTY:
    process.env.NEXT_PUBLIC_COMMUNITY_CALL_EVENT_PARENT_ID ?? '6da0310b8aaa46f79f1f23ea5d6df686',
  ATTENDEES_PROPERTY: process.env.NEXT_PUBLIC_COMMUNITY_CALL_EVENT_ATTENDEES_ID ?? 'bbe171d00e234ba19f548a0179bc663d',
  RECORDINGS_PROPERTY: process.env.NEXT_PUBLIC_COMMUNITY_CALL_EVENT_RECORDINGS_ID ?? 'b2b1106933c443329ed28144b9f814ab',
  TRANSCRIPTS_PROPERTY:
    process.env.NEXT_PUBLIC_COMMUNITY_CALL_EVENT_TRANSCRIPTS_ID ?? 'c504c7d5c3374016a5f083e4b5a92911',
  /**
   * Canonical ID confirmed against curator's own `ids.ts`, but the type-projection
   * registration for it may not be live on this network yet — see module doc comment above.
   * Writing it is harmless either way; reading it back for occurrence-matching is best-effort.
   */
  OCCURRENCE_ORIGINAL_START_PROPERTY:
    process.env.NEXT_PUBLIC_COMMUNITY_CALL_OCCURRENCE_ORIGINAL_START_ID ?? '660686547e2084faef521eaebbc848f8',
} as const;

/** How long after an occurrence's scheduled end the agenda editor stays unlocked. */
export const LIVE_MEETING_GRACE_MINUTES = 30;

/**
 * Minutes after an occurrence's scheduled end before the call-end countdown banner
 * appears. It then counts down (LIVE_MEETING_GRACE_MINUTES - CALL_END_TIMER_DELAY_MINUTES)
 * minutes until the hard cutoff, at which point every connected client force-disconnects
 * itself. Example: a 2:00-3:00pm call shows the banner at 3:25pm and cuts off at 3:30pm.
 */
export const CALL_END_TIMER_DELAY_MINUTES = 25;

/**
 * How long `editorCount === 1` must hold before the leave-call dialog trusts
 * it as "this user is the only editor in the room" — rides out transient
 * states where LiveKit briefly reports only the local participant during
 * connect/reconnect/metadata sync, so a co-editor's connection blip doesn't
 * misfire the last-editor warning.
 */
export const LAST_EDITOR_CONFIRM_DELAY_MS = 250;

/** Route into the live LiveKit room for a call. */
export function liveCallHref(spaceId: string, callId: string): string {
  return `/space/${spaceId}/community/call/${callId}`;
}

/** Route into one occurrence's agenda draft/publish editor. */
export function agendaHref(spaceId: string, callId: string, startMs: number, endMs: number): string {
  return `/space/${spaceId}/community/${callId}/agenda?start=${startMs}&end=${endMs}`;
}

/** Route into one past occurrence's post-call details (recordings/attendees/chat/etc). */
export function detailsHref(spaceId: string, callId: string, startMs: number, endMs: number): string {
  return `/space/${spaceId}/community/${callId}/details?start=${startMs}&end=${endMs}`;
}

/** Occurrence-scoped LiveKit room name: `spaceId::callId::occurrenceStart` (epoch ms). */
export const ROOM_DELIMITER = '::';

export function buildRoomName(spaceId: string, callId: string, occurrenceStart: number): string {
  return [spaceId, callId, occurrenceStart].join(ROOM_DELIMITER);
}

/**
 * Parse a LiveKit room name back into its parts. Rooms created by the legacy curator
 * frontend (before a call was represented as a GRC-20 entity) embed a dashed UUID
 * callId — compare the result with `normId()`, never `===`, against a GRC-20 callId.
 */
export function parseRoomName(roomName: string): { spaceId: string; callId: string; occurrenceStart: number } | null {
  const parts = roomName.split(ROOM_DELIMITER);
  if (parts.length !== 3) return null;
  const [spaceId, callId, occurrenceStartRaw] = parts;
  const occurrenceStart = Number(occurrenceStartRaw);
  if (!spaceId || !callId || !Number.isFinite(occurrenceStart)) return null;
  return { spaceId, callId, occurrenceStart };
}

// Occurrence Original Start (see EVENT_SCHEMA doc comment) isn't deployed yet, and legacy
// curator-produced occurrences may have been computed with a different RRULE engine — this
// tolerance absorbs minor DST/serialization drift when matching by start time, not a real
// reschedule.
export const OCCURRENCE_MATCH_TOLERANCE_MS = 15 * 60 * 1000;

/** A call is joinable from 15min before start until 30min after end. */
export const LIVE_WINDOW_BEFORE_MS = 15 * 60 * 1000;
export const LIVE_WINDOW_AFTER_MS = 30 * 60 * 1000;

export function isOccurrenceLive(startMs: number, endMs: number, now = Date.now()): boolean {
  return now >= startMs - LIVE_WINDOW_BEFORE_MS && now <= endMs + LIVE_WINDOW_AFTER_MS;
}
