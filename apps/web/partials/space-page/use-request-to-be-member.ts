'use client';

import { createMembershipProposal } from '@geogenesis/sdk';
import { MemberAccessAbi } from '@geogenesis/sdk/abis';
import { getAddress, stringToHex } from 'viem';

import { useAccount, useConfig } from 'wagmi';
import { simulateContract, writeContract } from 'wagmi/actions';

import { Services } from '~/core/services';

export function useRequestToBeMember(memberAccessPluginAddress: string | null) {
  const { storageClient } = Services.useServices();
  const { address: requestorAddress } = useAccount();
  const walletConfig = useConfig();

  const write = async () => {
    if (!memberAccessPluginAddress || !requestorAddress) {
      return null;
    }

    const membershipProposalMetadata = createMembershipProposal({
      name: 'Member request',
      type: 'ADD_MEMBER',
      userAddress: getAddress(requestorAddress),
    });

    // @TODO(governance): upload binary
    const hash = await storageClient.uploadObject(membershipProposalMetadata);
    const uri = `ipfs://${hash}` as const;

    const config = await simulateContract(walletConfig, {
      address: memberAccessPluginAddress as `0x${string}`,
      abi: MemberAccessAbi,
      functionName: 'proposeNewMember',
      args: [stringToHex(uri), getAddress(requestorAddress) as `0x${string}`],
    });

    const txHash = await writeContract(walletConfig, config.request);
    return txHash;
  };

  return {
    requestToBeMember: write,
  };
}
