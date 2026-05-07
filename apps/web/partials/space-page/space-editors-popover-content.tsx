'use client';

import * as React from 'react';

import pluralize from 'pluralize';

import {
  useInfiniteScrollSentinel,
  useSpaceParticipantsInfinite,
} from '~/core/space-members/use-space-participants-infinite';

import { Skeleton } from '~/design-system/skeleton';

import { SpaceEditorsPopoverEditorRequestButton } from './space-editors-popover-editor-request-button';
import { MemberRow } from './space-member-row';

interface Props {
  spaceId: string;
  isEditor: boolean;
  isMember: boolean;
  hasRequestedSpaceEditorship: boolean;
  connectedAddress: string | null;
}

export function SpaceEditorsContent({
  spaceId,
  isEditor,
  isMember,
  hasRequestedSpaceEditorship,
  connectedAddress,
}: Props) {
  const { participants, totalCount, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useSpaceParticipantsInfinite({ spaceId, kind: 'editors' });

  const sentinelRef = useInfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage });

  return (
    <div className="z-10 w-[356px] divide-y divide-grey-02 rounded-lg border border-grey-02 bg-white shadow-lg">
      <div className="max-h-[265px] overflow-hidden overflow-y-auto">
        {isLoading ? (
          <ParticipantRowSkeletons />
        ) : (
          <>
            {participants.map(p => (
              <MemberRow key={p.id} user={p} />
            ))}
            {hasNextPage ? <div ref={sentinelRef} className="h-px" /> : null}
            {isFetchingNextPage ? <ParticipantRowSkeletons count={3} /> : null}
          </>
        )}
      </div>

      <div className="flex items-center justify-between p-2">
        <p className="text-smallButton text-text">
          {totalCount} {pluralize('editor', totalCount)}
        </p>
        {isEditor ? (
          <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? '' : 'Sign in to join'}
          </button>
        ) : (
          <div className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
            {connectedAddress ? (
              <SpaceEditorsPopoverEditorRequestButton
                spaceId={spaceId}
                isMember={isMember}
                hasRequestedSpaceEditorship={hasRequestedSpaceEditorship}
              />
            ) : (
              'Sign in to join'
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ParticipantRowSkeletons({ count = 5 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 p-2">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ))}
    </>
  );
}
