'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import { type ContentProposalMetadata, VoteOption } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { SpacePlugin, SpacePlugin__factory } from '@geogenesis/sdk/types';
import { encodeAbiParameters, stringToHex } from 'viem';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { ZERO_ADDRESS } from '~/core/constants';
import { ID } from '~/core/id';
import { Services } from '~/core/services';

import { Button } from '~/design-system/button';

import { TEST_DAO_ADDRESS, TEST_MAIN_VOTING_PLUGIN_ADDRESS, TEST_SPACE_PLUGIN_ADDRESS } from './constants';

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

const acceptSubspaceInputs = [
  {
    internalType: 'address',
    name: '_dao',
    type: 'address',
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

  const { data: wallet } = useWalletClient();

  if (!wallet) {
    return <div>Loading wallet...</div>;
  }

  const onClick = async () => {
    const proposal: ContentProposalMetadata = {
      type: 'content',
      version: '1.0.0',
      proposalId: ID.createEntityId(),
      name: 'Proposal with failure bitmap and space plugin as action target using typechain encoding',
      actions: [
        {
          entityId: ID.createEntityId(),
          attributeId: SYSTEM_IDS.NAME,
          type: 'createTriple',
          value: {
            type: 'string',
            id: ID.createValueId(),
            value: 'Subspace proposal using typechain encoding',
          },
        },
      ],
    };

    const hash = await storageClient.uploadObject(proposal);
    const uri = `ipfs://${hash}`;

    const config = await prepareWriteContract({
      walletClient: wallet,
      address: TEST_MAIN_VOTING_PLUGIN_ADDRESS,
      abi: MainVotingAbi,
      functionName: 'createProposal',
      args: [
        stringToHex(uri),
        [
          {
            to: TEST_SPACE_PLUGIN_ADDRESS,
            value: BigInt(0),
            data: SpacePlugin__factory.createInterface().encodeFunctionData('acceptSubspace', [
              '0x1a39e2fe299ef8f855ce43abf7ac85d6e69e05f5',
            ]) as `0x${string}`,
          },
        ],
        BigInt(0),
        BigInt(0),
        BigInt(0),
        VoteOption.Yes,
        true,
      ],
    });

    const writeResult = await writeContract(config);
    console.log('writeResult', writeResult);
  };

  return <Button onClick={onClick}>Create proposal</Button>;
}
