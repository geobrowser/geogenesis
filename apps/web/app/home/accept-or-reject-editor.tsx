'use client';

import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { encodeFunctionData } from 'viem';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
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
  const smartAccount = useSmartAccount();

  const onApprove = async () => {
    if (!votingContractAddress || !smartAccount) return;

    const hash = await smartAccount.sendTransaction({
      to: votingContractAddress as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: MainVotingAbi,
        functionName: 'vote',
        args: [BigInt(onchainProposalId), VoteOption.Yes, true],
      }),
    });

    console.log('transaction successful', hash);
  };

  const onReject = async () => {
    if (!votingContractAddress || !smartAccount) return;

    const hash = await smartAccount.sendTransaction({
      to: votingContractAddress as `0x${string}`,
      value: 0n,
      data: encodeFunctionData({
        abi: MainVotingAbi,
        functionName: 'vote',
        args: [BigInt(onchainProposalId), VoteOption.Yes, false],
      }),
    });

    console.log('transaction successful', hash);
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
      <div className="flex items-center gap-2">
        <SmallButton variant="secondary" onClick={onReject}>
          Reject
        </SmallButton>
        <SmallButton variant="secondary" onClick={onApprove}>
          Approve
        </SmallButton>
      </div>
    );
  }

  return null;
}
