'use client';

import cx from 'classnames';

import { useState } from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useVote } from '~/core/hooks/use-vote';
import { Proposal } from '~/core/io/dto/proposals';
import { SubstreamVote } from '~/core/io/schema';

import { SmallButton } from '~/design-system/button';
import { Pending } from '~/design-system/pending';

import { Execute } from '~/partials/active-proposal/execute';

interface Props {
  isProposalEnded: boolean;
  // If the proposal is executable that means it's done and the
  // acceptance threshold has passed.
  isProposalExecutable: boolean;
  status: Proposal['status'];

  userVote: SubstreamVote | undefined;
  onchainProposalId: string;
  votingContractAddress: `0x${string}`;
}

export function AcceptOrRejectEditor({
  isProposalEnded,
  isProposalExecutable,
  status,
  userVote,
  onchainProposalId,
  votingContractAddress,
}: Props) {
  const { vote, status: voteStatus } = useVote({
    address: votingContractAddress,
    onchainProposalId,
  });

  const [hasApproved, setHasApproved] = useState<boolean>(false);
  const [hasRejected, setHasRejected] = useState<boolean>(false);

  const hasVoted = voteStatus === 'success';
  const isPendingApproval = hasApproved && voteStatus === 'pending';
  const isPendingRejection = hasRejected && voteStatus === 'pending';

  const smartAccount = useSmartAccount();

  const onAccept = () => {
    setHasApproved(true);
    vote('ACCEPT');
  };

  const onReject = () => {
    setHasRejected(true);
    vote('REJECT');
  };

  if (isProposalExecutable) {
    return (
      <Execute contractAddress={votingContractAddress} onchainProposalId={onchainProposalId}>
        Execute
      </Execute>
    );
  }

  if (userVote) {
    if (userVote.vote === 'ACCEPT') {
      return <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">You accepted</div>;
    }

    return <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">You rejected</div>;
  }

  if (isProposalEnded) {
    if (status === 'ACCEPTED') {
      return <div className="rounded bg-successTertiary px-3 py-2 text-button text-green">Accepted</div>;
    }

    return <div className="rounded bg-errorTertiary px-3 py-2 text-button text-red-01">Rejected</div>;
  }

  if (!isProposalEnded && smartAccount) {
    return (
      <div className="relative">
        <div className={cx('flex items-center gap-2', hasVoted && 'invisible')}>
          <SmallButton variant="secondary" onClick={onReject} disabled={voteStatus !== 'idle'}>
            <Pending isPending={isPendingRejection}>Reject</Pending>
          </SmallButton>
          <SmallButton variant="secondary" onClick={onAccept} disabled={voteStatus !== 'idle'}>
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

  return null;
}
