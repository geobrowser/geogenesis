'use client';

import { createMembershipProposal } from '@geogenesis/sdk';
import { MemberAccessAbi } from '@geogenesis/sdk/abis';
import { getAddress, stringToHex } from 'viem';

import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { Services } from '~/core/services';

export function useProposeToRemoveMember(memberAccessPluginAddress: string) {
  const { storageClient } = Services.useServices();

  const write = async (memberToRemove: string) => {
    const membershipProposalMetadata = createMembershipProposal({
      name: 'Remove member request',
      type: 'REMOVE_MEMBER',
      userAddress: getAddress(memberToRemove) as `0x${string}`,
    });

    const hash = await storageClient.uploadObject(membershipProposalMetadata);
    const uri = `ipfs://${hash}` as const;

    const config = await prepareWriteContract({
      address: memberAccessPluginAddress as `0x${string}`,
      abi: MemberAccessAbi,
      functionName: 'proposeRemoveMember',
      args: [stringToHex(uri), getAddress(memberToRemove) as `0x${string}`],
    });

    const writer = await writeContract(config);
    return writer.hash;
  };

  return {
    proposeToRemoveMember: write,
  };
}
