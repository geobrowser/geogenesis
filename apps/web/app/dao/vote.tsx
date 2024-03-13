'use client';

import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';

import * as React from 'react';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { TEST_MAIN_VOTING_PLUGIN_ADDRESS } from './constants';

interface Props {
  type: VoteOption.Yes | VoteOption.No;
  onchainProposalId: string;
  children: React.ReactNode;
}

export function Vote({ type, onchainProposalId, children }: Props) {
  const { data: wallet } = useWalletClient();

  const onClick = async () => {
    console.log('data', { type, onchainProposalId });

    const config = await prepareWriteContract({
      walletClient: wallet,
      address: TEST_MAIN_VOTING_PLUGIN_ADDRESS,
      abi: MainVotingAbi,
      functionName: 'vote',
      args: [BigInt(onchainProposalId), type, true],
    });

    const writeResult = await writeContract(config);
    console.log('writeResult', writeResult);
  };

  return <button onClick={onClick}>{children}</button>;
}
