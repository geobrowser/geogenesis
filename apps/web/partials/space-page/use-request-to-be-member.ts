'use client';

import { createMembershipProposal } from '@geogenesis/sdk';
import { MemberAccessAbi } from '@geogenesis/sdk/abis';
import { stringToHex } from 'viem';

import { useAccount } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { Services } from '~/core/services';

export function useRequestToBeMember(memberAccessPluginAddress: string | null) {
  const { storageClient } = Services.useServices();
  const { address: requestorAddress } = useAccount();

  // @TODO(baiirun): What should this API look like in the SDK?
  const write = async () => {
    if (!memberAccessPluginAddress || !requestorAddress) {
      return null;
    }

    const membershipProposalMetadata = createMembershipProposal({
      name: 'Request to be a member',
      type: 'ADD_MEMBER',
      userAddress: requestorAddress,
    });

    const hash = await storageClient.uploadObject(membershipProposalMetadata);
    const uri = `ipfs://${hash}` as const;

    const config = await prepareWriteContract({
      address: memberAccessPluginAddress as `0x${string}`,
      abi: MemberAccessAbi,
      functionName: 'proposeNewMember',
      args: [stringToHex(uri), requestorAddress as `0x${string}`],
    });

    const writer = await writeContract(config);
    return writer.hash;
  };

  return {
    requestToBeMember: write,
  };
}
