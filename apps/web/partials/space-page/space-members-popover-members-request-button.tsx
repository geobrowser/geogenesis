'use client';

import { useJoinSpace } from '~/core/hooks/use-join-space';
import { useIsMembershipPending } from '~/core/hooks/use-pending-memberships';
import { type ActiveMemberRequest } from '~/core/io/subgraph/fetch-proposed-members';

import { Pending } from '~/design-system/pending';

import { UnderVote } from './request-status-label';

type SpaceMembersPopoverMemberRequestButtonProps = {
  spaceId: string;
  memberRequest: ActiveMemberRequest | null;
};

export function SpaceMembersPopoverMemberRequestButton({
  spaceId,
  memberRequest,
}: SpaceMembersPopoverMemberRequestButtonProps) {
  const { join: handleJoin, status, optimisticRequested } = useJoinSpace({ spaceId });

  // Durable + optimistic pending state so a request made anywhere (and surviving
  // refresh) reflects here without waiting on this page's SSR memberRequest.
  const isPending = useIsMembershipPending(spaceId);

  // A still-listed request whose vote has ended is busted: executed requests drop
  // off the list, so this one can no longer execute and the vote can't be revived.
  const isStuck = Boolean(memberRequest?.isVotingEnded);

  // Open vote, or just submitted (before the indexer catches up) — show the live
  // vote so we never flip back to "Request again". A stuck request never counts.
  if (status === 'success' || optimisticRequested || (!isStuck && (memberRequest != null || isPending))) {
    return (
      <span className="text-smallButton text-grey-04">
        <UnderVote />
      </span>
    );
  }

  return (
    <Pending isPending={status === 'pending'} position="end">
      <button
        className="text-smallButton text-grey-04 transition-colors duration-75 hover:text-text"
        disabled={status !== 'idle'}
        onClick={handleJoin}
        title={isStuck ? "Your previous request can't be completed and needs to be sent again." : undefined}
      >
        <RequestButtonText status={status} isStuck={isStuck} />
      </button>
    </Pending>
  );
}

type RequestButtonTextProps = {
  status: 'error' | 'idle' | 'pending' | 'success';
  isStuck: boolean;
};

const RequestButtonText = ({ status, isStuck }: RequestButtonTextProps) => {
  if (status === 'error') return 'Error';
  if (isStuck) return 'Must request again';
  return 'Request to join';
};
