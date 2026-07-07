'use client';

export type ParticipantSlot = 1 | 2;
export type DebateMatchStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type DebateStatus = 'ready' | 'preparing' | 'preflight' | 'in_progress' | 'thanking' | 'complete' | 'cancelled';
export type DebateRecordingSource = 'local';

export type DebateAnswer = {
  entity_id: string;
  label: string;
};

export type DebateWaiter = {
  id: string;
  user_id: string;
  profile_space_id: string;
  display_name: string | null;
  avatar_cid: string | null;
  answer: DebateAnswer;
  joined_at: string;
};

export type DebateParticipantSummary = {
  user_id: string;
  profile_space_id: string;
  display_name: string | null;
  avatar_cid: string | null;
};

export type DebateQuestionSummary = {
  id: string;
  space_id: string;
  question_entity_id: string;
  question: string;
  description: string | null;
  answer_options: DebateAnswer[];
};

export type DebateMatch = {
  id: string;
  status: DebateMatchStatus;
  question: DebateQuestionSummary;
  participants: DebateMatchParticipant[];
  turn_format_id: string | null;
  debate_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DebateMatchParticipant = DebateParticipantSummary & {
  participant_slot: ParticipantSlot;
  answer: DebateAnswer;
  accepted: boolean;
};

export type DebateParticipant = DebateParticipantSummary & {
  participant_slot: ParticipantSlot;
  answer: DebateAnswer;
  joined_at: string | null;
};

export type DebateRecording = {
  id: string;
  participant_slot: ParticipantSlot;
  answer: DebateAnswer;
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
  answer: DebateAnswer;
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
  question: DebateQuestionSummary;
  status: DebateStatus;
  room_name: string;
  first_participant_slot: ParticipantSlot;
  current_turn_index: number;
  current_speaker_slot: ParticipantSlot | null;
  prepare_started_at: string | null;
  prepare_ends_at: string | null;
  turn_started_at: string | null;
  turn_ends_at: string | null;
  preflight_ends_at: string | null;
  turn_format_id: string;
  turn_durations_ms: number[];
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  participants: DebateParticipant[];
  recordings: DebateRecording[];
  recording_error: string | null;
};

export type DebateQuestion = {
  id: string;
  space_id: string;
  question_entity_id: string;
  question: string;
  description: string | null;
  answer_options: DebateAnswer[];
  viewer_waiting_answer_entity_id: string | null;
  waiters: DebateWaiter[];
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

export type DebateQuestionsResponse = {
  questions: DebateQuestion[];
};

export type JoinDebateQueueRequest = {
  answer_entity_id: string;
  answer_label: string;
};

export type JoinDebateQueueResponse = {
  question: DebateQuestion;
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
  answer: DebateAnswer;
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

type GeoChatSession = {
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
};

const geoChatSessionStorageKey = 'geo:chat-session';

export function getGeoChatApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
}

export function getCurrentGeoChatUserId() {
  const session = loadSession();
  return decodeGeoChatAccessToken(session?.access_token)?.user_id ?? null;
}

export async function listDebateQuestions(
  spaceId: string,
  questionIds: string[],
  getPrivyIdentityToken?: GetPrivyIdentityToken
) {
  const query = questionIds.length > 0 ? `?question_ids=${encodeURIComponent(questionIds.join(','))}` : '';
  return geoChatRequest<DebateQuestionsResponse>(`/spaces/${spaceId}/debate-questions${query}`, {
    auth: 'optional',
    getPrivyIdentityToken,
  });
}

export async function joinDebateQueue(
  spaceId: string,
  questionId: string,
  request: JoinDebateQueueRequest,
  getPrivyIdentityToken: GetPrivyIdentityToken
) {
  return geoChatRequest<JoinDebateQueueResponse>(`/spaces/${spaceId}/questions/${questionId}/debate-queue`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function acceptDebateMatch(
  matchId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  formatId?: string
) {
  return geoChatRequest<MatchActionResponse>(`/debate-matches/${matchId}/accept`, {
    method: 'POST',
    body: { format_id: formatId },
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function declineDebateMatch(matchId: string, getPrivyIdentityToken: GetPrivyIdentityToken) {
  return geoChatRequest<MatchActionResponse>(`/debate-matches/${matchId}/decline`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function listSpaceDebates(spaceId: string, getPrivyIdentityToken?: GetPrivyIdentityToken) {
  return geoChatRequest<SpaceDebatesResponse>(`/spaces/${spaceId}/debates`, {
    auth: 'optional',
    getPrivyIdentityToken,
  });
}

export async function getDebate(debateId: string, getPrivyIdentityToken?: GetPrivyIdentityToken) {
  return geoChatRequest<Debate>(`/debates/${debateId}`, {
    auth: 'optional',
    getPrivyIdentityToken,
  });
}

export async function getLiveKitToken(debateId: string, getPrivyIdentityToken: GetPrivyIdentityToken) {
  return geoChatRequest<LiveKitJoinResponse>(`/debates/${debateId}/livekit-token`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function markDebateJoined(debateId: string, getPrivyIdentityToken: GetPrivyIdentityToken) {
  return geoChatRequest<Debate>(`/debates/${debateId}/joined`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function abortDebate(debateId: string, getPrivyIdentityToken: GetPrivyIdentityToken) {
  return geoChatRequest<Debate>(`/debates/${debateId}/abort`, {
    method: 'POST',
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function createLocalRecordingUpload(
  debateId: string,
  request: LocalRecordingUploadRequest,
  getPrivyIdentityToken: GetPrivyIdentityToken
) {
  return geoChatRequest<LocalRecordingUploadResponse>(`/debates/${debateId}/recordings/local-upload-url`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function completeLocalRecordingUpload(
  debateId: string,
  request: LocalRecordingCompleteRequest,
  getPrivyIdentityToken: GetPrivyIdentityToken
) {
  return geoChatRequest<RecordingCompleteResponse>(`/debates/${debateId}/recordings/local-upload-complete`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function getRecordingUrl(
  debateId: string,
  filename: string,
  getPrivyIdentityToken?: GetPrivyIdentityToken
) {
  return geoChatRequest<{ url: string }>(`/debates/${debateId}/recordings/url`, {
    method: 'POST',
    body: { filename },
    auth: 'optional',
    getPrivyIdentityToken,
  });
}

export async function getDebateMedia(debateId: string, getPrivyIdentityToken?: GetPrivyIdentityToken) {
  return geoChatRequest<DebateMediaResponse>(`/debates/${debateId}/media`, {
    auth: 'optional',
    getPrivyIdentityToken,
  });
}

export async function requestDebateMediaProcessing(
  debateId: string,
  getPrivyIdentityToken: GetPrivyIdentityToken,
  request: DebateMediaProcessRequest = {}
) {
  return geoChatRequest<DebateMediaResponse>(`/debates/${debateId}/media/process`, {
    method: 'POST',
    body: request,
    auth: true,
    getPrivyIdentityToken,
  });
}

export async function getDebateMediaArtifactUrl(
  debateId: string,
  request: DebateMediaArtifactUrlRequest,
  getPrivyIdentityToken?: GetPrivyIdentityToken
) {
  return geoChatRequest<DebateMediaArtifactUrlResponse>(`/debates/${debateId}/media/artifacts/url`, {
    method: 'POST',
    body: request,
    auth: 'optional',
    getPrivyIdentityToken,
  });
}

export async function getDebateTranscript(
  debateId: string,
  format: TranscriptFormat = 'json',
  getPrivyIdentityToken?: GetPrivyIdentityToken
) {
  return geoChatRequest<DebateTranscriptResponse>(
    `/debates/${debateId}/transcript?format=${encodeURIComponent(format)}`,
    {
      auth: 'optional',
      getPrivyIdentityToken,
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
  });

  if (!response.ok) {
    const message = await errorMessage(response);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function accessTokenForRequest(options: RequestOptions) {
  if (!options.auth) return null;

  try {
    return await getGeoChatAccessToken(options.getPrivyIdentityToken);
  } catch (error) {
    if (options.auth === 'optional') return null;
    throw error;
  }
}

async function getGeoChatAccessToken(getPrivyIdentityToken?: GetPrivyIdentityToken) {
  const stored = loadSession();
  if (stored && new Date(stored.expires_at).getTime() > Date.now() + 30_000) {
    return stored.access_token;
  }

  if (stored?.refresh_token) {
    try {
      const refreshed = await refreshGeoChatSession(stored.refresh_token);
      saveSession(refreshed);
      return refreshed.access_token;
    } catch {
      clearSession();
    }
  }

  const privyIdentityToken = await getPrivyIdentityToken?.();
  if (!privyIdentityToken) {
    throw new Error('Sign in to use debates.');
  }

  const session = await createGeoChatSession(privyIdentityToken);
  saveSession(session);
  return session.access_token;
}

async function createGeoChatSession(privyToken: string): Promise<GeoChatSession> {
  const response = await fetch(`${getGeoChatApiBaseUrl()}/auth/session`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${privyToken}` },
  });

  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<GeoChatSession>;
}

async function refreshGeoChatSession(refreshToken: string): Promise<GeoChatSession> {
  const response = await fetch(`${getGeoChatApiBaseUrl()}/auth/session/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<GeoChatSession>;
}

function loadSession(): GeoChatSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(geoChatSessionStorageKey);
    return raw ? (JSON.parse(raw) as GeoChatSession) : null;
  } catch {
    return null;
  }
}

function saveSession(session: GeoChatSession) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(geoChatSessionStorageKey, JSON.stringify(session));
  }
}

function clearSession() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(geoChatSessionStorageKey);
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
