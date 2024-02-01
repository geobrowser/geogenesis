'use client';

import { VoteOption } from '@geogenesis/sdk';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

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
      // Main voting plugin address for DAO at 0x9b843a69F456f9422eCfB7247d1344Eb14C40A93
      address: '0x467E86f1898D81F0D5c6cbf45a1FF3bfcb16ba00',
      abi,
      functionName: 'vote',
      args: [BigInt(onchainProposalId), VoteOption.Yes, true],
    });

    const writeResult = await writeContract(config);
    console.log('writeResult', writeResult);
  };

  return <button onClick={onClick}>{children}</button>;
}
