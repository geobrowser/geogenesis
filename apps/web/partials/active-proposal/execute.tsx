'use client';

import { MainVotingAbi } from '@geogenesis/sdk/abis';

import * as React from 'react';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, waitForTransaction, writeContract } from 'wagmi/actions';

import { TEST_MAIN_VOTING_PLUGIN_ADDRESS } from '~/app/dao/constants';

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
      abi: MainVotingAbi,
      functionName: 'execute',
      args: [BigInt(onchainProposalId)],
    });

    console.log('writeResult', config);

    const writeResult = await writeContract(config);

    console.log('writeResult', writeResult);
    const idk = await waitForTransaction(writeResult);
    console.log('idk', idk);
  };

  return <button onClick={onClick}>{children}</button>;
}
