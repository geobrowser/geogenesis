'use client';

import { capSearchQuery } from '~/core/io/search-query';

export type ParticipantSlot = 1 | 2;
export type DebateMatchStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type DebateStatus = 'ready' | 'connecting' | 'preflight' | 'in_progress' | 'thanking' | 'complete' | 'cancelled';
export type DebateRecordingSource = 'local';
export type DebateRematchStatus = 'deciding' | 'browsing' | 'request_pending' | 'converted' | 'ended' | 'expired';
export type DebateRematchRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type DebateResponseKind = 'stance' | 'veracity';

export type DebateParticipantSummary = {
  user_id: string;
  profile_space_id: string;
  display_name: string | null;
  avatar_cid: string | null;
};

export type DebateClaimSummary = {
  id: string;
  space_id: string;
  claim_entity_id: string;
  claim: string;
  description: string | null;
};

export type DebateMatch = {
  id: string;
  status: DebateMatchStatus;
  response_kind: DebateResponseKind | null;
  cancellation_reason?: string | null;
  claim: DebateClaimSummary;
  participants: DebateMatchParticipant[];
  turn_format_id: string | null;
  debate_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DebateMatchParticipant = DebateParticipantSummary & {
  participant_slot: ParticipantSlot;
  position: boolean;
  position_label: string;
  accepted: boolean;
};

export type DebateParticipant = DebateParticipantSummary & {
  participant_slot: ParticipantSlot;
  position: boolean;
  position_label: string;
  joined_at: string | null;
  ready_at: string | null;
};

export type DebateRecording = {
  id: string;
  participant_slot: ParticipantSlot;
  position: boolean;
  position_label: string;
  user_id: string;
  object_key: string;
  filename: string;
  source: DebateRecordingSource;
  content_type: string;
  started_at_ms: number;
  ended_at_ms: number;
  duration_seconds: number;
  byte_size: number;
  width: number | null;
  height: number | null;
  framerate: number | null;
  video_bits_per_second: number | null;
};

export type DebateMediaJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type DebateMediaArtifactKind =
  | 'final_video'
  | 'final_video_hevc'
  | 'preview_image'
  | 'social_video'
  | 'social_preview_image'
  | 'transcript_json'
  | 'subtitle_srt'
  | 'subtitle_vtt'
  | 'subtitle_ass'
  | 'render_metadata';

export type DebateMediaRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type DebateMediaRenderLayout = {
  output_width: number;
  output_height: number;
  slot_1: DebateMediaRegion;
  subtitles: DebateMediaRegion;
  slot_2: DebateMediaRegion;
};

export type DebateMediaJobSummary = {
  id: string;
  status: DebateMediaJobStatus;
  attempt_count: number;
  locked_at: string | null;
  locked_by: string | null;
  available_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type DebateMediaArtifact = {
  id: string;
  kind: DebateMediaArtifactKind;
  filename: string;
  content_type: string;
  byte_size: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DebateMediaResponse = {
  job: DebateMediaJobSummary | null;
  artifacts: DebateMediaArtifact[];
  transcript_segment_count: number;
  layout: DebateMediaRenderLayout;
  whisper_model_id: string;
};

export type DebateMediaProcessRequest = {
  force?: boolean;
};

export type DebateMediaArtifactUrlRequest = {
  kind?: DebateMediaArtifactKind;
  filename?: string;
};

export type DebateMediaArtifactUrlResponse = {
  upload: ObjectStoreUpload;
};

export type TranscriptFormat = 'json' | 'srt' | 'vtt' | 'ass';

export type DebateTranscriptSegment = {
  id: string;
  participant_slot: ParticipantSlot;
  position: boolean;
  position_label: string;
  sequence_index: number;
  start_ms: number;
  end_ms: number;
  text: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DebateTranscriptResponse = {
  format: TranscriptFormat;
  model_id: string;
  segments: DebateTranscriptSegment[];
  body?: string;
};

export type DebateTurnYield = {
  turn_index: number;
  user_id: string;
  participant_slot: ParticipantSlot;
  yielded_at: string;
  accepted_at: string;
  handoff_deadline_at: string;
};

export type Debate = {
  id: string;
  claim: DebateClaimSummary;
  status: DebateStatus;
  response_kind: DebateResponseKind | null;
  room_name: string;
  first_participant_slot: ParticipantSlot;
  current_turn_index: number;
  current_speaker_slot: ParticipantSlot | null;
  connecting_started_at: string | null;
  connecting_deadline_at: string | null;
  turn_started_at: string | null;
  turn_ends_at: string | null;
  preflight_ends_at: string | null;
  turn_format_id: string;
  turn_durations_ms: number[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  rematch_session_id?: string | null;
  participants: DebateParticipant[];
  turn_yields?: DebateTurnYield[];
  recordings: DebateRecording[];
  recording_error: string | null;
  cancellation_reason: string | null;
  recording_cancelled_at: string | null;
  recording_cancelled_by: string | null;
};

export type DebateActivity = {
  online: boolean;
  available_to_debate: boolean;
  cooldown_until: string | null;
  /**
   * Always `null` since GEO-2514 removed auto-pairing: nothing populates `active_match_id` any
   * more. geo-chat keeps the field until every client has stopped reading it — nothing here does.
   */
  match: DebateMatch | null;
  debate: Debate | null;
  rematch: DebateRematchSession | null;
  challenge: DebateChallenge | null;
  /**
   * The single debate request the viewer currently has awaiting a response. Optional until
   * geo-chat ships `debate_matchmaking_v1`.
   */
  outbound_request?: DebateRequest | null;
  /** Number of unexpired incoming debate requests. Drives the navbar badge. */
  incoming_request_count?: number;
};

export type DebateChallengeStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

/**
 * A claimless "let's debate" request sent from someone's profile. Accepting it opens a
 * rematch session where both users pick the claim they'll argue.
 */
export type DebateChallenge = {
  id: string;
  status: DebateChallengeStatus;
  source_space_id: string;
  requester: DebateParticipantSummary;
  recipient: DebateParticipantSummary;
  rematch_session_id: string | null;
  created_at: string;
  expires_at: string;
};

export type DebateChallengeActionResponse = {
  challenge: DebateChallenge;
  session: DebateRematchSession | null;
};

export type DebateProfile = {
  user: DebateParticipantSummary;
  online: boolean;
  available_to_debate: boolean;
  is_self: boolean;
  can_challenge: boolean;
};

export type DebateRematchParticipant = DebateParticipantSummary & {
  participant_slot: ParticipantSlot;
  consented_at: string | null;
};

export type DebateRematchRequest = {
  id: string;
  status: DebateRematchRequestStatus;
  claim: DebateClaimSummary;
  requester_user_id: string;
  recipient_user_id: string;
  requester_position: boolean;
  requester_position_label?: string | null;
  recipient_position: boolean;
  recipient_position_label?: string | null;
  response_kind?: DebateResponseKind | null;
  cancellation_reason?: string | null;
  turn_format_id: string;
  created_at: string;
  expires_at: string;
};

export type DebateRematchSession = {
  id: string;
  /** `null` when the session came from a profile challenge rather than a finished debate. */
  source_debate_id: string | null;
  source_space_id: string;
  status: DebateRematchStatus;
  participants: DebateRematchParticipant[];
  decision_expires_at: string;
  browsing_expires_at: string | null;
  request: DebateRematchRequest | null;
  converted_debate_id: string | null;
  recently_rejected_claim_ids: string[];
  created_at: string;
  updated_at: string;
};

export type DebateRematchClaimPosition = {
  user_id: string;
  position: boolean | null;
  position_label: string | null;
};

export type DebateRematchClaim = {
  claim: DebateClaimSummary;
  response_kind: DebateResponseKind | null;
  participants: DebateRematchClaimPosition[];
  shared_preference: boolean;
  recently_rejected: boolean;
  previously_debated: boolean;
  /**
   * The viewer's readiness on this claim, the same two fields the per-space `debate-claims` list
   * carries. Optional while geo-chat rolls the fields out: absent means the backend predates them
   * and the picker has to ask the per-space endpoint instead.
   */
  viewer_debate_ready?: boolean;
  readiness_disabled_reason?: string | null;
};

export type DebateRematchClaimsResponse = {
  claims: DebateRematchClaim[];
  excluded_claim_ids: string[];
};

export type DebateRematchActionResponse = {
  session: DebateRematchSession;
  request: DebateRematchRequest | null;
  debate: Debate | null;
};

export type DebateSharePrompt = {
  id: string;
  debate_id: string;
  source_space_id: string;
  claim: string;
  created_at: string;
};

export type DebateSharePromptsResponse = {
  prompts: DebateSharePrompt[];
};

export type DebateOnlineChoice = {
  position: boolean;
  position_label: string;
  participant_count: number;
  participants: DebateParticipantSummary[];
};

export type DebateClaim = {
  id: string;
  space_id: string;
  claim_entity_id: string;
  claim: string;
  description: string | null;
  response_kind: DebateResponseKind;
  viewer_response: { position: boolean; position_label: string } | null;
  viewer_debate_ready: boolean;
  readiness_disabled_reason: string | null;
  readiness_changed_at: string | null;
  online_choices: DebateOnlineChoice[];
  /** Always `null` after GEO-2514: this only ever reported a *pending* match, and nothing creates
   * one now. Left in the shape until geo-chat drops the field. */
  active_match: DebateMatch | null;
  active_debate: Debate | null;
  created_at: string;
  updated_at: string;
};

/* -------------------------------------------------------------------------------------------------
 * Matchmaking hub (GEO-2514)
 * -----------------------------------------------------------------------------------------------*/

export type DebateMatchmakingPresence = {
  online: boolean;
  available_to_debate: boolean;
  /** `true` while the user is in an active match or debate, so requests to them stay pending. */
  in_debate: boolean;
  /** Server-authoritative. Requests target the candidate who has been online longest. */
  online_since: string | null;
};

export type DebatePerson = DebateParticipantSummary &
  DebateMatchmakingPresence & {
    can_challenge: boolean;
  };

export type DebatePeopleResponse = {
  people: DebatePerson[];
};

export type DebateClaimPositionSummary = {
  position: boolean;
  position_label: string;
  /**
   * Everyone geo-chat counts as holding this position — which is narrower than it sounds: the
   * query only counts rows surviving `readiness.is_ready`, so someone who took the position
   * without standing ready to debate it is excluded. Not shown on the claim card.
   */
  total_count: number;
  /**
   * Eligible for *this viewer* to send a request to right now: excludes the viewer themselves and
   * anyone they are already pair-blocked with on this claim. Drives the "Debate now" filter.
   *
   * Viewer-relative, so it is the wrong basis for anything presented as a fact about the claim.
   * Using it for the avatar stack made a claim you had already debated show you an empty stack,
   * because debating someone pair-blocks that pair on that claim (GEO-2691).
   */
  available_now_count: number;
  /**
   * Available to debate right now as a property of the *person* — online, reachable, not busy,
   * not paused — including the viewer and anyone they have already debated here.
   *
   * This is the population `participants` is drawn from, so a `+N` overflow beside those faces
   * must be computed against this and not against `available_now_count`.
   *
   * Optional because geo-chat only started sending it in geo-chat#74, and the two deploy
   * separately. Read it through {@link presentCount}, never directly: a client that ships first
   * would otherwise gate every avatar stack on `undefined > 0` and render no faces at all, which
   * is the exact bug this field exists to fix. The fallback also covers a geo-chat rollback.
   */
  present_count?: number;
  /** Capped list for the avatar stack, drawn from `present_count`'s population (GEO-2691). */
  participants: DebateParticipantSummary[];
};

export type MatchmakingTopic = {
  id: string;
  name: string | null;
};

/** The viewer's active on-chain claim response. `position_label` is server-supplied and semantic. */
export type DebateResponseSummary = {
  position: boolean;
  position_label: string;
};

/** Everything the hub needs to render a claim's readiness state alongside the viewer's response. */
export type MatchmakingReadiness = {
  /** Which vocabulary labels the sides: Agree/Disagree for `stance`, Verify/Dispute for `veracity`. */
  response_kind: DebateResponseKind;
  /** Present whenever the viewer has an active response — including while readiness is off. */
  viewer_response: DebateResponseSummary | null;
  viewer_debate_ready: boolean;
  /** Why readiness can't be turned on, when the server knows a reason. */
  readiness_disabled_reason: string | null;
};

export type MatchmakingClaim = MatchmakingReadiness & {
  claim: DebateClaimSummary;
  topics: MatchmakingTopic[];
  /**
   * Legacy shape of the viewer's side, gated on readiness. Prefer `viewer_response`, which also
   * carries the label and survives readiness being switched off.
   */
  viewer_position: boolean | null;
  positions: DebateClaimPositionSummary[];
  score: number;
  active_debate: boolean;
};

export type MatchmakingClaimsFilter = 'all' | 'mine' | 'debate_now';

/** Topics are Knowledge Graph data, which geo-chat replicates as of GEO-2659 — so `topicId`
 * filters server-side and the response carries a topic facet. Before that the server returned
 * `topics: []` and ignored the parameter, and both pickers resolved and filtered topics
 * themselves over whatever pages they had loaded. */
export type MatchmakingClaimsQuery = {
  search?: string | null;
  spaceId?: string | null;
  /**
   * The spaces this viewer may see claims from at all, sent when they haven't picked one.
   *
   * Both this and `spaceId` are OR-ed together server-side rather than one overriding the other,
   * so only ever send one of them: sending both would widen the query back out to every space in
   * either list.
   */
  spaceIds?: string[] | null;
  topicId?: string | null;
  /**
   * Topics to narrow by, OR-ed together. Merged with `topicId` the same way `spaceIds` is with
   * `spaceId`, so send one or the other rather than both.
   */
  topicIds?: string[] | null;
  /**
   * Narrows rows *and* facets to what a debate-again session can still offer: geo-chat drops the
   * claim the source debate was about, and any this pairing has blocked (GEO-2674).
   *
   * The session id rather than the ids themselves — that set is geo-chat's own, and the client
   * would be handing back a value it isn't the authority on.
   */
  rematchSessionId?: string | null;
  filter?: MatchmakingClaimsFilter;
  cursor?: string | null;
  limit?: number;
};

/** One dropdown option and how many claims the current filters leave behind it. */
export type MatchmakingFacetCount = {
  id: string;
  /** Topics carry a replicated name; spaces don't — the client resolves those from the sidebar. */
  name: string | null;
  count: number;
};

/**
 * The two menus, counted over the whole candidate set rather than the page being returned.
 *
 * The two dimensions are **not symmetric**, because the filters aren't: spaces are OR and topics
 * are AND (GEO-2696).
 *
 * *Spaces* follow the ordinary faceted rule — narrowed by the topic selection, never by their own.
 * Picking a space must not collapse the menu it came from, since picking a second one would only
 * widen the list.
 *
 * *Topics* are co-occurrence: counted over the claims that already carry **every** selected topic.
 * So the menu answers "what else do the claims I'm looking at carry", the selected topics come back
 * counted at the current result size — which is what lets them be un-picked — and no option can
 * lead to an empty list, because each one came off a surviving claim. This deliberately inverts
 * the "never narrow a dimension by itself" rule GEO-2659 set, and the rule's purpose survives: an
 * option that would empty the list simply isn't returned.
 *
 * The half that is easy to miss: a space can disappear from `space_facets` because the selected
 * *topics* have nothing in it. That is "this combination is empty", not "this space is no longer
 * yours to pick", and the two must not be confused — see the space effect in `claims-tab.tsx`.
 */
export type MatchmakingFacets = {
  /** Superseded by `space_facets`, and derived from it — so it inherits the topic narrowing too. */
  space_ids: string[];
  /** Superseded by `topic_facets`. Empty on every response until GEO-2659 made it real. */
  topics: MatchmakingTopic[];
  /** Count descending. Narrowed by the topic selection, never by the space selection. */
  space_facets: MatchmakingFacetCount[];
  /** Count descending. Co-occurrence: over the claims carrying every selected topic. */
  topic_facets: MatchmakingFacetCount[];
};

export type MatchmakingClaimsResponse = {
  claims: MatchmakingClaim[];
  next_cursor: string | null;
  /** Only returned on the first (cursor-less) page. */
  facets?: MatchmakingFacets;
};

export type MatchmakingMatch = MatchmakingReadiness & {
  claim: DebateClaimSummary;
  topics: MatchmakingTopic[];
  viewer_position: boolean;
  positions: DebateClaimPositionSummary[];
};

export type MatchmakingMatchesResponse = {
  matches: MatchmakingMatch[];
};

export type DebateRequestStatus = 'pending' | 'accepted' | 'dismissed' | 'withdrawn' | 'expired' | 'exhausted';

export type DebateRequestParty = DebateParticipantSummary &
  DebateMatchmakingPresence & {
    position: boolean;
    position_label: string;
  };

export type DebateRequest = {
  id: string;
  status: DebateRequestStatus;
  claim: DebateClaimSummary;
  requester: DebateRequestParty;
  /** The current target. The server re-targets the request when a recipient dismisses or blocks. */
  recipient: DebateRequestParty;
  turn_format_id: string | null;
  created_at: string;
  /** Fixed for the lifetime of the request, even as it advances between recipients. */
  expires_at: string;
};

export type DebateRequestsResponse = {
  /** At most one outbound request may be pending at a time. */
  outbound: DebateRequest | null;
  incoming: DebateRequest[];
};

export type DebateRequestActionResponse = {
  request: DebateRequest;
  match: DebateMatch | null;
  debate: Debate | null;
};

export type CreateDebateRequestBody = {
  space_id: string;
  claim_entity_id: string;
  format_id?: string;
};

export type DismissDebateRequestBody = {
  /** Also clears the recipient's debate intent for the claim. */
  remove_intent?: boolean;
};

export type DebateBlocksResponse = {
  blocked: DebateParticipantSummary[];
};

export type ObjectStoreUpload = {
  method: string;
  url: string;
  headers: Record<string, string>;
  expires_at: string;
};

export type DebateClaimsResponse = {
  claims: DebateClaim[];
};

export type JoinDebateQueueResponse = {
  claim: DebateClaim;
  match: DebateMatch | null;
};

export type SpaceDebatesResponse = {
  debates: Debate[];
  matches: DebateMatch[];
};

export type LiveKitJoinResponse = {
  token: string;
  url: string;
  room_name: string;
  role: string;
  participant_slot: ParticipantSlot;
  position: boolean;
  position_label: string;
};

export type RematchLiveKitJoinResponse = {
  token: string;
  url: string;
  room_name: string;
  participant_slot: ParticipantSlot;
};

export type LocalRecordingUploadRequest = {
  mime_type: string;
  started_at_ms: number;
};

export type LocalRecordingUploadResponse = {
  filename: string;
  upload: ObjectStoreUpload;
};

export type LocalRecordingCompleteRequest = {
  filename: string;
  mime_type: string;
  started_at_ms: number;
  ended_at_ms: number;
  duration_seconds: number;
  byte_size: number;
  width?: number | null;
  height?: number | null;
  framerate?: number | null;
  video_bits_per_second?: number | null;
};

export type RecordingCompleteResponse = {
  recording: DebateRecording;
  debate: Debate;
};

export type GeoChatSession = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type GetPrivyIdentityToken = () => Promise<string | null | undefined>;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  auth?: boolean | 'optional';
  getPrivyIdentityToken?: GetPrivyIdentityToken;
  accountKey?: string | null;
  signal?: AbortSignal;
};

const geoChatSessionStorageKey = 'geo:chat-session';
const geoChatSessionRequestTimeoutMs = 10_000;

type StoredGeoChatSession = {
  account_key: string | null;
  session: GeoChatSession;
};

const geoChatSessionRequests = new Map<string, Promise<GeoChatSession>>();
let geoChatSessionEpoch = 0;
let geoChatSessionAccountKey: string | null = null;

export function getGeoChatApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
}

export function getCurrentGeoChatUserId() {
  const session = loadSession(null);
  return decodeGeoChatAccessToken(session?.access_token)?.user_id ?? null;
}

export async function getServerTime() {
  return geoChatRequest<{ server_time_ms: number }>('/time');
}

export async function resolveCurrentGeoChatUserId(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  const accessToken = await getGeoChatAccessToken(getPrivyIdentityToken, accountKey);
  return decodeGeoChatAccessToken(accessToken)?.user_id ?? null;
}

export async function getDebateActivity(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebateActivity>('/me/debate-activity', {
    auth: true,
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function updateDebateAvailability(
  availableToDebate: boolean,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateActivity>('/me/debate-availability', {
    method: 'PUT',
    body: { available_to_debate: availableToDebate },
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function listDebateSharePrompts(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebateSharePromptsResponse>('/me/debate-share-prompts', {
    auth: true,
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

async function fetchDebateClaims(
  spaceId: string,
  claimIds: string[],
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null,
  signal?: AbortSignal
) {
  const query = claimIds.length > 0 ? `?claim_ids=${encodeURIComponent(claimIds.join(','))}` : '';
  return geoChatRequest<DebateClaimsResponse>(`/spaces/${spaceId}/debate-claims${query}`, {
    auth: accountKey ? true : 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

/**
 * How long to hold an id before asking, so a render's worth of rows travels as one request.
 *
 * A task, not a microtask: rows fire their queries from effects that react-query schedules, and
 * those do not reliably land in the same microtask. Ten milliseconds is under a frame, so nothing
 * waits perceptibly longer, and it is wide enough to catch a table committing its rows.
 */
const CLAIM_BATCH_WINDOW_MS = 10;

/** Caps the query string. Fifty ids is roughly 1.7KB of URL; this leaves generous headroom. */
const CLAIM_BATCH_LIMIT = 100;

type ClaimBatchCaller = {
  claimIds: string[];
  resolve: (value: DebateClaimsResponse) => void;
  reject: (reason: unknown) => void;
};

type ClaimBatch = {
  ids: Set<string>;
  callers: ClaimBatchCaller[];
  getPrivyIdentityToken?: GetPrivyIdentityToken;
  accountKey?: string | null;
};

const pendingClaimBatches = new Map<string, ClaimBatch>();

/**
 * Concurrent claim reads for one space, collapsed into one request.
 *
 * `ClaimDebateButton` renders once per entity row and asks only for its own claim, so a table of
 * fifty claim entities issued fifty requests to an endpoint that takes all fifty ids at once — and
 * every one of them made geo-chat resolve claim responses against the Knowledge Graph, which is
 * exactly the load that endpoint answers 503 to (GEO-2724).
 *
 * Coalescing here rather than in the hook is deliberate: every caller keeps its own react-query
 * cache entry and its own key, so no component changes and no key churn. They only share the fetch.
 *
 * Each caller is resolved with the claims **it asked for**, not the union. A caller handed a
 * superset would be a real behaviour change — `claims-page-client` derives its active debates from
 * every row in the response, and would pick up rows belonging to a sibling.
 */
function batchDebateClaims(
  spaceId: string,
  claimIds: string[],
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null
): Promise<DebateClaimsResponse> {
  // Keyed by account as well as space: two identities must never read one response, and the
  // endpoint answers differently for each (readiness is per viewer).
  const key = `${spaceId}\u0000${accountKey ?? ''}`;
  let batch = pendingClaimBatches.get(key);

  if (!batch) {
    batch = { ids: new Set(), callers: [], getPrivyIdentityToken, accountKey };
    pendingClaimBatches.set(key, batch);
    setTimeout(() => flushClaimBatch(key, spaceId), CLAIM_BATCH_WINDOW_MS);
  }

  for (const claimId of claimIds) batch.ids.add(claimId);

  return new Promise<DebateClaimsResponse>((resolve, reject) => {
    batch.callers.push({ claimIds, resolve, reject });
  });
}

function flushClaimBatch(key: string, spaceId: string) {
  const batch = pendingClaimBatches.get(key);
  if (!batch) return;
  pendingClaimBatches.delete(key);

  const ids = [...batch.ids];
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += CLAIM_BATCH_LIMIT) {
    chunks.push(ids.slice(index, index + CLAIM_BATCH_LIMIT));
  }

  // Deliberately unsignalled. One row unmounting must not abort the request its siblings are
  // waiting on, and a caller that has gone away simply has its own promise settled into a cache
  // entry nobody reads.
  Promise.all(chunks.map(chunk => fetchDebateClaims(spaceId, chunk, batch.getPrivyIdentityToken, batch.accountKey)))
    .then(responses => {
      const claims = responses.flatMap(response => response.claims);
      for (const caller of batch.callers) {
        const wanted = new Set(caller.claimIds);
        caller.resolve({ claims: claims.filter(claim => wanted.has(claim.claim_entity_id)) });
      }
    })
    .catch(error => {
      for (const caller of batch.callers) caller.reject(error);
    });
}

export async function listDebateClaims(
  spaceId: string,
  claimIds: string[],
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null,
  signal?: AbortSignal
) {
  // An empty list means "every claim in this space", which is a different question and must not be
  // folded into a batch of ids — nor answered from one.
  if (claimIds.length === 0) {
    return fetchDebateClaims(spaceId, claimIds, getPrivyIdentityToken, accountKey, signal);
  }
  return batchDebateClaims(spaceId, claimIds, getPrivyIdentityToken, accountKey);
}

/**
 * Standing ready on a claim — pure intent, since GEO-2514's cutover left requests as the only route
 * into a debate. The endpoint takes no body: one used to carry a client-chosen position, and a
 * `source` discriminator briefly lived here to separate hub readiness from legacy queue joins, so
 * geo-chat rejects any body at all with 426.
 */
export async function joinDebateQueue(
  spaceId: string,
  claimId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<JoinDebateQueueResponse>(`/spaces/${spaceId}/claims/${claimId}/debate-queue`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function leaveDebateQueue(
  spaceId: string,
  claimId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<JoinDebateQueueResponse>(`/spaces/${spaceId}/claims/${claimId}/debate-queue`, {
    method: 'DELETE',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function notifyClaimResponseIndexed(
  spaceId: string,
  claimId: string,
  responseKind: DebateResponseKind,
  position: boolean | null,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  const request = () =>
    geoChatRequest<void>(`/spaces/${spaceId}/claims/${claimId}/response-indexed`, {
      method: 'POST',
      body: { response_kind: responseKind, position },
      auth: true,
      getPrivyIdentityToken,
      accountKey,
      signal,
    });

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (attempt >= 2 || !isTransientResponseNotificationError(error)) throw error;
      await waitForResponseNotificationRetry(250 * 2 ** attempt, signal);
    }
  }
}

export async function listSpaceDebates(
  spaceId: string,
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<SpaceDebatesResponse>(`/spaces/${spaceId}/debates`, {
    auth: 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function getDebate(
  debateId: string,
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<Debate>(`/debates/${debateId}`, {
    auth: 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function getLiveKitToken(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<LiveKitJoinResponse>(`/debates/${debateId}/livekit-token`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function getRematchLiveKitToken(
  sessionId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<RematchLiveKitJoinResponse>(`/debate-rematches/${sessionId}/livekit-token`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function markDebateJoined(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<Debate>(`/debates/${debateId}/joined`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function markDebateReady(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<Debate>(`/debates/${debateId}/ready`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function endDebateTurn(
  debateId: string,
  turnIndex: number,
  endedAtMs: number,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<Debate>(`/debates/${debateId}/turns/${turnIndex}/end`, {
    method: 'POST',
    body: { ended_at_ms: endedAtMs },
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function abortDebate(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<Debate>(`/debates/${debateId}/abort`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function cancelDebateRecording(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<Debate>(`/debates/${debateId}/recordings/cancel`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function consentToDebateRematch(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRematchSession>(`/debates/${debateId}/rematch/consent`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function getDebateRematch(
  sessionId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebateRematchSession>(`/debate-rematches/${sessionId}`, {
    auth: true,
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function leaveDebateRematch(
  sessionId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRematchSession>(`/debate-rematches/${sessionId}/leave`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function listDebateRematchClaims(
  sessionId: string,
  claimIds: string[],
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  const query = claimIds.length > 0 ? `?claim_ids=${encodeURIComponent(claimIds.join(','))}` : '';
  return geoChatRequest<DebateRematchClaimsResponse>(`/debate-rematches/${sessionId}/claims${query}`, {
    auth: true,
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function createDebateRematchRequest(
  sessionId: string,
  request: { source_space_id: string; claim_id: string; format_id: string },
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRematchActionResponse>(`/debate-rematches/${sessionId}/requests`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function acceptDebateRematchRequest(
  requestId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRematchActionResponse>(`/debate-rematch-requests/${requestId}/accept`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function rejectDebateRematchRequest(
  requestId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRematchActionResponse>(`/debate-rematch-requests/${requestId}/reject`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function getDebateProfile(
  profileSpaceId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebateProfile>(`/debate-profiles/${profileSpaceId}`, {
    auth: 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function createDebateChallenge(
  request: { recipient_profile_space_id: string },
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateChallenge>('/debate-challenges', {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function acceptDebateChallenge(
  challengeId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateChallengeActionResponse>(`/debate-challenges/${challengeId}/accept`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function rejectDebateChallenge(
  challengeId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateChallengeActionResponse>(`/debate-challenges/${challengeId}/reject`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

/* -------------------------------------------------------------------------------------------------
 * Matchmaking hub (GEO-2514)
 * -----------------------------------------------------------------------------------------------*/

export async function listDebatePeople(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebatePeopleResponse>('/matchmaking/people', {
    // Anonymous only when there is genuinely nobody signed in, matching `listDebateClaims`. A flat
    // 'optional' would also swallow a token-exchange failure for a signed-in viewer and send the
    // request anonymously — and the anonymous answer would then be cached under their account key,
    // leaving viewer-relative fields like `can_challenge` quietly wrong with nothing to retry.
    auth: accountKey ? true : 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function listMatchmakingClaims(
  query: MatchmakingClaimsQuery,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  const params = new URLSearchParams();
  // GEO-2658. Capped for consistency, not to stay inside a limit: `/matchmaking/claims` has no
  // ceiling on `search` — it trims, escapes the LIKE wildcards and binds, so an over-long query is
  // answered rather than rejected. This is the only search box in debates, and the same typed
  // string shouldn't behave differently depending on which box it went into.
  //
  // `capSearchQuery` also does the work that matters more than the length: it slices by code point,
  // so a cut never lands inside a surrogate pair and hands `URLSearchParams` a lone surrogate.
  if (query.search) params.set('search', capSearchQuery(query.search));
  if (query.spaceId) params.set('space_id', query.spaceId);
  // Only when no single space is picked — see the note on the type. An empty list is left off
  // entirely: the server reads "no ids" as "no filter", which is the opposite of what an empty
  // eligible set means.
  else if (query.spaceIds?.length) params.set('space_ids', query.spaceIds.join(','));
  if (query.topicId) params.set('topic_id', query.topicId);
  else if (query.topicIds?.length) params.set('topic_ids', query.topicIds.join(','));
  if (query.rematchSessionId) params.set('rematch_session_id', query.rematchSessionId);
  if (query.filter && query.filter !== 'all') params.set('filter', query.filter);
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.limit) params.set('limit', String(query.limit));

  const search = params.toString();
  return geoChatRequest<MatchmakingClaimsResponse>(`/matchmaking/claims${search ? `?${search}` : ''}`, {
    // Same as People above: anonymous only with nobody signed in, never as a fallback for a
    // signed-in viewer whose token exchange failed.
    auth: accountKey ? true : 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function listMatchmakingMatches(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<MatchmakingMatchesResponse>('/matchmaking/matches', {
    auth: true,
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

/*
 * There is no debate-intent endpoint. A position is an on-chain claim response, never something
 * the client sends — `joinDebateQueue` / `leaveDebateQueue` toggle readiness on top of it.
 */

export async function listDebateRequests(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebateRequestsResponse>('/me/debate-requests', {
    auth: true,
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function createDebateRequest(
  request: CreateDebateRequestBody,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRequest>('/debate-requests', {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function withdrawDebateRequest(
  requestId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRequestActionResponse>(`/debate-requests/${requestId}/withdraw`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function acceptDebateRequest(
  requestId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  formatId?: string
) {
  return geoChatRequest<DebateRequestActionResponse>(`/debate-requests/${requestId}/accept`, {
    method: 'POST',
    body: { format_id: formatId },
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function dismissDebateRequest(
  requestId: string,
  request: DismissDebateRequestBody,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRequestActionResponse>(`/debate-requests/${requestId}/dismiss`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function listDebateBlocks(
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebateBlocksResponse>('/me/debate-blocks', {
    auth: true,
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function blockDebateUser(
  userId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateBlocksResponse>(`/me/debate-blocks/${userId}`, {
    method: 'PUT',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function unblockDebateUser(
  userId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateBlocksResponse>(`/me/debate-blocks/${userId}`, {
    method: 'DELETE',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function handleDebateSharePrompt(
  promptId: string,
  action: 'shared' | 'dismissed',
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateSharePrompt>(`/debate-share-prompts/${promptId}/handled`, {
    method: 'POST',
    body: { action },
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function createLocalRecordingUpload(
  debateId: string,
  request: LocalRecordingUploadRequest,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<LocalRecordingUploadResponse>(`/debates/${debateId}/recordings/local-upload-url`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function completeLocalRecordingUpload(
  debateId: string,
  request: LocalRecordingCompleteRequest,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<RecordingCompleteResponse>(`/debates/${debateId}/recordings/local-upload-complete`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function getRecordingUrl(
  debateId: string,
  filename: string,
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null
) {
  return geoChatRequest<{ url: string }>(`/debates/${debateId}/recordings/url`, {
    method: 'POST',
    body: { filename },
    auth: 'optional',
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function getDebateMedia(
  debateId: string,
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebateMediaResponse>(`/debates/${debateId}/media`, {
    auth: 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function requestDebateMediaProcessing(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  request: DebateMediaProcessRequest = {}
) {
  return geoChatRequest<DebateMediaResponse>(`/debates/${debateId}/media/process`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function getDebateMediaArtifactUrl(
  debateId: string,
  request: DebateMediaArtifactUrlRequest,
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null
) {
  return geoChatRequest<DebateMediaArtifactUrlResponse>(`/debates/${debateId}/media/artifacts/url`, {
    method: 'POST',
    body: request,
    auth: 'optional',
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function getDebateTranscript(
  debateId: string,
  format: TranscriptFormat = 'json',
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null,
  signal?: AbortSignal
) {
  return geoChatRequest<DebateTranscriptResponse>(
    `/debates/${debateId}/transcript?format=${encodeURIComponent(format)}`,
    {
      auth: 'optional',
      getPrivyIdentityToken,
      accountKey,
      signal,
    }
  );
}

async function geoChatRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const accessToken = await accessTokenForRequest(options);
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${getGeoChatApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (!response.ok) {
    throw await requestError(response);
  }

  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export class GeoChatRequestError extends Error {
  code: string | null;
  status: number;

  constructor(message: string, code: string | null, status: number) {
    super(message);
    this.name = 'GeoChatRequestError';
    this.code = code;
    this.status = status;
  }
}

const debatePhaseBoundaryRetryCodes = new Set([
  'rematch_not_ready',
  'recording_not_cancellable',
  'recording_not_ready',
]);

function isTransientResponseNotificationError(error: unknown) {
  if (error instanceof GeoChatRequestError) {
    return error.status === 429 || error.status >= 500;
  }
  return !(error instanceof DOMException && error.name === 'AbortError');
}

function waitForResponseNotificationRetry(delayMs: number, signal?: AbortSignal) {
  if (signal?.aborted)
    return Promise.reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'));

  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const abort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new DOMException('The operation was aborted', 'AbortError'));
    };
    const timer = setTimeout(finish, delayMs);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export async function retryDebatePhaseBoundaryRequest<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof GeoChatRequestError) || !error.code || !debatePhaseBoundaryRetryCodes.has(error.code)) {
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    return request();
  }
}

async function requestError(response: Response) {
  let code: string | null = null;
  let message = `${response.status} ${response.statusText}`;
  try {
    const responseBody = (await response.text()).trim();
    if (responseBody) {
      try {
        const body = JSON.parse(responseBody) as { error?: { code?: string; message?: string } };
        code = body.error?.code ?? null;
        message = body.error?.message || message;
      } catch {
        message = responseBody;
      }
    }
  } catch {
    // fall back to the status line built above
  }
  return new GeoChatRequestError(message, code, response.status);
}

async function accessTokenForRequest(options: RequestOptions) {
  if (!options.auth) return null;
  if (!options.accountKey) {
    if (options.auth === 'optional') return null;
    throw new Error('Sign in to use debates.');
  }

  try {
    return await getGeoChatAccessToken(options.getPrivyIdentityToken, options.accountKey ?? null);
  } catch (error) {
    if (options.auth === 'optional') return null;
    throw error;
  }
}

export async function getGeoChatSession(
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey: string | null = null
) {
  const storedRecord = loadStoredSession();
  if (
    accountKey !== null &&
    ((geoChatSessionAccountKey !== null && geoChatSessionAccountKey !== accountKey) ||
      (storedRecord && storedRecord.account_key !== accountKey))
  ) {
    resetGeoChatSession();
  }
  if (accountKey !== null) geoChatSessionAccountKey = accountKey;

  const effectiveAccountKey = accountKey ?? geoChatSessionAccountKey ?? loadStoredSession()?.account_key ?? null;
  const stored = loadSession(effectiveAccountKey);
  if (stored && new Date(stored.expires_at).getTime() > Date.now() + 30_000) {
    return stored;
  }

  const requestKey = effectiveAccountKey ?? '';
  const existingRequest = geoChatSessionRequests.get(requestKey);
  if (existingRequest) return existingRequest;

  const issuedForEpoch = geoChatSessionEpoch;
  const request = (async () => {
    if (stored?.refresh_token) {
      try {
        const refreshed = await refreshGeoChatSession(stored.refresh_token);
        assertCurrentGeoChatSessionEpoch(issuedForEpoch);
        saveSession(refreshed, effectiveAccountKey);
        return refreshed;
      } catch {
        assertCurrentGeoChatSessionEpoch(issuedForEpoch);
        removeStoredSession();
      }
    }

    const privyIdentityToken = await getPrivyIdentityToken?.();
    if (!privyIdentityToken) {
      throw new Error('Sign in to use debates.');
    }

    const session = await createGeoChatSession(privyIdentityToken);
    assertCurrentGeoChatSessionEpoch(issuedForEpoch);
    saveSession(session, effectiveAccountKey);
    return session;
  })().finally(() => {
    if (geoChatSessionRequests.get(requestKey) === request) {
      geoChatSessionRequests.delete(requestKey);
    }
  });

  geoChatSessionRequests.set(requestKey, request);
  return request;
}

export function resetGeoChatSession() {
  geoChatSessionEpoch += 1;
  geoChatSessionAccountKey = null;
  geoChatSessionRequests.clear();
  removeStoredSession();
}

async function getGeoChatAccessToken(getPrivyIdentityToken?: GetPrivyIdentityToken, accountKey: string | null = null) {
  if (!accountKey) throw new Error('Sign in to use debates.');
  return (await getGeoChatSession(getPrivyIdentityToken, accountKey)).access_token;
}

async function createGeoChatSession(privyToken: string): Promise<GeoChatSession> {
  const response = await fetchGeoChatSession(`${getGeoChatApiBaseUrl()}/auth/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${privyToken}` },
  });

  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<GeoChatSession>;
}

async function refreshGeoChatSession(refreshToken: string): Promise<GeoChatSession> {
  const response = await fetchGeoChatSession(`${getGeoChatApiBaseUrl()}/auth/session/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<GeoChatSession>;
}

async function fetchGeoChatSession(input: string, init: RequestInit) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      fetch(input, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Geo Chat session request timed out.'));
        }, geoChatSessionRequestTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function loadSession(accountKey: string | null): GeoChatSession | null {
  const stored = loadStoredSession();
  if (!stored || (accountKey !== null && stored.account_key !== accountKey)) return null;
  return stored.session;
}

function loadStoredSession(): StoredGeoChatSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(geoChatSessionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredGeoChatSession | GeoChatSession;
    if ('session' in parsed) return parsed;
    return { account_key: null, session: parsed };
  } catch {
    return null;
  }
}

function saveSession(session: GeoChatSession, accountKey: string | null) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      geoChatSessionStorageKey,
      JSON.stringify({ account_key: accountKey, session } satisfies StoredGeoChatSession)
    );
  }
}

function removeStoredSession() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(geoChatSessionStorageKey);
  }
}

function assertCurrentGeoChatSessionEpoch(issuedForEpoch: number) {
  if (issuedForEpoch !== geoChatSessionEpoch) {
    throw new Error('Geo Chat session changed while authentication was in progress.');
  }
}

function decodeGeoChatAccessToken(token: string | undefined): { user_id?: string } | null {
  if (!token || typeof window === 'undefined' || typeof window.atob !== 'function') return null;
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(window.atob(padded)) as { user_id?: string };
  } catch {
    return null;
  }
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}
