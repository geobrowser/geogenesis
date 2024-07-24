'use client';

import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { encodeFunctionData } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { useVote } from '~/core/hooks/use-vote';
import { Proposal, Vote } from '~/core/types';

import { SmallButton } from '~/design-system/button';

import { Execute } from '~/partials/active-proposal/execute';

interface Props {
  isProposalEnded: boolean;
  // If the proposal is executable that means it's done and the
  // acceptance threshold has passed.
  isProposalExecutable: boolean;
  status: Proposal['status'];

  userVote: Vote | undefined;
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
  const { vote } = useVote({
    address: votingContractAddress,
    onchainProposalId,
  });

  const smartAccount = useSmartAccount();

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
      <div className="flex items-center gap-2">
        <SmallButton variant="secondary" onClick={() => vote('REJECT')}>
          Reject
        </SmallButton>
        <SmallButton variant="secondary" onClick={() => vote('ACCEPT')}>
          Approve
        </SmallButton>
      </div>
    );
  }

  return null;
}
