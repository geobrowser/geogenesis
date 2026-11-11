'use client';

import * as React from 'react';

import { useViewerVotingMode } from '~/core/hooks/use-fast-path-restricted';
import { useProposeRemoveMember } from '~/core/hooks/use-propose-remove-member';
import { type SpaceParticipantsPage } from '~/core/space-members/fetch-space-participants-page';
import {
  type SpaceParticipantProfile,
  useInfiniteScrollSentinel,
  useSpaceParticipantsInfinite,
} from '~/core/space-members/use-space-participants-infinite';
import { mutationStatusLabel } from '~/core/utils/mutation-status-label';

import { SmallButton } from '~/design-system/button';
import { Input } from '~/design-system/input';
import { Skeleton } from '~/design-system/skeleton';

import { MemberFastPathControl } from './member-fast-path-control';
import { MemberRow } from './space-member-row';

interface Props {
  spaceId: string;
  isEditor: boolean;
  initialParticipantsPage?: SpaceParticipantsPage;
}

export function SpaceMembersManageDialogContent({ spaceId, isEditor, initialParticipantsPage }: Props) {
  const { participants, totalCount, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useSpaceParticipantsInfinite({
      spaceId,
      kind: 'members',
      initialPage: initialParticipantsPage,
    });

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
              <CurrentMember key={m.id} member={m} spaceId={spaceId} isEditor={isEditor} />
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
  isEditor: boolean;
}

function CurrentMember({ member, spaceId, isEditor }: CurrentMemberProps) {
  const { proposeRemoveMember, status } = useProposeRemoveMember({ spaceId });

  const buttonText = mutationStatusLabel(status, {
    idle: 'Remove member',
    pending: 'Proposing removal...',
    success: 'Proposal created',
  });

  // Fast-path proposals are editor-only on-chain; routing non-editor callers
  // to slow-path avoids an InvalidFromSpace() revert from the DAOSpace contract.
  // A restricted editor is routed to slow-path too, or it reverts FastPathRestricted().
  const votingMode = useViewerVotingMode({ spaceId, isEditor });

  return (
    <div key={member.id} className="flex items-center justify-between transition-colors duration-150 hover:bg-divider">
      <MemberRow user={member} />
      <div className="flex shrink-0 items-center gap-2">
        {isEditor ? <MemberFastPathControl spaceId={spaceId} memberSpaceId={member.spaceId} canRestrict /> : null}
        <SmallButton
          disabled={status === 'pending' || status === 'success'}
          onClick={event => {
            event.preventDefault();
            proposeRemoveMember({ targetMemberSpaceId: member.spaceId, votingMode });
          }}
        >
          {buttonText}
        </SmallButton>
      </div>
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
