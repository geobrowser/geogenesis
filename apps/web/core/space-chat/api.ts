import { type GetPrivyIdentityToken, geoChatRequest } from '~/core/debates/api';

/** A space chat room (GEO-3422). Every public DAO space has a `member` room and an `editor` room. */
export type SpaceChatRoom = {
  id: string;
  public_dao_space_id: string;
  space_id: string;
  kind: 'member' | 'editor';
  key: string;
  /** On the space's room list only: whether the viewer may post, reply and react here. */
  can_post?: boolean;
  /** Whether the viewer may delete anyone's message here. Absent from a geo-chat without it. */
  can_moderate?: boolean;
};

export type SpaceChatReaction = { value: string; count: number; reacted: boolean };

export type SpaceChatMessage = {
  id: string;
  room_id: string;
  room_kind: SpaceChatRoom['kind'];
  /** The author's Geo person entity id. */
  author_id: string;
  client_nonce: string;
  reply_to_message_id: string | null;
  /** `""` once deleted. */
  body: string;
  attachment_ids: string[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** Absent from a geo-chat that predates reactions. */
  reactions?: SpaceChatReaction[];
  /** Orders reaction changes on this message; absent from a geo-chat without it. */
  reaction_version?: number;
};

export type SpaceChatPage = {
  /** Newest first. */
  messages: SpaceChatMessage[];
  next_before: { before_message_id: string } | null;
};

/** Signed in, every read and write carries the account's geo-chat session. */
export type SpaceChatAuth = { getPrivyIdentityToken: GetPrivyIdentityToken; accountKey: string };

function authOptions(auth: SpaceChatAuth | null) {
  return auth
    ? { auth: 'optional' as const, getPrivyIdentityToken: auth.getPrivyIdentityToken, accountKey: auth.accountKey }
    : {};
}

function writeOptions(auth: SpaceChatAuth) {
  return { auth: true as const, getPrivyIdentityToken: auth.getPrivyIdentityToken, accountKey: auth.accountKey };
}

/** 404 `not_found` for a space that is not a public DAO space: it has no chat. */
export function listSpaceChatRooms(spaceId: string, auth: SpaceChatAuth | null, signal?: AbortSignal) {
  return geoChatRequest<{ rooms: SpaceChatRoom[] }>(`/spaces/${encodeURIComponent(spaceId)}/rooms`, {
    ...authOptions(auth),
    signal,
  });
}

export function getSpaceChatMessages(
  roomId: string,
  {
    auth,
    before,
    after,
    limit,
    signal,
  }: {
    auth: SpaceChatAuth | null;
    before?: string;
    /** Only messages newer than this id, still newest first. */
    after?: string;
    limit?: number;
    signal?: AbortSignal;
  }
) {
  const params = new URLSearchParams();
  if (limit !== undefined) params.set('limit', String(limit));
  if (before) params.set('before_message_id', before);
  if (after) params.set('after_message_id', after);
  const query = params.toString() ? `?${params.toString()}` : '';
  return geoChatRequest<SpaceChatPage>(`/rooms/${encodeURIComponent(roomId)}/messages${query}`, {
    ...authOptions(auth),
    signal,
  });
}

export function postSpaceChatMessage(
  roomId: string,
  body: { client_nonce: string; body: string; reply_to_message_id: string | null },
  auth: SpaceChatAuth
) {
  return geoChatRequest<SpaceChatMessage>(`/rooms/${encodeURIComponent(roomId)}/messages`, {
    ...writeOptions(auth),
    method: 'POST',
    body: { ...body, attachment_ids: [] },
  });
}

export function editSpaceChatMessage(messageId: string, body: string, auth: SpaceChatAuth) {
  return geoChatRequest<SpaceChatMessage>(`/messages/${encodeURIComponent(messageId)}`, {
    ...writeOptions(auth),
    method: 'PUT',
    body: { body },
  });
}

export function deleteSpaceChatMessage(messageId: string, auth: SpaceChatAuth) {
  return geoChatRequest<SpaceChatMessage>(`/messages/${encodeURIComponent(messageId)}`, {
    ...writeOptions(auth),
    method: 'DELETE',
    body: {},
  });
}

export function setSpaceChatReaction(messageId: string, value: string, added: boolean, auth: SpaceChatAuth) {
  return geoChatRequest<{
    reaction: { message_id: string; user_id: string; value: string };
    count: number;
    /** The message's `reaction_version` after the request; absent from a geo-chat without it. */
    version?: number;
  }>(`/messages/${encodeURIComponent(messageId)}/reactions`, {
    ...writeOptions(auth),
    method: added ? 'PUT' : 'DELETE',
    body: { value },
  });
}
