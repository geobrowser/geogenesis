'use client';

import cx from 'classnames';

import { useState } from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useVote } from '~/core/hooks/use-vote';
import { Proposal } from '~/core/io/dto/proposals';
import { SubstreamVote } from '~/core/io/schema';

import { SmallButton } from '~/design-system/button';

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
  const [hasVoted, setHasVoted] = useState<boolean>(false);

  const { vote } = useVote({
    address: votingContractAddress,
    onchainProposalId,
  });

  const smartAccount = useSmartAccount();

  const onAccept = () => {
    vote('ACCEPT');
    setHasVoted(true);
  };

  const onReject = () => {
    vote('REJECT');
    setHasVoted(true);
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
          <SmallButton variant="secondary" onClick={onReject}>
            Reject
          </SmallButton>
          <SmallButton variant="secondary" onClick={onAccept}>
            Approve
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
