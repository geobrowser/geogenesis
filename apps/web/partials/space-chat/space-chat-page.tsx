'use client';

import * as React from 'react';

import {
  type SpaceParticipantProfile,
  useSpaceParticipantsInfinite,
} from '~/core/space-members/use-space-participants-infinite';

import { DEFAULT_SPACE_CHAT_CHANNEL, DEFAULT_SPACE_CHAT_CHANNEL_ID } from './channels';
import { SpaceChatComposer } from './composer';
import { SpaceChatMemberSidebar } from './member-sidebar';
import { SpaceChatMessageList } from './message-list';
import {
  fallbackSpaceChatParticipants,
  mergeSpaceChatParticipants,
} from './space-chat-data';
import type { SpaceChatParticipant } from './types';
import { useSpaceChatMessages } from './use-space-chat-messages';

type Props = {
  spaceId: string;
  spaceName: string;
  connectedAddress: string | null;
  canPost: boolean;
};

export function SpaceChatPage({ spaceId, spaceName, connectedAddress, canPost }: Props) {
  const editorsQuery = useSpaceParticipantsInfinite({ spaceId, kind: 'editors', pageSize: 24 });
  const membersQuery = useSpaceParticipantsInfinite({ spaceId, kind: 'members', pageSize: 24 });

  const [draft, setDraft] = React.useState('');
  const chat = useSpaceChatMessages({ spaceId, channelId: DEFAULT_SPACE_CHAT_CHANNEL_ID });
  const messages = chat.messages;

  const participants = React.useMemo(
    () =>
      buildVisibleParticipants({
        editors: editorsQuery.participants,
        members: membersQuery.participants,
        connectedAddress,
        canPost,
        spaceName,
      }),
    [canPost, connectedAddress, editorsQuery.participants, membersQuery.participants, spaceName]
  );

  const participantsById = React.useMemo(() => {
    const map = new Map(participants.map(participant => [participant.id, participant]));
    return map;
  }, [participants]);

  const sendMessage = React.useCallback(() => {
    const body = draft.trim();
    if (!body || !canPost || !chat.isAvailable) return;
    void chat.sendMessage(body);
    setDraft('');
  }, [canPost, chat, draft]);

  return (
    <section
      className="h-[min(76vh,760px)] min-h-[620px] overflow-hidden rounded-md border border-grey-02 bg-white shadow-light lg:h-auto lg:min-h-[680px]"
      aria-label={`${spaceName} chat`}
    >
      <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_240px] lg:grid-cols-1">
        <div className="flex min-h-0 flex-col">
          <ChatHeader
            title={DEFAULT_SPACE_CHAT_CHANNEL.name}
            description={DEFAULT_SPACE_CHAT_CHANNEL.description}
            participantCount={editorsQuery.totalCount + membersQuery.totalCount || participants.length}
          />
          <SpaceChatMessageList spaceName={spaceName} messages={messages} participantsById={participantsById} />
          <SpaceChatComposer
            spaceName={spaceName}
            value={draft}
            canPost={canPost && chat.isAvailable}
            isPosting={chat.isPosting}
            error={chat.postError?.message ?? null}
            disabledPlaceholder={canPost ? 'Chat service coming soon' : 'Only space members and editors can chat'}
            onChange={setDraft}
            onSubmit={sendMessage}
          />
        </div>

        <SpaceChatMemberSidebar
          participants={participants}
          editorsTotal={editorsQuery.totalCount}
          membersTotal={membersQuery.totalCount}
          isLoading={editorsQuery.isLoading || membersQuery.isLoading}
          hasMoreEditors={Boolean(editorsQuery.hasNextPage)}
          hasMoreMembers={Boolean(membersQuery.hasNextPage)}
          isFetchingMore={editorsQuery.isFetchingNextPage || membersQuery.isFetchingNextPage}
          onLoadMoreEditors={() => void editorsQuery.fetchNextPage()}
          onLoadMoreMembers={() => void membersQuery.fetchNextPage()}
          className="lg:hidden"
        />
      </div>
    </section>
  );
}

function ChatHeader({
  title,
  description,
  participantCount,
}: {
  title: string;
  description: string;
  participantCount: number;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-grey-02 px-4">
      <div className="min-w-0">
        <h1 className="truncate text-smallTitle text-text">{title}</h1>
        <p className="truncate text-metadata text-grey-04">{description}</p>
      </div>
      <div className="shrink-0 rounded border border-grey-02 px-2 py-1 text-footnoteMedium text-grey-04">{participantCount} people</div>
    </header>
  );
}

function buildVisibleParticipants({
  editors,
  members,
  connectedAddress,
  canPost,
  spaceName,
}: {
  editors: SpaceParticipantProfile[];
  members: SpaceParticipantProfile[];
  connectedAddress: string | null;
  canPost: boolean;
  spaceName: string;
}): SpaceChatParticipant[] {
  const merged = mergeSpaceChatParticipants({ editors, members, connectedAddress, canPost });
  if (merged.length > 0) return merged;
  return fallbackSpaceChatParticipants({ spaceName, connectedAddress, canPost });
}
