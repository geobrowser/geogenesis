import { describe, it } from 'vitest';

import { mapIpfsProposalToSchemaProposalByType } from './map-proposals';

/**
 * High level indexing architecture
 * - Geo "actions" are encoded into specific structures matching the action being performed
 * - Substream listens to events from onchain that contain an action structure containing the contents of the action
 * - Sink listens to and decodes event data
 * - Sink fetches encoded structures from IPFS and decodes them
 * - Sink writes contents of decoded IPFS structures to a database
 */

/**
 * # Indexing geo steps
 * 1. Write "encoded" proposal structure to IPFS from client (see sdk for structures)
 *    a. Encode actions, proposal name, proposal id, other metadata into structure
 *    b. Write to IPFS and receive IPFS hash
 * 2. Write onchain "proposeNewEditors/submitNewEdits/processGeoProposal" with content URI from #1
 * 3. Listen to proposal created event from onchain in #2 with content URI from #1 (/src/map_proposals_created)
 * 4. Emit event from substream and write data to Geo as a Proposal (/sink/events/proposal-created)
 *    a. Parse correct onchain event (there may be many events at once)
 *    b. Fetch content URI from IPFS and decode into the specific proposal type (content, membership, subspace, editorship, etc.)
 *    c. Write IPFS content into proposals, actions, proposed versions
 * 5. Voting happens
 * 6. If voting succeeds, listen for `GeoProposalProcessed` with content URI from #1
 * 7. Turn proposals, actions, proposed versions from #4 into entities, versions, triples
 */

describe('mapIpfsProposalToSchemaProposalByType', () => {
  it('creates expected proposal data', () => {
    const proposals = 'data from some IPFS file';

    /**
     * CONTENT proposal
     * MEMBERSHIP proposal
     * EDITORSHIP proposal
     * SUBSPACE proposal
     */
    const idk = mapIpfsProposalToSchemaProposalByType([], {
      blockNumber: 0,
      cursor: '',
      requestId: '',
      timestamp: 0,
    });
  });
});
