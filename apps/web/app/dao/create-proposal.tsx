'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { type ContentProposalMetadata, VoteOption } from '@geogenesis/sdk';
import { encodeAbiParameters, stringToHex } from 'viem';

import { useConfig, useWalletClient } from 'wagmi';
import { simulateContract, writeContract } from 'wagmi/actions';

import { ID } from '~/core/id';
import { Services } from '~/core/services';

import { Button } from '~/design-system/button';

import { TEST_MAIN_VOTING_PLUGIN_ADDRESS, TEST_SPACE_PLUGIN_ADDRESS } from './constants';
import { abi } from './main-voting-abi';

const processProposalInputs = [
  {
    internalType: 'uint32',
    name: '_blockIndex',
    type: 'uint32',
  },
  {
    internalType: 'uint32',
    name: '_itemIndex',
    type: 'uint32',
  },
  {
    internalType: 'string',
    name: '_contentUri',
    type: 'string',
  },
] as const;

interface Props {
  type:
    | 'content'
    | 'add-member'
    | 'remove-member'
    | 'add-editor'
    | 'remove-editor'
    | 'add-subspace'
    | 'remove-subspace';
}

// @TODO: Add metadata to ipfs. this will include the root object. If the proposal is not a content proposal it will use
// a new type of metadata object that has the proposal type and version object
// 1. Create the proposal metadata for content
// 2. Create the proposal metadata for a subspace
//    - Add subspace
//    - Remove subspace
// 3. Create the proposal metadata for a member
//    - Add member
//    - Remove member
// 4. Create the proposal metadata for an editor
//    - Add editor
//    - Remove editor
// 5. Create action for processing a content proposal
// 6. Create action for processing a subspace proposal
//    - Add subspace
//    - Remove subspace
// 7. Create action for processing a member proposal
//    - Add member
//    - Remove member
// 8. Create action for processing an editor proposal
//    - Add editor
//    - Remove editor
export function CreateProposal({ type }: Props) {
  const { storageClient } = Services.useServices();

  const walletConfig = useConfig();
  const { data: wallet } = useWalletClient();

  if (!wallet) {
    return <div>Loading wallet...</div>;
  }

  const onClick = async () => {
    const proposal: ContentProposalMetadata = {
      type: 'content',
      version: '1.0.0',
      proposalId: ID.createEntityId(),
      name: 'Sixth proposal in the DAO',
      actions: [
        {
          entityId: ID.createEntityId(),
          attributeId: SYSTEM_IDS.NAME,
          type: 'createTriple',
          value: {
            type: 'string',
            id: ID.createValueId(),
            value: 'Fifth entity',
          },
        },
      ],
    };

    const hash = await storageClient.uploadObject(proposal);
    const uri = `ipfs://${hash}`;

    const config = await simulateContract(walletConfig, {
      // Main voting plugin address for DAO at 0xd9abC01d1AEc200FC394C2717d7E14348dC23792
      address: TEST_MAIN_VOTING_PLUGIN_ADDRESS,
      abi,
      functionName: 'createProposal',
      args: [
        stringToHex(uri),
        [
          {
            // Space plugin address for DAO at 0xd9abC01d1AEc200FC394C2717d7E14348dC23792
            to: TEST_SPACE_PLUGIN_ADDRESS,
            value: BigInt(0),
            data: encodeAbiParameters(processProposalInputs, [1, 2, uri]),
          },
        ],
        BigInt(0),
        BigInt(0),
        BigInt(0),
        VoteOption.Yes,
        true,
      ],
    });

    const writeResult = await writeContract(walletConfig, config.request);
    console.log('writeResult', writeResult);
  };

  return <Button onClick={onClick}>Create proposal</Button>;
}
