import type { EditProposal } from './proposals-created/parser';

/**
 *
 * Proposals, Ops, Versions, etc. may not exist if the processed proposal has been executed as part
 * of space deployment or as part of publishing edits in a personal space.
 *
 * If there are processed proposals as a result of either of these, we need to create the appropriate
 * proposals, proposed versions, ops, etc. before we actually set the proposal as "ACCEPTED" and set
 * any downstream relations that point to the Proposal in the DB.
 */
export function getProposalsForSpaceIds(spacesCreated: string[], proposals: EditProposal[]) {
  const spaceAddresses = new Set(spacesCreated);
  return proposals.filter(p => spaceAddresses.has(p.space));
}
