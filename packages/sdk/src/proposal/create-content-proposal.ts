import type { Action, ContentProposalMetadata } from '../..'
import { createGeoId } from '../id'

export function createContentProposal(
  name: string,
  actions: Action[]
): ContentProposalMetadata {
  return {
    type: 'content',
    version: '1.0.0',
    actions,
    proposalId: createGeoId(),
    name,
  }
}
