import { createGeoId } from '@geogenesis/sdk';
import { describe, expect, it } from 'vitest';

import type { EditProposal } from '../proposals-created/parser';
import type { SpacePluginCreated } from '../spaces-created/parser';
import { getInitialProposalsForSpaces } from './get-initial-proposals';

describe('get-initial-proposals', () => {
  it('proposal is in set of new spaces', () => {
    const spacesCreated: SpacePluginCreated[] = [
      {
        daoAddress: '0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239',
        spaceAddress: '',
      },
    ];

    const processedProposal: EditProposal = {
      proposalId: createGeoId(),
      onchainProposalId: '-1',
      startTime: '0',
      endTime: '5',
      metadataUri: '',
      pluginAddress: '',
      space: '0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239',
      name: 'Test',
      type: 'EDIT',
      creator: '',
      ops: [],
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

    const processedProposal: EditProposal = {
      proposalId: createGeoId(),
      onchainProposalId: '-1',
      startTime: '0',
      endTime: '5',
      metadataUri: '',
      pluginAddress: '',
      space: '0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239',
      name: 'Test',
      type: 'EDIT',
      creator: '',
      ops: [],
    };

    const proposals = getInitialProposalsForSpaces(spacesCreated, [processedProposal]);
    expect(proposals).not.toContain(processedProposal);
  });
});
