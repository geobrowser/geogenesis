'use client';

import cx from 'classnames';

import { useState } from 'react';

import { useVote } from '~/core/hooks/use-vote';

import { SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

interface Props {
  spaceId: string;
  onchainProposalId: string;
}

/**
 * Component for voting on membership proposals (ADD_MEMBER, REMOVE_MEMBER).
 *
 * In the new protocol, membership proposals use the same voting mechanism
 * as all other proposals via SpaceRegistry.enter() with PROPOSAL_VOTED action.
 */
export function AcceptOrRejectMember({ spaceId, onchainProposalId }: Props) {
  const [hasApproved, setHasApproved] = useState<boolean>(false);
  const [hasRejected, setHasRejected] = useState<boolean>(false);

  const { vote, status: voteStatus } = useVote({
    spaceId,
    onchainProposalId,
  });

  const hasVoted = voteStatus === 'success';
  const isPendingApproval = hasApproved && voteStatus === 'pending';
  const isPendingRejection = hasRejected && voteStatus === 'pending';

  const onApprove = () => {
    setHasApproved(true);
    vote('ACCEPT');
  };

  const onReject = () => {
    setHasRejected(true);
    vote('REJECT');
  };

  return (
    <div className="relative">
      <div className={cx('flex items-center gap-2', hasVoted && 'invisible')}>
        <SmallButton variant="secondary" onClick={onReject} disabled={voteStatus !== 'idle'}>
          <Pending isPending={isPendingRejection}>Reject</Pending>
        </SmallButton>
        <SmallButton variant="secondary" onClick={onApprove} disabled={voteStatus !== 'idle'}>
          <Pending isPending={isPendingApproval}>Approve</Pending>
        </SmallButton>
      </div>
      {hasVoted && (
        <div className="absolute inset-0 flex h-full w-full items-center justify-center">
          <div className="text-smallButton">Vote registered</div>
        </div>
      )}
    </div>
  );
}
