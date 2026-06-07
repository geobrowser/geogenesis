export type GeoChatApiErrorBody = {
  error: {
    code: string;
    message: string;
    retry_after_seconds?: number;
  };
};

export type GeoChatSession = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type PublicDaoSpace = {
  id: string;
  space_id: string;
  contract_address: string;
  network: string;
  name: string | null;
  avatar_cid: string | null;
};

export type SpaceRoom = {
  id: string;
  public_dao_space_id: string;
  space_id: string;
  kind: 'member' | 'editor';
  key: string;
};

export type GeoChatMessage = {
  id: string;
  room_id: string;
  room_kind: 'member' | 'editor';
  author_id: string;
  client_nonce: string;
  reply_to_message_id: string | null;
  body: string;
  attachment_ids: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type ListSpacesResponse = {
  spaces: PublicDaoSpace[];
};

export type ListRoomsResponse = {
  rooms: SpaceRoom[];
};

export type ListMessagesResponse = {
  messages: GeoChatMessage[];
  next_before: string | null;
};

type ApiFetchOptions = Omit<RequestInit, 'headers'> & {
  accessToken?: string | null;
  headers?: HeadersInit;
};

export class GeoChatApiError extends Error {
  code: string;
  status: number;
  retryAfterSeconds?: number;
  requestId: string | null;

  constructor({
    code,
    message,
    status,
    retryAfterSeconds,
    requestId,
  }: {
    code: string;
    message: string;
    status: number;
    retryAfterSeconds?: number;
    requestId: string | null;
  }) {
    super(message);
    this.name = 'GeoChatApiError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.requestId = requestId;
  }
}

const DEFAULT_GEO_CHAT_API_BASE_URL = '/api/geo-chat';
const DEFAULT_GEO_CHAT_WEB_SOCKET_URL = 'ws://127.0.0.1:18080/gateway/ws';

export function getGeoChatApiBaseUrl() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_GEO_CHAT_API_BASE_URL ?? DEFAULT_GEO_CHAT_API_BASE_URL);
}

export function getGeoChatWebSocketUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_GEO_CHAT_WS_URL;
  if (configuredUrl) return configuredUrl;

  const baseUrl = getGeoChatApiBaseUrl();
  if (baseUrl.startsWith('/')) return DEFAULT_GEO_CHAT_WEB_SOCKET_URL;

  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/gateway/ws';
  url.search = '';
  return url.toString();
}

export async function listPublicDaoSpaces({ accessToken }: { accessToken?: string | null } = {}) {
  return apiFetch<ListSpacesResponse>('/spaces', { accessToken });
}

export async function listSpaceRooms(spaceId: string, { accessToken }: { accessToken?: string | null } = {}) {
  return apiFetch<ListRoomsResponse>(`/spaces/${encodeURIComponent(spaceId)}/rooms`, { accessToken });
}

export async function listRoomMessages({
  roomId,
  accessToken,
  limit = 50,
  beforeMessageId,
}: {
  roomId: string;
  accessToken?: string | null;
  limit?: number;
  beforeMessageId?: string | null;
}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeMessageId) params.set('before_message_id', beforeMessageId);

  return apiFetch<ListMessagesResponse>(`/rooms/${encodeURIComponent(roomId)}/messages?${params}`, { accessToken });
}

export async function createRoomMessage({
  roomId,
  accessToken,
  clientNonce,
  body,
  replyToMessageId = null,
  attachmentIds = [],
}: {
  roomId: string;
  accessToken: string;
  clientNonce: string;
  body: string;
  replyToMessageId?: string | null;
  attachmentIds?: string[];
}) {
  return apiFetch<GeoChatMessage>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: 'POST',
    accessToken,
    body: JSON.stringify({
      client_nonce: clientNonce,
      body,
      reply_to_message_id: replyToMessageId,
      attachment_ids: attachmentIds,
    }),
  });
}

export async function createChatSession(privyIdentityToken: string) {
  return apiFetch<GeoChatSession>('/auth/session', {
    method: 'POST',
    accessToken: privyIdentityToken,
  });
}

export async function refreshChatSession(refreshToken: string) {
  return apiFetch<GeoChatSession>('/auth/session/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function revokeChatSession({
  accessToken,
  refreshToken,
}: {
  accessToken?: string | null;
  refreshToken: string;
}) {
  return apiFetch<void>('/auth/session/revoke', {
    method: 'POST',
    accessToken,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  const response = await fetch(`${getGeoChatApiBaseUrl()}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function toApiError(response: Response) {
  const requestId = response.headers.get('x-request-id');
  const fallback = new GeoChatApiError({
    code: 'request_failed',
    message: `Chat request failed with status ${response.status}`,
    status: response.status,
    requestId,
  });

  try {
    const body = (await response.json()) as GeoChatApiErrorBody;
    if (!body.error) return fallback;

    return new GeoChatApiError({
      code: body.error.code,
      message: body.error.message,
      status: response.status,
      retryAfterSeconds: body.error.retry_after_seconds,
      requestId,
    });
  } catch {
    return fallback;
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
