'use client';

import * as React from 'react';

import { useProposeRemoveMember } from '~/core/hooks/use-propose-remove-member';
import {
  type SpaceParticipantProfile,
  useInfiniteScrollSentinel,
  useSpaceParticipantsInfinite,
} from '~/core/space-members/use-space-participants-infinite';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';
import { Skeleton } from '~/design-system/skeleton';

import { MemberRow } from './space-member-row';

interface Props {
  spaceId: string;
  initialTotalMembers: number;
}

export function SpaceMembersManageDialogContent({ spaceId, initialTotalMembers }: Props) {
  const { participants, totalCount, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useSpaceParticipantsInfinite({ spaceId, kind: 'members', initialTotalCount: initialTotalMembers });

  const sentinelRef = useInfiniteScrollSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage });

  const [query, setQuery] = React.useState('');

  // Search filters across already-loaded pages. Auto-loading the next page
  // keeps non-matching pages from blocking matches that haven't been fetched
  // yet — the sentinel below the list keeps pulling pages while the popover
  // is open, so eventually the full set is searchable.
  const queriedMembers = React.useMemo(() => {
    if (!query) return participants;
    const q = query.toLowerCase();
    return participants.filter(p => (p.name ? p.name.toLowerCase().includes(q) : p.id.toLowerCase().includes(q)));
  }, [participants, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <h2 className="text-metadataMedium">{totalCount} members</h2>

        <Input withSearchIcon onChange={e => setQuery(e.currentTarget.value)} />

        {isLoading ? (
          <ManageDialogSkeletons />
        ) : (
          <div className="divide-y divide-grey-02">
            {queriedMembers.map(m => (
              <CurrentMember key={m.id} member={m} spaceId={spaceId} />
            ))}
            {hasNextPage ? <div ref={sentinelRef} className="h-px" /> : null}
            {isFetchingNextPage ? <ManageDialogSkeletons count={3} /> : null}
          </div>
        )}
      </div>
    </div>
  );
}

interface CurrentMemberProps {
  member: SpaceParticipantProfile;
  spaceId: string;
}

function CurrentMember({ member, spaceId }: CurrentMemberProps) {
  const { proposeRemoveMember, status } = useProposeRemoveMember({ spaceId });

  const buttonText = (() => {
    switch (status) {
      case 'pending':
        return 'Proposing removal...';
      case 'success':
        return 'Proposal created';
      case 'error':
        return 'Try again';
      default:
        return 'Remove member';
    }
  })();

  return (
    <div key={member.id} className="flex items-center justify-between transition-colors duration-150 hover:bg-divider">
      <MemberRow user={member} />
      <SmallButton
        disabled={status === 'pending' || status === 'success'}
        onClick={event => {
          event.preventDefault();
          proposeRemoveMember({ targetMemberSpaceId: member.spaceId });
        }}
      >
        {buttonText}
      </SmallButton>
    </div>
  );
}

function ManageDialogSkeletons({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between p-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
      ))}
    </div>
  );
}
