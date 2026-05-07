'use client';

import * as React from 'react';

import pluralize from 'pluralize';

import {
  useInfiniteScrollSentinel,
  useSpaceParticipantsInfinite,
} from '~/core/space-members/use-space-participants-infinite';

import { Skeleton } from '~/design-system/skeleton';

import { MemberRow } from './space-member-row';
import { SpaceMembersPopoverMemberRequestButton } from './space-members-popover-members-request-button';

interface Props {
  spaceId: string;
  isPublicSpace: boolean;
  isMember: boolean;
  hasRequestedSpaceMembership: boolean;
  connectedAddress: string | null;
}

export function SpaceMembersContent({
  spaceId,
  isPublicSpace,
  isMember,
  hasRequestedSpaceMembership,
  connectedAddress,
}: Props) {
  const { participants, totalCount, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useSpaceParticipantsInfinite({ spaceId, kind: 'members' });

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
          {totalCount} {pluralize('member', totalCount)}
        </p>
        {isPublicSpace && (
          <>
            {isMember ? (
              <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
                {connectedAddress ? 'Leave space' : 'Sign in to join'}
              </button>
            ) : connectedAddress ? (
              <SpaceMembersPopoverMemberRequestButton
                spaceId={spaceId}
                hasRequestedSpaceMembership={hasRequestedSpaceMembership}
              />
            ) : (
              <button className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text">
                Sign in to join
              </button>
            )}
          </>
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
