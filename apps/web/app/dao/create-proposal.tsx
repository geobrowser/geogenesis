'use client';

import { SYSTEM_IDS } from '@geogenesis/ids';
import {
  createContentProposal,
  createGeoId,
  getAcceptSubspaceArguments,
  getProcessGeoProposalArguments,
} from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';

import { useWalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { ZERO_ADDRESS } from '~/core/constants';
import { Services } from '~/core/services';

import { Button } from '~/design-system/button';

import { TEST_MAIN_VOTING_PLUGIN_ADDRESS, TEST_SPACE_PLUGIN_ADDRESS } from './constants';

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
// 1. Create the proposal metadata for content (DONE)
// 2. Create the proposal metadata for a subspace
//    - Add subspace (DONE)
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
    const proposal = createContentProposal('Content proposal with viem + encodeFunctionData', [
      {
        entityId: createGeoId(),
        attributeId: SYSTEM_IDS.NAME,
        type: 'createTriple',
        value: {
          type: 'string',
          id: createGeoId(),
          value: 'Content proposal with viem + encodeFunctionData',
        },
      },
    ]);

    const hash = await storageClient.uploadObject(proposal);
    const uri = `ipfs://${hash}` as const;

    const config = await prepareWriteContract({
      walletClient: wallet,
      address: TEST_MAIN_VOTING_PLUGIN_ADDRESS,
      abi: MainVotingAbi,
      functionName: 'createProposal',
      // @TODO: We should abstract the proposal metadata creation and the proposal
      // action callback args together somehow since right now you have to sync
      // them both and ensure you're using the correct functions for each content
      // proposal type.
      // args: getProcessGeoProposalArguments(TEST_SPACE_PLUGIN_ADDRESS, uri),
      args: getAcceptSubspaceArguments(TEST_SPACE_PLUGIN_ADDRESS, uri, ZERO_ADDRESS),
    });

    const writeResult = await writeContract(config);
    console.log('writeResult', writeResult);
  };

  return <Button onClick={onClick}>Create proposal</Button>;
}
