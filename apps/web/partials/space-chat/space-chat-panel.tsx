'use client';

import * as React from 'react';

import { useGeoChatAuth } from '~/core/debates/hooks';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useJoinSpace } from '~/core/hooks/use-join-space';
import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { useSpace } from '~/core/hooks/use-space';
import type { SpaceChatMessage } from '~/core/space-chat/api';
import { spaceChatErrorMessage } from '~/core/space-chat/errors';
import { useSpaceChatRoom, useSpaceChatRooms } from '~/core/space-chat/hooks';
import { mentionedIds } from '~/core/space-chat/mentions';
import { type ChatPerson, unknownPerson, useChatPeople, useSpaceChatParticipants } from '~/core/space-chat/people';
import { type SpaceChatState, shownReactions } from '~/core/space-chat/state';
import { normId } from '~/core/utils/norm-id';

import { SpaceChatView } from './space-chat-view';
import type { ChatViewComposer, ChatViewMessage } from './types';

export const SPACE_CHAT_COPY = {
  label: 'Space chat',
  empty: 'No messages yet. Say hello.',
  join: (spaceName: string | null) => (spaceName ? `Join ${spaceName} to chat` : 'Join this space to chat'),
  /** A member geo-chat hasn't caught up with yet. */
  joining: 'You’re a member now. Posting opens within a few minutes.',
  unavailable: 'Chat isn’t available for this space.',
  /** Well under geo-chat's 16 KiB body limit; a chat line, not a document. */
  maxLength: 4000,
} as const;

/**
 * A space's member-room chat (GEO-3422), on its Chat tab and in its calls. A known `roomId` starts
 * the history read early; the room list still decides who may post.
 */
export function SpaceChatPanel({
  spaceId,
  roomId: knownRoomId = null,
  className,
}: {
  spaceId: string;
  roomId?: string | null;
  className?: string;
}) {
  const { authenticated } = useGeoChatAuth();
  const viewerId = useCurrentGeoChatUserId();
  const rooms = useSpaceChatRooms(spaceId, true);
  const membership = useChatMembership(spaceId, rooms.memberRoom?.can_post === true, rooms.refetch);
  const listed = rooms.memberRoom;
  const room = React.useMemo(
    () => listed ?? (knownRoomId ? { id: knownRoomId, space_id: spaceId, kind: 'member' as const } : null),
    [knownRoomId, listed, spaceId]
  );
  const chat = useSpaceChatRoom(room, room !== null);
  const participants = useSpaceChatParticipants(spaceId, true);

  const ids = React.useMemo(() => personIds(chat.state, viewerId), [chat.state, viewerId]);
  const people = useChatPeople(ids, participants);
  const self = React.useMemo(
    () => (viewerId ? (people.get(normId(viewerId)) ?? unknownPerson(viewerId)) : null),
    [people, viewerId]
  );
  const messages = React.useMemo(() => viewMessages(chat.state, people, self), [chat.state, people, self]);
  const mentionName = React.useCallback((personId: string) => people.get(normId(personId))?.name ?? null, [people]);

  if (rooms.data?.supported === false) {
    return <p className="px-4 py-8 text-center text-metadata text-grey-04">{SPACE_CHAT_COPY.unavailable}</p>;
  }

  const canPost = authenticated && listed?.can_post === true;
  const composer: ChatViewComposer = canPost
    ? { kind: 'post', onSend: chat.send, maxLength: SPACE_CHAT_COPY.maxLength, mentionCandidates: participants }
    : authenticated && (!listed || membership.access.isLoading)
      ? { kind: 'none' }
      : membership.access.isMember || membership.access.isEditor
        ? { kind: 'closed', reason: SPACE_CHAT_COPY.joining }
        : {
            kind: 'join',
            label: SPACE_CHAT_COPY.join(membership.spaceName),
            state: membership.state,
            onJoin: membership.join,
          };

  return (
    <SpaceChatView
      className={className}
      label={SPACE_CHAT_COPY.label}
      emptyLabel={SPACE_CHAT_COPY.empty}
      messages={messages}
      status={room === null ? (rooms.isError ? 'error' : 'loading') : chat.status}
      onRetry={room === null ? () => void rooms.refetch() : chat.refetch}
      onLoadOlder={chat.loadOlder}
      loadingOlder={chat.loadingOlder}
      composer={composer}
      viewerId={viewerId}
      // Edits need posting rights; deleting one's own does not.
      onEdit={canPost ? chat.edit : undefined}
      onDelete={authenticated ? chat.remove : undefined}
      canDeleteAny={listed?.can_moderate === true}
      onReact={canPost ? chat.react : undefined}
      canReply={canPost}
      mentionName={mentionName}
      errorMessage={spaceChatErrorMessage}
    />
  );
}

