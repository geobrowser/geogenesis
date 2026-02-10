'use client';

import cx from 'classnames';

import { useState } from 'react';

import { useVote } from '~/core/hooks/use-vote';

import { SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

interface Props {
  spaceId: string;
  proposalId: string;
}

/**
 * Component for voting on membership proposals (ADD_MEMBER, REMOVE_MEMBER).
 *
 * Membership proposals use the fast-path voting mode, so the contract
 * automatically executes the proposal when the vote threshold is met.
 * No separate execute step is needed.
 */
export function AcceptOrRejectMember({ spaceId, proposalId }: Props) {
  const [selectedVote, setSelectedVote] = useState<'ACCEPT' | 'REJECT' | null>(null);

  const { vote, status: voteStatus } = useVote({
    spaceId,
    proposalId,
  });

  const hasVoted = voteStatus === 'success';
  const hasError = voteStatus === 'error';
  const isPendingApproval = selectedVote === 'ACCEPT' && voteStatus === 'pending';
  const isPendingRejection = selectedVote === 'REJECT' && voteStatus === 'pending';

  const onApprove = () => {
    setSelectedVote('ACCEPT');
    vote('ACCEPT');
  };

  const onReject = () => {
    setSelectedVote('REJECT');
    vote('REJECT');
  };

  if (hasError) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-smallButton text-red-01">Vote failed</p>
        <SmallButton
          variant="secondary"
          onClick={() => {
            if (selectedVote) vote(selectedVote);
          }}
        >
          Retry
        </SmallButton>
      </div>
    );
  }

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
          <div className="text-smallButton">{selectedVote === 'ACCEPT' ? 'Approved' : 'Rejected'}</div>
        </div>
      )}
    </div>
  );
}
