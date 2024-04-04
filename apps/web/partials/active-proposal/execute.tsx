'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';

import * as React from 'react';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, waitForTransaction, writeContract } from 'wagmi/actions';

import { Button } from '~/design-system/button';

interface Props {
  onchainProposalId: string;
  contractAddress: `0x${string}`;
  children: React.ReactNode;
}

export function Execute({ onchainProposalId, contractAddress, children }: Props) {
  const { data: wallet } = useWalletClient();

  const onClick = async () => {
    const config = await prepareWriteContract({
      walletClient: wallet,
      address: contractAddress,
      abi: MainVotingAbi,
      functionName: 'execute',
      args: [BigInt(onchainProposalId)],
    });

    console.log('writeResult', config);

    const writeResult = await writeContract(config);

    console.log('writeResult', writeResult);
    const idk = await waitForTransaction(writeResult);
  };

  return (
    <Button variant="secondary" onClick={onClick}>
      {children}
    </Button>
  );
}
