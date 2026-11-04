'use client';

import * as React from 'react';

import Link from 'next/link';

import { useGeoChatAuth } from '~/core/debates/hooks';
import { useCurrentGeoChatUserId } from '~/core/debates/use-current-geo-chat-user-id';
import { useAccessControl } from '~/core/hooks/use-access-control';
import { useJoinSpace } from '~/core/hooks/use-join-space';
import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { usePrivySignIn } from '~/core/hooks/use-privy-sign-in';
import { useSpace } from '~/core/hooks/use-space';
import type { SpaceChatMessage } from '~/core/space-chat/api';
import { spaceChatErrorMessage } from '~/core/space-chat/errors';
import { useSpaceChatAuth, useSpaceChatRoom, useSpaceChatRooms } from '~/core/space-chat/hooks';
import { mentionedIds } from '~/core/space-chat/mentions';
import { type ChatPerson, unknownPerson, useChatPeople, useSpaceChatParticipants } from '~/core/space-chat/people';
import { spaceChatTabPath } from '~/core/space-chat/routes';
import { type SpaceChatState, shownReactions } from '~/core/space-chat/state';
import { normId } from '~/core/utils/norm-id';

import { SpaceChatView } from './space-chat-view';
import type { ChatViewAuthor, ChatViewComposer, ChatViewMessage } from './types';

export const SPACE_CHAT_COPY = {
  label: 'Space chat',
  title: 'Chat',
  /** The member room's access, as geo-chat grants it. */
  access: 'Everyone can read. Members can post.',
  alsoPostsTo: 'Also posts to the space’s',
  alsoPostsToLink: 'Chat',
  empty: 'No messages yet. Say hello.',
  signedOut: (spaceName: string | null) => `Log in and join ${spaceName ?? 'this space'} to chat.`,
  nonMember: (spaceName: string | null) => `Members of ${spaceName ?? 'this space'} can post here. Anyone can read.`,
  /** Signed in while geo-chat is still setting the account up. */
  settingUp: 'Your account is still being set up. You can post once it’s ready.',
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
  subtitle = SPACE_CHAT_COPY.access,
  onArrival,
  className,
}: {
  spaceId: string;
  roomId?: string | null;
  /** The header's second line; the room's access by default. */
  subtitle?: React.ReactNode;
  /** Called when someone else's message arrives after the first load. */
  onArrival?: () => void;
  className?: string;
}) {
  const { ready: authReady, authenticated } = useGeoChatAuth();
  const { settingUp } = useSpaceChatAuth();
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
  const recentAuthors = React.useMemo(() => recentPeople(chat.state, people), [chat.state, people]);
  useArrivals(chat.state, viewerId, onArrival);
  const signIn = usePrivySignIn(undefined, {
    analytics: {
      component: 'space_chat',
      target_type: 'space',
      target_id: spaceId,
      auth_control: 'space_chat_log_in',
      auth_intent: 'space_chat',
      auth_continuation: 'repeat',
    },
  });
  const mentionName = React.useCallback((personId: string) => people.get(normId(personId))?.name ?? null, [people]);

  if (rooms.data?.supported === false) {
    return <p className="px-4 py-8 text-center text-metadata text-grey-04">{SPACE_CHAT_COPY.unavailable}</p>;
  }

  // An account geo-chat is still setting up reads the public way and writes nothing.
  const writer = authenticated && !settingUp;
  const canPost = writer && listed?.can_post === true;
  const composer: ChatViewComposer = canPost
    ? { kind: 'post', onSend: chat.send, maxLength: SPACE_CHAT_COPY.maxLength, mentionCandidates: participants }
    : !authReady
      ? { kind: 'none' }
      : settingUp
        ? { kind: 'closed', reason: SPACE_CHAT_COPY.settingUp }
        : !authenticated
          ? { kind: 'sign_in', label: SPACE_CHAT_COPY.signedOut(membership.spaceName), onSignIn: () => void signIn() }
          : !listed || membership.access.isLoading
            ? { kind: 'none' }
            : membership.access.isMember || membership.access.isEditor
              ? { kind: 'closed', reason: SPACE_CHAT_COPY.joining }
              : {
                  kind: 'join',
                  label: SPACE_CHAT_COPY.nonMember(membership.spaceName),
                  state: membership.state,
                  onJoin: membership.join,
                };

  return (
    <SpaceChatView
      className={className}
      header={{ title: SPACE_CHAT_COPY.title, subtitle, people: recentAuthors }}
      label={SPACE_CHAT_COPY.label}
      emptyLabel={SPACE_CHAT_COPY.empty}
      messages={messages}
      status={room === null ? (rooms.isError ? 'error' : 'loading') : chat.status}
      onRetry={room === null ? () => void rooms.refetch() : chat.refetch}
      onLoadOlder={chat.loadOlder}
      loadingOlder={chat.loadingOlder}
      composer={composer}
      viewerId={viewerId}
      // geo-chat requires write access for edits and deletes: own messages need posting rights,
      // other people's need moderation.
      onEdit={canPost ? chat.edit : undefined}
      onDelete={writer ? chat.remove : undefined}
      canDeleteOwn={canPost}
      canDeleteAny={writer && listed?.can_moderate === true}
      onReact={canPost ? chat.react : undefined}
      canReply={canPost}
      mentionName={mentionName}
      errorMessage={spaceChatErrorMessage}
    />
  );
}

/** The in-call chat's header line: the call's messages are the space's chat. */
export function SpaceChatAlsoPostsTo({ spaceId }: { spaceId: string }) {
  return (
    <>
      {SPACE_CHAT_COPY.alsoPostsTo}{' '}
      <Link href={spaceChatTabPath(spaceId)} className="text-text underline">
        {SPACE_CHAT_COPY.alsoPostsToLink}
      </Link>
    </>
  );
}

/**
 * Reports each change of newest stored message written by someone else. The first load, older
 * pages and the viewer's own sends are not arrivals.
 */
function useArrivals(state: SpaceChatState | undefined, viewerId: string | null, onArrival?: () => void) {
  const newest = state?.messages[0];
  const newestId = newest ? normId(newest.id) : null;
  const previous = React.useRef<string | null>(null);
  const callback = React.useRef(onArrival);
  callback.current = onArrival;
  React.useEffect(() => {
    const before = previous.current;
    previous.current = newestId;
    if (before === null || newestId === null || before === newestId || !newest) return;
    if (viewerId && normId(newest.author_id) === normId(viewerId)) return;
    callback.current?.();
  }, [newest, newestId, viewerId]);
}

/** Distinct authors of the loaded messages, newest first. */
function recentPeople(state: SpaceChatState | undefined, people: Map<string, ChatPerson>): ChatViewAuthor[] {
  const seen = new Map<string, ChatViewAuthor>();
  for (const message of state?.messages ?? []) {
    if (message.deleted_at !== null) continue;
    const id = normId(message.author_id);
    if (!seen.has(id)) seen.set(id, people.get(id) ?? unknownPerson(message.author_id));
  }
  return [...seen.values()];
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
