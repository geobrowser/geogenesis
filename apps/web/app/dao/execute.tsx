'use client';

import { DaoAbi, MainVotingAbi, SpaceAbi } from '@geogenesis/sdk/abis';
import { decodeErrorResult, decodeFunctionResult } from 'viem';

import * as React from 'react';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, waitForTransaction, writeContract } from 'wagmi/actions';

import { TEST_DAO_ADDRESS, TEST_MAIN_VOTING_PLUGIN_ADDRESS } from './constants';

interface Props {
  onchainProposalId: string;
  children: React.ReactNode;
}

export function Execute({ onchainProposalId, children }: Props) {
  const { data: wallet } = useWalletClient();

  const onClick = async () => {
    try {
      console.log('data', { onchainProposalId });

      // const value = decodeFunctionResult({
      //   abi: DaoAbi,
      //   functionName: 'execute',
      //   data: '0xd4e57c2049f004fb297ef78591cd409503ceb6b2c722d7ffed032fc99e5f3b58',
      // });

      // console.log('decoded', value);

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
    } catch (e) {
      console.info(e);
    }
  };

  return <button onClick={onClick}>{children}</button>;
}
