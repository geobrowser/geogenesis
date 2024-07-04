'use client';

import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { encodeFunctionData } from 'viem';

import * as React from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { Proposal, Vote } from '~/core/types';

import { Button } from '~/design-system/button';

import { Execute } from './execute';

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

export function AcceptOrReject({
  isProposalEnded,
  isProposalExecutable,
  status,
  userVote,
  onchainProposalId,
  votingContractAddress,
}: Props) {
  const smartAccount = useSmartAccount();

  const onClick = async (option: Vote['vote']) => {
    if (!smartAccount) {
      return;
    }

    const hash = await smartAccount.sendTransaction({
      to: votingContractAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: MainVotingAbi,
        functionName: 'vote',
        args: [BigInt(onchainProposalId), option === 'ACCEPT' ? VoteOption.Yes : VoteOption.No, true],
      }),
    });

    console.log('voting transaction successful', hash);
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
      <div className="inline-flex items-center gap-4">
        <Button onClick={() => onClick('REJECT')} variant="error">
          Reject
        </Button>
        <span>or</span>
        <Button onClick={() => onClick('ACCEPT')} variant="success">
          Accept
        </Button>
      </div>
    );
  }

  return null;
}
