import type { SubspaceProposalMetadata } from '../..'
import { createGeoId } from '../id'

export function createSubspaceProposal({
  name,
  type,
  spaceAddress,
}: {
  name: string
  type: SubspaceProposalMetadata['type']
  spaceAddress: `0x${string}`
}): SubspaceProposalMetadata {
  return {
    type,
    version: '1.0.0',
    proposalId: createGeoId(),
    subspace: spaceAddress,
    name,
  }
}
