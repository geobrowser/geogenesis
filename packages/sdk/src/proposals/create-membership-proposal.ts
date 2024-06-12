import type { MembershipProposalMetadata } from '../..'
import { createGeoId } from '../id'

export function createMembershipProposal({
  name,
  type,
  userAddress,
}: {
  name: string
  type: MembershipProposalMetadata['type']
  userAddress: `0x${string}`
}): MembershipProposalMetadata {
  return {
    type,
    version: '1.0.0',
    proposalId: createGeoId(),
    userAddress: userAddress,
    name,
  }
}
