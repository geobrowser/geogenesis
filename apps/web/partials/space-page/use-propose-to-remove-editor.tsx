'use client';

import { createMembershipProposal, getRemoveEditorArguments } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { getAddress } from 'viem';

import { useConfig } from 'wagmi';
import { simulateContract, writeContract } from 'wagmi/actions';

import { Services } from '~/core/services';

export function useProposeToRemoveEditor(votingPluginAddress: string | null) {
  const { storageClient } = Services.useServices();
  const walletConfig = useConfig();

  // @TODO(baiirun): What should this API look like in the SDK?
  const write = async (editorToRemove: string) => {
    if (!votingPluginAddress) {
      return null;
    }

    const membershipProposalMetadata = createMembershipProposal({
      name: 'Remove editor request',
      type: 'REMOVE_EDITOR',
      userAddress: getAddress(editorToRemove),
    });

    const hash = await storageClient.uploadObject(membershipProposalMetadata);
    const uri = `ipfs://${hash}` as const;

    const config = await simulateContract(walletConfig, {
      address: votingPluginAddress as `0x${string}`,
      abi: MainVotingAbi,
      functionName: 'createProposal',
      // @TODO: We should abstract the proposal metadata creation and the proposal
      // action callback args together somehow since right now you have to sync
      // them both and ensure you're using the correct functions for each content
      // proposal type.
      //
      // What can happen is that you create a "CONTENT" proposal but pass a callback
      // action that does some other action like "ADD_SUBSPACE" and it will fail since
      // the substream won't index a mismatched proposal type and action callback args.
      // args: getProcessGeoProposalArguments(TEST_SPACE_PLUGIN_ADDRESS, uri),
      // args: getAcceptSubspaceArguments({
      //   spacePluginAddress: TEST_SPACE_PLUGIN_ADDRESS,
      //   ipfsUri: uri,
      //   subspaceToAccept: '0x170b749413328ac9a94762031a7A05b00c1D2e34', // Root
      // }),
      args: getRemoveEditorArguments({
        editorAddress: getAddress(editorToRemove),
        ipfsUri: uri,
        votingPluginAddress: votingPluginAddress as `0x${string}`,
      }),
    });

    const writer = await writeContract(walletConfig, config.request);
    return writer;
  };

  return {
    proposeToRemoveEditor: write,
  };
}
