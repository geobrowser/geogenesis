import { type GetPrivyIdentityToken, geoChatRequest } from '~/core/debates/api';

export type SpaceChannelReadPolicy = 'everyone' | 'members_and_editors' | 'editors_only' | 'invited';
export type SpaceChannelPostPolicy = 'members_and_editors' | 'editors_only' | 'everyone_signed_in';

/**
 * A space chat room (GEO-3422), which is a channel (GEO-3818): `member` is #general, `editor` is
 * #editors, `channel` is one an editor made. The channel fields are absent from a geo-chat without
 * channels.
 */
export type SpaceChatRoom = {
  id: string;
  public_dao_space_id: string;
  space_id: string;
  kind: 'member' | 'editor' | 'channel';
  key: string;
  name?: string;
  /** `""` when none. */
  description?: string;
  read_policy?: SpaceChannelReadPolicy;
  post_policy?: SpaceChannelPostPolicy;
  slow_mode?: boolean;
  archived?: boolean;
  position?: number;
  created_by?: string | null;
  /** Bumped by every settings change; `channel.updated` at or below the held one is stale. */
  version?: number;
  /** On the space's room list only: whether the viewer may post here. */
  can_post?: boolean;
  /** Whether the viewer may reply and react. Equals `can_post` except in replies-only channels. */
  can_reply?: boolean;
  /** Whether the viewer may delete anyone's message here. Absent from a geo-chat without it. */
  can_moderate?: boolean;
  /** Capped at 100; `null` signed out. */
  unread_count?: number | null;
  last_read_message_id?: string | null;
};

export type SpaceChatRoomList = {
  rooms: SpaceChatRoom[];
  /** Absent from a geo-chat without channels. */
  channels_enabled?: boolean;
  can_manage_channels?: boolean;
};

/** What an editor sets on a channel. */
export type SpaceChannelSettings = {
  name: string;
  description: string;
  read_policy: SpaceChannelReadPolicy;
  post_policy: SpaceChannelPostPolicy;
  slow_mode: boolean;
};

export type SpaceChannelMember = { user_id: string; added_by: string; added_at: string };

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

/**
 * 404 `not_found` for a space that is not a public DAO space: it has no chat. `includeArchived`
 * also lists archived channels, marked `archived: true`.
 */
export function listSpaceChatRooms(
  spaceId: string,
  auth: SpaceChatAuth | null,
  signal?: AbortSignal,
  includeArchived = false
) {
  const query = includeArchived ? '?include_archived=true' : '';
  return geoChatRequest<SpaceChatRoomList>(`/spaces/${encodeURIComponent(spaceId)}/rooms${query}`, {
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
    /** The message's `reaction_version` after the request. */
    reaction_version: number;
    /** Every emoji's count and the viewer's `reacted` after the request; parsed by the caller. */
    reactions: unknown;
  }>(`/messages/${encodeURIComponent(messageId)}/reactions`, {
    ...writeOptions(auth),
    method: added ? 'PUT' : 'DELETE',
    body: { value },
  });
}

/** Moves the viewer's read cursor forward; geo-chat never moves it back. */
export function markSpaceChatRoomRead(roomId: string, lastReadMessageId: string, auth: SpaceChatAuth) {
  return geoChatRequest<unknown>(`/rooms/${encodeURIComponent(roomId)}/read-state`, {
    ...writeOptions(auth),
    method: 'PUT',
    body: { last_read_message_id: lastReadMessageId },
  });
}

/** Editors only. `member_ids` only with `read_policy: 'invited'`. */
export function createSpaceChannel(
  spaceId: string,
  body: SpaceChannelSettings & { member_ids: string[] },
  auth: SpaceChatAuth
) {
  return geoChatRequest<SpaceChatRoom>(`/spaces/${encodeURIComponent(spaceId)}/channels`, {
    ...writeOptions(auth),
    method: 'POST',
    body,
  });
}

/** Editors only: any subset of the settings, or `archived` to archive and restore. */
export function updateSpaceChannel(
  roomId: string,
  body: Partial<SpaceChannelSettings> & { archived?: boolean },
  auth: SpaceChatAuth
) {
  return geoChatRequest<SpaceChatRoom>(`/rooms/${encodeURIComponent(roomId)}`, {
    ...writeOptions(auth),
    method: 'PATCH',
    body,
  });
}

/** The people added to an invited channel, oldest first; editors are not listed. */
export function listSpaceChannelMembers(roomId: string, auth: SpaceChatAuth, signal?: AbortSignal) {
  return geoChatRequest<{ members: SpaceChannelMember[] }>(`/rooms/${encodeURIComponent(roomId)}/members`, {
    ...writeOptions(auth),
    signal,
  });
}

/** At most 100 ids. Editors add and remove anyone; a member may remove only themself. */
export function changeSpaceChannelMembers(roomId: string, userIds: string[], added: boolean, auth: SpaceChatAuth) {
  return geoChatRequest<{ members: SpaceChannelMember[] }>(`/rooms/${encodeURIComponent(roomId)}/members`, {
    ...writeOptions(auth),
    method: added ? 'POST' : 'DELETE',
    body: { user_ids: userIds },
  });
}
