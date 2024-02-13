'use client';

import { VoteOption } from '@geogenesis/sdk';

import * as React from 'react';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { TEST_MAIN_VOTING_PLUGIN_ADDRESS } from './constants';
import { abi } from './main-voting-abi';

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
      // Main voting plugin address for DAO at 0xd9abC01d1AEc200FC394C2717d7E14348dC23792
      address: TEST_MAIN_VOTING_PLUGIN_ADDRESS,
      abi,
      functionName: 'vote',
      args: [BigInt(onchainProposalId), type, true],
    });

    const writeResult = await writeContract(config);
    console.log('writeResult', writeResult);
  };

  return <button onClick={onClick}>{children}</button>;
}
