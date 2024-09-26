import { createGeoId } from '@geobrowser/gdk';
import { describe, expect, it } from 'vitest';

import { getProposalsForSpaceIds } from './get-proposals-for-space-ids';
import type { EditProposal } from './proposals-created/parser';

describe('getProposalsForSpaceIds', () => {
  it('proposal is in set of new spaces', () => {
    const spacesCreated: string[] = ['0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239'];

    const processedProposal: EditProposal = {
      proposalId: createGeoId(),
      onchainProposalId: '-1',
      startTime: '0',
      endTime: '5',
      metadataUri: '',
      pluginAddress: '',
      space: '0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239',
      name: 'Test',
      type: 'ADD_EDIT',
      creator: '',
      ops: [],
    };

    const proposals = getProposalsForSpaceIds(spacesCreated, [processedProposal]);
    expect(proposals).toContain(processedProposal);
  });

  it('proposal is not set of new spaces', () => {
    // const proposals = getInitialProposalsForSpaces();

    const spacesCreated: string[] = ['0xF4781fA765A5D73DFa457F5d0d495344a787b57F'];

    const processedProposal: EditProposal = {
      proposalId: createGeoId(),
      onchainProposalId: '-1',
      startTime: '0',
      endTime: '5',
      metadataUri: '',
      pluginAddress: '',
      space: '0x7eC3D9a27F89f52FAEa2C9cCC8dFBBA1A0c6a239',
      name: 'Test',
      type: 'ADD_EDIT',
      creator: '',
      ops: [],
    };

    const proposals = getProposalsForSpaceIds(spacesCreated, [processedProposal]);
    expect(proposals).not.toContain(processedProposal);
  });
});
