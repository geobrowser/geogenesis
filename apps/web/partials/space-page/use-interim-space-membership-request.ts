'use client';

import { MembershipAbi } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';

import { useContractWrite, usePrepareContractWrite } from 'wagmi';

// Request access to a space. Right now we use an intermin mechanism
// via a standalone membership request contract. This will eventually
// be replaced by our aragon governance contracts.
export function useInterimSpaceMembershipRequest(spaceId: string) {
  const { config } = usePrepareContractWrite({
    address: SYSTEM_IDS.MEMBERSHIP_CONTRACT_ADDRESS,
    abi: MembershipAbi,
    functionName: 'requestMembership',
    args: [spaceId],
  });

  const { write } = useContractWrite(config);

  return {
    requestMembership: write,
  };
}
