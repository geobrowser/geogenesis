'use client';

import { ProposalType, VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi, MemberAccessAbi } from '@geogenesis/sdk/abis';

import * as React from 'react';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { Vote } from '~/core/types';

import { Button } from '~/design-system/button';

import { Execute } from './execute';

export function AcceptOrReject({
  isProposalDone,
  userVote,
  onchainProposalId,
  votingContractAddress,
  membershipContractAddress,
  proposalType,
}: {
  isProposalDone: boolean;
  userVote: Vote | undefined;
  onchainProposalId: string;
  proposalType: ProposalType;
  votingContractAddress: `0x${string}`;

  // Our Debug execution function requires either the main voting plugin address
  // or the membership access plugin address depending on the type of proposal.
  // e.g., a membership proposal requires the membership access plugin address.
  membershipContractAddress: `0x${string}`;
}) {
  const { data: wallet } = useWalletClient();

  const isMembershipProposal = proposalType === 'ADD_MEMBER' || proposalType === 'REMOVE_MEMBER';

  // @TODO: This will go to the /home page instead of here
  const onApprove = async () => {
    const config = await prepareWriteContract({
      walletClient: wallet,
      address: membershipContractAddress,
      abi: MemberAccessAbi,
      functionName: 'approve',
      args: [BigInt(onchainProposalId)],
    });

    const writeResult = await writeContract(config);
    console.log('writeResult', writeResult);
  };

  const onClick = async (option: Vote['vote']) => {
    const config = await prepareWriteContract({
      walletClient: wallet,
      address: votingContractAddress,
      abi: MainVotingAbi,
      functionName: 'vote',
      args: [BigInt(onchainProposalId), option === 'ACCEPT' ? VoteOption.Yes : VoteOption.No, true],
    });

    const writeResult = await writeContract(config);
    console.log('writeResult', writeResult);
  };

  if (process.env.NODE_ENV === 'development' && isProposalDone) {
    return (
      <Execute
        contractAddress={isMembershipProposal ? membershipContractAddress : votingContractAddress}
        onchainProposalId={onchainProposalId}
      >
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

  if (!isProposalDone && wallet) {
    return (
      <div className="inline-flex items-center gap-4">
        <Button onClick={() => onClick('REJECT')} variant="error">
          Reject
        </Button>
        <span>or</span>
        <Button onClick={() => (isMembershipProposal ? onApprove() : onClick('ACCEPT'))} variant="success">
          Accept
        </Button>
      </div>
    );
  }

  return null;
}
