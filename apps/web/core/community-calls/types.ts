/** A single scheduled instance of a (possibly recurring) community call. */
export type Occurrence = {
  /** Epoch ms of this occurrence's start — the authoritative occurrence key. */
  startMs: number;
  /** Epoch ms of this occurrence's end. */
  endMs: number;
};

/** A community-call series entity plus its expanded occurrences. */
export type CallSeries = {
  callId: string;
  spaceId: string;
  name: string;
  description: string | null;
  /** Raw iCalendar schedule string (DTSTART/DTEND/RRULE). */
  schedule: string;
};

/** LiveKit join token minted by curator-backend (POST /community-call/token). */
export type CommunityCallToken = {
  token: string;
  /** wss:// LiveKit server URL. */
  url: string;
  /** Epoch ms of the occurrence being joined — combine with buildRoomName() for the LiveKit room name. */
  occurrenceStart: number;
  /** Role flags resolved by the backend from the caller's membership. */
  isAdmin?: boolean;
  isEditor?: boolean;
  isMember?: boolean;
  isViewer?: boolean;
};

/** A finished room recording listed by curator-backend (GET /community-call/recordings). */
export type Recording = {
  /** S3 key — pass back to /recordings/url for a signed playback URL. */
  filename: string;
  /** `spaceId::callId::occurrenceStart` — used to match a recording to its occurrence. */
  roomName: string;
  startedAt: number;
  endedAt: number;
  /** Length in seconds. */
  duration: number;
  size?: number;
};

/** Chat-history message shape from curator-backend (GET /community-call/chat). */
export type CallChatLogMessage = {
  id: string;
  senderIdentity: string;
  senderName: string;
  senderAvatarCid?: string | null;
  content: string;
  timestamp: number;
};

/** A participant currently in a live call room (GET /community-call/participants). */
export type CallParticipant = {
  identity: string;
  name: string | null;
  joinedAt: number;
  isAdmin: boolean;
  avatarCid: string | null;
  isEditor: boolean;
  isMember: boolean;
};

/** A participant's attendance record (GET /community-call/attendees). */
export type CallAttendee = {
  identity: string;
  name: string;
  firstJoinedAt: number;
  lastLeftAt: number;
  sessionCount: number;
  avatarCid?: string | null;
  isAdmin?: boolean;
};

/** Anonymous watch-only LiveKit token (POST /community-call/viewer-token). No auth required. */
export type ViewerToken = {
  token: string;
  url: string;
  viewerIdentity: string;
  occurrenceStart: number;
};

/**
 * Role/identity metadata curator-backend embeds in a LiveKit participant's
 * `metadata` field at token-mint time — parse `participant.metadata` as JSON
 * into this shape rather than calling a separate REST endpoint for role flags
 * while already connected to the room.
 */
export type ParticipantMetadata = {
  isAdmin?: boolean;
  isEditor?: boolean;
  isMember?: boolean;
  avatarCid?: string | null;
};

/** Parse a LiveKit participant's `metadata` field, tolerating missing/malformed JSON. */
export function parseParticipantMetadata(metadata?: string): ParticipantMetadata {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

/** RSVP counts for a call/occurrence (POST /community-call/subscription-status). */
export type SubscriptionStatus = {
  isGoing: boolean;
  rsvpStatus: string | null;
  goingCount: number;
  totalSubscribed: number;
  tentativeCount: number;
};

/** One markdown block within a per-occurrence agenda draft. */
export type OccurrenceAgendaBlock = {
  name: string;
  markdown: string;
  position: string;
};

/** Neo4j-backed pre-publish agenda draft (GET/PUT/DELETE /community-call/occurrence-draft). */
export type OccurrenceDraft = {
  spaceId: string;
  callId: string;
  occurrenceStart: number;
  agendaBlocks: OccurrenceAgendaBlock[];
  startOverride: number | null;
  endOverride: number | null;
  isDraft: boolean;
  updatedAt: string | null;
  publishedEntityId: string | null;
  publishedAt: string | null;
};
