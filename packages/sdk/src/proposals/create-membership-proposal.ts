import type { MembershipProposalMetadata } from '../..'
import { createGeoId } from '../id'
import { ActionType, Membership } from '../proto'

function getActionTypeFromType(type: MembershipProposalMetadata['type']): ActionType {
  switch (type) {
    case 'ADD_EDITOR':
      return ActionType.ADD_EDITOR
    case 'REMOVE_EDITOR':
      return ActionType.REMOVE_EDITOR
    case 'ADD_MEMBER':
      return ActionType.ADD_MEMBER
    case 'REMOVE_MEMBER':
      return ActionType.REMOVE_MEMBER
    default:
      throw new Error(`Unsupported action type in createMembershipProposal: ${type}`)
  }
}

export function createMembershipProposal({
  name,
  type,
  userAddress,
}: {
  name: string
  type: MembershipProposalMetadata['type']
  userAddress: `0x${string}`
}): Uint8Array {
  return new Membership({
    type: getActionTypeFromType(type),
    version: '1.0.0',
    id: createGeoId(),
    user: userAddress,
    name,
  }).toBinary()
}
