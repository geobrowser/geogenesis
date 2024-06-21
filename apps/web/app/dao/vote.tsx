'use client';

import { VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';

import * as React from 'react';

import { useConfig } from 'wagmi';
import { simulateContract, writeContract } from 'wagmi/actions';

import { TEST_MAIN_VOTING_PLUGIN_ADDRESS } from './constants';

interface Props {
  type: VoteOption.Yes | VoteOption.No;
  onchainProposalId: string;
  children: React.ReactNode;
}

export function Vote({ type, onchainProposalId, children }: Props) {
  const walletConfig = useConfig();

  const onClick = async () => {
    const config = await simulateContract(walletConfig, {
      // Main voting plugin address for DAO at 0xd9abC01d1AEc200FC394C2717d7E14348dC23792
      address: TEST_MAIN_VOTING_PLUGIN_ADDRESS,
      abi: MainVotingAbi,
      functionName: 'vote',
      args: [BigInt(onchainProposalId), type, true],
    });

    const writeResult = await writeContract(walletConfig, config.request);
    console.log('writeResult', writeResult);
  };

  return <button onClick={onClick}>{children}</button>;
}