const MEMBER_RECHECK_MS = [15_000, 30_000, 60_000];

/** The shared join path, plus a room-list refetch whenever membership may have landed: geo-chat learns members through its own sync. */
function useChatMembership(spaceId: string, canPost: boolean, refetchRooms: () => unknown) {
  const { space } = useSpace(spaceId);
  const spaceName = space?.entity?.name || null;
  const { join, status, optimisticRequested } = useJoinSpace({
    spaceId,
    space: spaceName ? { name: spaceName } : undefined,
  });
  const pending = useIsMembershipPending(spaceId);
  const access = useAccessControl(spaceId);
  const joined = access.isMember || access.isEditor;

  const wasPending = React.useRef(pending);
  React.useEffect(() => {
    if (wasPending.current && !pending && !canPost) void refetchRooms();
    wasPending.current = pending;
  }, [canPost, pending, refetchRooms]);
  React.useEffect(() => {
    if (joined && !canPost) void refetchRooms();
  }, [canPost, joined, refetchRooms]);
  React.useEffect(() => {
    if (canPost) return;
    const onFocus = () => void refetchRooms();
    window.addEventListener('focus', onFocus);
    // geo-chat syncs members every 5 minutes, so a known member is re-checked on a backing-off beat.
    let timer: number | undefined;
    const recheck = (step: number) => {
      timer = window.setTimeout(() => {
        onFocus();
        recheck(Math.min(step + 1, MEMBER_RECHECK_MS.length - 1));
      }, MEMBER_RECHECK_MS[step]);
    };
    if (joined) recheck(0);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearTimeout(timer);
    };
  }, [canPost, joined, refetchRooms]);

  const state: 'idle' | 'sending' | 'requested' | 'error' =
    status === 'success' || optimisticRequested || pending
      ? 'requested'
      : status === 'pending'
        ? 'sending'
        : status === 'error'
          ? 'error'
          : 'idle';
  return { spaceName, join, state, access };
}

/** Everyone the loaded messages name: authors and mentions, and the viewer for pending sends. */
function personIds(state: SpaceChatState | undefined, viewerId: string | null) {
  const ids = new Set<string>();
  if (viewerId) ids.add(normId(viewerId));
  for (const message of state?.messages ?? []) {
    ids.add(normId(message.author_id));
    for (const id of mentionedIds(message.body)) ids.add(id);
  }
  return [...ids];
}

function viewMessages(
  state: SpaceChatState | undefined,
  people: Map<string, ChatPerson>,
  self: ChatPerson | null
): ChatViewMessage[] {
  if (!state) return [];
  const byId = new Map(state.messages.map(message => [normId(message.id), message]));
  const author = (id: string) => people.get(normId(id)) ?? unknownPerson(id);
  const replyTo = (id: string | null): ChatViewMessage['replyTo'] => {
    if (!id) return undefined;
    const original = byId.get(normId(id));
    if (!original) return { id, found: false };
    return {
      id,
      found: true,
      authorName: author(original.author_id).name,
      body: original.body,
      deleted: original.deleted_at !== null,
    };
  };
  const stored = [...state.messages].reverse().map((message: SpaceChatMessage): ChatViewMessage => ({
    id: message.id,
    author: author(message.author_id),
    body: message.body,
    createdAt: message.created_at,
    editedAt: message.edited_at,
    deleted: message.deleted_at !== null,
    replyTo: replyTo(message.reply_to_message_id),
    reactions: shownReactions(message, state.pendingReactions),
  }));
  if (!self || state.pending.length === 0) return stored;
  return [
    ...stored,
    ...state.pending.map(entry => ({
      id: `pending:${entry.client_nonce}`,
      author: self,
      body: entry.body,
      createdAt: entry.created_at,
      editedAt: null,
      deleted: false,
      pending: true,
      replyTo: replyTo(entry.reply_to_message_id),
    })),
  ];
}
