'use client';

import * as React from 'react';

import cx from 'classnames';

import { formatParticipantName } from './space-chat-data';
import type { SpaceChatParticipant } from './types';
import { Avatar } from '~/design-system/avatar';
import { PrefetchLink as Link } from '~/design-system/prefetch-link';
import { Skeleton } from '~/design-system/skeleton';

type Props = {
  participants: SpaceChatParticipant[];
  editorsTotal: number;
  membersTotal: number;
  isLoading: boolean;
  hasMoreEditors: boolean;
  hasMoreMembers: boolean;
  isFetchingMore: boolean;
  onLoadMoreEditors: () => void;
  onLoadMoreMembers: () => void;
  className?: string;
};

export function SpaceChatMemberSidebar({
  participants,
  editorsTotal,
  membersTotal,
  isLoading,
  hasMoreEditors,
  hasMoreMembers,
  isFetchingMore,
  onLoadMoreEditors,
  onLoadMoreMembers,
  className,
}: Props) {
  const editors = participants.filter(participant => participant.role === 'editor');
  const members = participants.filter(participant => participant.role === 'member');

  return (
    <aside className={cx('flex min-h-0 flex-col border-l border-grey-02 bg-bg', className)}>
      <div className="flex h-14 shrink-0 items-center border-b border-grey-02 px-3">
        <div>
          <div className="text-metadataMedium text-text">Members</div>
          <div className="text-footnote text-grey-04">{editorsTotal + membersTotal} in this space</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {isLoading ? (
          <MemberSkeleton />
        ) : (
          <>
            <MemberSection
              label="Editors"
              total={editorsTotal}
              participants={editors}
              hasMore={hasMoreEditors}
              isFetchingMore={isFetchingMore}
              onLoadMore={onLoadMoreEditors}
            />
            <MemberSection
              label="Members"
              total={membersTotal}
              participants={members}
              hasMore={hasMoreMembers}
              isFetchingMore={isFetchingMore}
              onLoadMore={onLoadMoreMembers}
            />
          </>
        )}
      </div>
    </aside>
  );
}

function MemberSection({
  label,
  total,
  participants,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: {
  label: string;
  total: number;
  participants: SpaceChatParticipant[];
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section className="space-y-1 pb-4">
      <div className="px-2 pb-1 text-footnoteMedium text-grey-04 uppercase">
        {label} - {total || participants.length}
      </div>
      {participants.map(participant => (
        <MemberRow key={participant.id} participant={participant} />
      ))}
      {participants.length === 0 ? (
        <div className="px-2 py-1 text-metadata text-grey-04">No {label.toLowerCase()} loaded</div>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          disabled={isFetchingMore}
          onClick={onLoadMore}
          className="mx-2 mt-1 rounded border border-grey-02 px-2 py-1 text-footnoteMedium text-grey-04 transition-colors hover:border-text hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isFetchingMore ? 'Loading...' : 'Load more'}
        </button>
      ) : null}
    </section>
  );
}

function MemberRow({ participant }: { participant: SpaceChatParticipant }) {
  const body = (
    <>
      <div className="relative size-7 shrink-0 overflow-hidden rounded-full">
        <Avatar avatarUrl={participant.avatarUrl} value={participant.address} size={28} />
        <span
          className={cx(
            'absolute right-0 bottom-0 size-2 rounded-full border border-white',
            participant.status === 'online' && 'bg-green',
            participant.status === 'idle' && 'bg-orange',
            participant.status === 'offline' && 'bg-grey-03'
          )}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-metadataMedium text-text">{formatParticipantName(participant)}</div>
        <div className="text-footnote text-grey-04">{participant.role}</div>
      </div>
    </>
  );

  const className = 'flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-white';

  if (participant.profileLink) {
    return (
      <Link href={participant.profileLink} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}

function MemberSkeleton() {
  return (
    <div className="space-y-2 px-2">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}
