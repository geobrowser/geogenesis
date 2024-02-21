'use client';

import { MembershipAbi } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { useWriteContract } from 'wagmi';

// Request access to a space. Right now we use an intermin mechanism
// via a standalone membership request contract. This will eventually
// be replaced by our aragon governance contracts.
export function useInterimSpaceMembershipRequest(spaceId: string) {
  const { writeContract } = useWriteContract();

  return {
    requestMembership: () =>
      writeContract({
        address: SYSTEM_IDS.MEMBERSHIP_CONTRACT_ADDRESS,
        abi: MembershipAbi,
        functionName: 'requestMembership',
        args: [spaceId],
      }),
  };
}
