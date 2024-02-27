'use client';

import * as React from 'react';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { TEST_MAIN_VOTING_PLUGIN_ADDRESS } from './constants';
import { abi } from './main-voting-abi';

interface Props {
  onchainProposalId: string;
  children: React.ReactNode;
}

export function Execute({ onchainProposalId, children }: Props) {
  const { data: wallet } = useWalletClient();

  const onClick = async () => {
    console.log('data', { onchainProposalId });

    const config = await prepareWriteContract({
      walletClient: wallet,
      address: TEST_MAIN_VOTING_PLUGIN_ADDRESS,
      abi,
      functionName: 'execute',
      args: [BigInt(onchainProposalId)],
    });

    const writeResult = await writeContract(config);
    console.log('writeResult', writeResult);
  };

  return <button onClick={onClick}>{children}</button>;
}
