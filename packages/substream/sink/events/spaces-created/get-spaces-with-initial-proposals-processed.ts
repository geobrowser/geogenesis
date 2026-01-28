import { getChecksumAddress } from '@geoprotocol/geo-sdk';

import type { ChainEditPublished } from '../schema/edit-published';
import type { SpacePluginCreated } from './parser';

/**
 * If we have a set of "SpacePluginCreated" events in the same block as a set of "ProposalProcessed" events
 * we need to check if any of the processed proposals are because an initial content IPFS URI was passed
 * during space creation.
 *
 * If there are processed proposals as a result of an initial content uri, we need to create the appropriate
 * proposals, proposed versions, actions, etc. before we actually set the proposal as "ACCEPTED"
 */
export function getSpacesWithInitialProposalsProcessed(
  spacesCreated: SpacePluginCreated[],
  proposalsProcessed: ChainEditPublished[]
) {
  const proposalPluginAddresses = new Set(proposalsProcessed.map(s => getChecksumAddress(s.pluginAddress)));
  return spacesCreated.filter(p => proposalPluginAddresses.has(getChecksumAddress(p.spaceAddress)));
}
