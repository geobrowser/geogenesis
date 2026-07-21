'use client';

export type ParticipantSlot = 1 | 2;
export type DebateMatchStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type DebateStatus = 'ready' | 'connecting' | 'preflight' | 'in_progress' | 'thanking' | 'complete' | 'cancelled';
export type DebateRecordingSource = 'local';
export type DebateRematchStatus = 'deciding' | 'browsing' | 'request_pending' | 'converted' | 'ended' | 'expired';
export type DebateRematchRequestStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

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
  | 'preview_image'
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

export type Debate = {
  id: string;
  claim: DebateClaimSummary;
  status: DebateStatus;
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
  recordings: DebateRecording[];
  recording_error: string | null;
  cancellation_reason: string | null;
  recording_cancelled_at: string | null;
  recording_cancelled_by: string | null;
};

export type DebateActivity = {
  online: boolean;
  cooldown_until: string | null;
  match: DebateMatch | null;
  debate: Debate | null;
  rematch: DebateRematchSession | null;
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
  recipient_position: boolean;
  turn_format_id: string;
  created_at: string;
  expires_at: string;
};

export type DebateRematchSession = {
  id: string;
  source_debate_id: string;
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
};

export type DebateRematchClaim = {
  claim: DebateClaimSummary;
  participants: DebateRematchClaimPosition[];
  shared_preference: boolean;
  recently_rejected: boolean;
  previously_debated: boolean;
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
  viewer_waiting_position: boolean | null;
  online_choices: DebateOnlineChoice[];
  active_match: DebateMatch | null;
  active_debate: Debate | null;
  created_at: string;
  updated_at: string;
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

export type JoinDebateQueueRequest = {
  position: boolean;
};

export type JoinDebateQueueResponse = {
  claim: DebateClaim;
  match: DebateMatch | null;
};

export type MatchActionResponse = {
  match: DebateMatch;
  debate: Debate | null;
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

export async function listDebateClaims(
  spaceId: string,
  claimIds: string[],
  getPrivyIdentityToken?: GetPrivyIdentityToken,
  accountKey?: string | null,
  signal?: AbortSignal
) {
  const query = claimIds.length > 0 ? `?claim_ids=${encodeURIComponent(claimIds.join(','))}` : '';
  return geoChatRequest<DebateClaimsResponse>(`/spaces/${spaceId}/debate-claims${query}`, {
    auth: 'optional',
    getPrivyIdentityToken,
    accountKey,
    signal,
  });
}

export async function joinDebateQueue(
  spaceId: string,
  claimId: string,
  request: JoinDebateQueueRequest,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<JoinDebateQueueResponse>(`/spaces/${spaceId}/claims/${claimId}/debate-queue`, {
    method: 'POST',
    body: request,
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

export async function updateDebatePreference(
  spaceId: string,
  claimId: string,
  request: JoinDebateQueueRequest,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<JoinDebateQueueResponse>(`/spaces/${spaceId}/claims/${claimId}/debate-preference`, {
    method: 'PUT',
    body: request,
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function acceptDebateMatch(
  matchId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null,
  formatId?: string
) {
  return geoChatRequest<MatchActionResponse>(`/debate-matches/${matchId}/accept`, {
    method: 'POST',
    body: { format_id: formatId },
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
}

export async function declineDebateMatch(
  matchId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<MatchActionResponse>(`/debate-matches/${matchId}/decline`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
    accountKey,
  });
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

export async function updateDebateRematchPosition(
  sessionId: string,
  claimId: string,
  position: boolean,
  sourceSpaceId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  accountKey: string | null
) {
  return geoChatRequest<DebateRematchClaimsResponse>(`/debate-rematches/${sessionId}/claims/${claimId}/position`, {
    method: 'PUT',
    body: { position, source_space_id: sourceSpaceId },
    auth: true,
    getPrivyIdentityToken,
    accountKey,
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
