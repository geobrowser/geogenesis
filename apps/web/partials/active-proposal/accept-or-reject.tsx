'use client';

import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { encodeFunctionData } from 'viem';

import * as React from 'react';

import { useSmartAccount } from '~/core/hooks/use-smart-account';
import { Vote } from '~/core/types';

import { Button } from '~/design-system/button';

import { Execute } from './execute';

export function AcceptOrReject({
  isProposalDone,
  userVote,
  onchainProposalId,
  votingContractAddress,
}: {
  isProposalDone: boolean;
  userVote: Vote | undefined;
  onchainProposalId: string;
  votingContractAddress: `0x${string}`;
}) {
  const smartAccount = useSmartAccount();

  const onClick = async (option: Vote['vote']) => {
    if (!smartAccount) {
      return;
    }

    await smartAccount.sendTransaction({
      to: votingContractAddress,
      value: 0n,
      data: encodeFunctionData({
        abi: MainVotingAbi,
        functionName: 'vote',
        args: [BigInt(onchainProposalId), option === 'ACCEPT' ? VoteOption.Yes : VoteOption.No, true],
      }),
    });
  };

  if (process.env.NODE_ENV === 'development' && isProposalDone) {
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

  if (!isProposalDone && smartAccount) {
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
