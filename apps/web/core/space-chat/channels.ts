import { dashlessId } from '~/core/debates/api';

import type { SpaceChannelPostPolicy, SpaceChannelReadPolicy, SpaceChatRoom } from './api';

/** The default channel, and where a link with no channel lands (GEO-3818). */
export const GENERAL_CHANNEL = 'general';

export const CHANNEL_NAME_MAX = 32;
export const CHANNEL_DESCRIPTION_MAX = 280;

const CHANNEL_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** A room's channel name; the two original rooms predate names on a geo-chat without channels. */
export function channelName(room: Pick<SpaceChatRoom, 'name' | 'kind' | 'id'>): string {
  if (room.name) return room.name;
  if (room.kind === 'member') return GENERAL_CHANNEL;
  if (room.kind === 'editor') return 'editors';
  return dashlessId(room.id);
}

export function readPolicy(room: SpaceChatRoom): SpaceChannelReadPolicy {
  return room.read_policy ?? (room.kind === 'editor' ? 'editors_only' : 'everyone');
}

export function postPolicy(room: SpaceChatRoom): SpaceChannelPostPolicy {
  return room.post_policy ?? (room.kind === 'editor' ? 'editors_only' : 'members_and_editors');
}

function position(room: SpaceChatRoom) {
  return room.position ?? (room.kind === 'member' ? 0 : room.kind === 'editor' ? 1 : Number.MAX_SAFE_INTEGER);
}

/** Ascending `position`, ties by id, as geo-chat orders them. */
export function sortChannels(rooms: readonly SpaceChatRoom[]): SpaceChatRoom[] {
  return [...rooms].sort((a, b) => {
    const byPosition = position(a) - position(b);
    if (byPosition !== 0) return byPosition;
    const left = dashlessId(a.id);
    const right = dashlessId(b.id);
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

/** The live channel with that name; an archived one only when no live one has it. */
export function findChannel(rooms: readonly SpaceChatRoom[], name: string): SpaceChatRoom | null {
  const wanted = name.toLowerCase();
  const named = rooms.filter(room => channelName(room) === wanted);
  return named.find(room => !room.archived) ?? named[0] ?? null;
}

/** #general and #editors: their name and read policy are fixed. */
export function isFixedChannel(room: Pick<SpaceChatRoom, 'kind'>) {
  return room.kind === 'member' || room.kind === 'editor';
}

/** Every channel but #general can be archived. */
export function canArchiveChannel(room: Pick<SpaceChatRoom, 'kind'>) {
  return room.kind !== 'member';
}

export function isPrivateChannel(room: SpaceChatRoom) {
  const read = readPolicy(room);
  return read === 'invited' || read === 'editors_only';
}

/** A name as typed, on its way to geo-chat's slug: lowercase, spaces as dashes, other characters dropped. */
export function normalizeChannelName(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, CHANNEL_NAME_MAX);
}

export function isValidChannelName(name: string) {
  return CHANNEL_NAME.test(name);
}

/** geo-chat caps counts at 100. */
export function unreadLabel(count: number | null | undefined): string | null {
  if (!count || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

export const CHANNEL_POLICY_COPY = {
  read: {
    everyone: 'Everyone',
    members_and_editors: 'Members and editors',
    editors_only: 'Editors only',
    invited: 'Invited people only',
  } satisfies Record<SpaceChannelReadPolicy, string>,
  post: {
    members_and_editors: 'Members and editors',
    editors_only: 'Editors only',
    everyone_signed_in: 'Everyone signed in',
  } satisfies Record<SpaceChannelPostPolicy, string>,
} as const;

/** The channel header's line: who reads, who posts. */
export function permissionsLine(read: SpaceChannelReadPolicy, post: SpaceChannelPostPolicy): string {
  switch (read) {
    case 'editors_only':
      return 'Only editors can read and post.';
    case 'invited':
      return post === 'editors_only'
        ? 'Only invited people can read. Editors post, invited people reply.'
        : 'Only invited people can read and post.';
    case 'members_and_editors':
      return post === 'editors_only'
        ? 'Only members and editors can read. Editors post, members reply.'
        : 'Only members and editors can read and post.';
    case 'everyone':
      return post === 'editors_only'
        ? 'Everyone can read. Editors post, members reply.'
        : post === 'everyone_signed_in'
          ? 'Everyone can read. Anyone signed in can post.'
          : 'Everyone can read. Members can post.';
  }
}
