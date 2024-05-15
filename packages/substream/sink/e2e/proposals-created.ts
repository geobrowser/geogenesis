import { Effect } from 'effect';
import fs from 'fs';

import { mapIpfsProposalToSchemaProposalByType } from '../events/proposals-created/map-proposals';
import { type EditProposal, type Op } from '../events/proposals-created/parser';
import { Decoder } from '../proto';
import type { BlockEvent } from '../types';

const mockBlock: BlockEvent = {
  blockNumber: 0,
  cursor: '',
  requestId: '-1',
  timestamp: 0,
};

const mockProposal = {
  metadataUri: '',
  startTime: '',
  endTime: '',
  onchainProposalId: '-1',
  pluginAddress: '',
  creator: '',
  space: '',
};

function create() {
  return Effect.gen(function* (_) {
    const edit = yield* _(Decoder.decodeEdit(fs.readFileSync('data-2-with-new-schema.pb')));

    if (!edit) return;

    const editProposal: EditProposal = {
      type: 'EDIT',
      name: edit.name ?? null,
      proposalId: '',
      // @TODO: Figure out these types
      ops: edit.ops as Op[],

      // These would be derived from the onchain proposal and substream
      metadataUri: mockProposal.metadataUri,
      startTime: mockProposal.startTime,
      endTime: mockProposal.endTime,
      onchainProposalId: mockProposal.onchainProposalId,
      pluginAddress: mockProposal.pluginAddress,
      creator: mockProposal.creator,
      space: mockProposal.space,
    };

    const { schemaEditProposals } = mapIpfsProposalToSchemaProposalByType([editProposal], mockBlock);

    console.log('schema edit proposals', schemaEditProposals.proposals);
  });
}

Effect.runSync(create());
