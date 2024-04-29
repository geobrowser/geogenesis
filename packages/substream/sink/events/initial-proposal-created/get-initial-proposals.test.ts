import { describe, expect, it } from 'vitest';

import type { ContentProposal } from '../proposals-created/parser';
import type { SpacePluginCreated } from '../spaces-created/parser';
import { getInitialProposalsForSpaces } from './get-initial-proposals';
import { createGeoId } from '~/sink/utils/create-geo-id';

describe('get-initial-proposals', () => {
  it('proposal is in set of new spaces', () => {
    const spacesCreated: SpacePluginCreated[] = [
      {
        daoAddress: '0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239',
        spaceAddress: '',
      },
    ];

    const processedProposal: ContentProposal = {
      proposalId: createGeoId(),
      onchainProposalId: '-1',
      startTime: '0',
      endTime: '5',
      metadataUri: '',
      space: '0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239',
      name: 'Test',
      type: 'CONTENT',
      creator: '',
      actions: [],
    };

    const proposals = getInitialProposalsForSpaces(spacesCreated, [processedProposal]);
    expect(proposals).toContain(processedProposal);
  });

  it('proposal is not set of new spaces', () => {
    // const proposals = getInitialProposalsForSpaces();

    const spacesCreated: SpacePluginCreated[] = [
      {
        daoAddress: '0xF4781fA765A5D73DFa457F5d0d495344a787b57F',
        spaceAddress: '',
      },
    ];

    const processedProposal: ContentProposal = {
      proposalId: createGeoId(),
      onchainProposalId: '-1',
      startTime: '0',
      endTime: '5',
      metadataUri: '',
      space: '0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239',
      name: 'Test',
      type: 'CONTENT',
      creator: '',
      actions: [],
    };

    const proposals = getInitialProposalsForSpaces(spacesCreated, [processedProposal]);
    expect(proposals).not.toContain(processedProposal);
  });
});
