'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';

import * as React from 'react';

import { useConfig } from 'wagmi';
import { simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';

import { Button } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  contractAddress: `0x${string}`;
  children: React.ReactNode;
}

export function Execute({ onchainProposalId, contractAddress, children }: Props) {
  const walletConfig = useConfig();

  const onClick = async () => {
    const config = await simulateContract(walletConfig, {
      address: contractAddress,
      abi: MainVotingAbi,
      functionName: 'execute',
      args: [BigInt(onchainProposalId)],
    });

    console.log('writeResult', config);

    const writeResult = await writeContract(walletConfig, config.request);

    const idk = await waitForTransactionReceipt(walletConfig, {
      hash: writeResult,
    });

    // @TODO(governance): Verify transaction rececipt
  };

  return (
    <Button variant="secondary" onClick={onClick}>
      {children}
    </Button>
  );
}
