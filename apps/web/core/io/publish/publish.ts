import { SYSTEM_IDS } from '@geogenesis/sdk';
import { createSubspaceProposal, getAcceptSubspaceArguments, getRemoveSubspaceArguments } from '@geogenesis/sdk';
import { MainVotingAbi, ProfileRegistryAbi } from '@geogenesis/sdk/abis';

import { Config } from 'wagmi';
import { simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';

import { Storage } from '../storage';
import { IStorageClient } from '../storage/storage';

// @TODO: useRegisterGeoProfile
export async function registerGeoProfile(config: Config, spaceId: `0x${string}`): Promise<string> {
  const contractConfig = await simulateContract(config, {
    abi: ProfileRegistryAbi,
    address: SYSTEM_IDS.PROFILE_REGISTRY_ADDRESS,
    functionName: 'registerGeoProfile',
    args: [spaceId],
  });

  const txHash = await writeContract(config, contractConfig.request);
  const waited = await waitForTransactionReceipt(config, {
    hash: txHash,
  });

  console.log(`Geo profile created. Transaction hash: ${waited.transactionHash}`);
  // @TODO: Test that this is correct
  return contractConfig.result.toString();
}

export async function uploadFile(storageClient: Storage.IStorageClient, file: File): Promise<string> {
  const fileUri = await storageClient.uploadFile(file);
  return fileUri;
}

interface ProposeAddSubspaceArgs {
  config: Config;
  storageClient: IStorageClient;
  // @TODO: Handle adding subspace for spaces with different governance types
  mainVotingPluginAddress: string | null;
  spacePluginAddress: string;
  subspaceAddress: string;
}

// @TODO:
// Effectify with error handling and UI states
// useProposeAddSubspace
export async function proposeAddSubspace({
  config,
  storageClient,
  spacePluginAddress,
  mainVotingPluginAddress,
  subspaceAddress,
}: ProposeAddSubspaceArgs) {
  // @TODO: Handle adding subspace for spaces with different governance types
  if (!mainVotingPluginAddress) {
    return;
  }

  const proposal = createSubspaceProposal({
    name: 'Add subspace',
    type: 'ADD_SUBSPACE',
    spaceAddress: subspaceAddress as `0x${string}`, // Some governance space
  });

  const hash = await storageClient.uploadObject(proposal);
  const uri = `ipfs://${hash}` as const;

  // @TODO: This will call different functions depending on the type of space we're
  // in. Additionally, we'll have wrappers for encoding the args that we can call
  // directly onchain.
  const contractConfig = await simulateContract(config, {
    address: mainVotingPluginAddress as `0x${string}`,
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
    args: getAcceptSubspaceArguments({
      spacePluginAddress: spacePluginAddress as `0x${string}`,
      ipfsUri: uri,
      subspaceToAccept: subspaceAddress as `0x${string}`, // Root
    }),
  });

  const writeResult = await writeContract(config, contractConfig.request);
  console.log('writeResult', writeResult);
}

// @TODO:
// Effectify with error handling and UI states
// useProposeAddSubspace
export async function proposeRemoveSubspace({
  config,
  storageClient,
  spacePluginAddress,
  mainVotingPluginAddress,
  subspaceAddress,
}: ProposeAddSubspaceArgs) {
  // @TODO: Handle adding subspace for spaces with different governance types
  if (!mainVotingPluginAddress) {
    return;
  }

  const proposal = createSubspaceProposal({
    name: 'Remove subspace',
    type: 'REMOVE_SUBSPACE',
    spaceAddress: subspaceAddress as `0x${string}`, // Some governance space
  });

  const hash = await storageClient.uploadObject(proposal);
  const uri = `ipfs://${hash}` as const;

  // @TODO: This will call different functions depending on the type of space we're
  // in. Additionally, we'll have wrappers for encoding the args that we can call
  // directly onchain.
  const contractConfig = await simulateContract(config, {
    address: mainVotingPluginAddress as `0x${string}`,
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
    args: getRemoveSubspaceArguments({
      spacePluginAddress: spacePluginAddress as `0x${string}`,
      ipfsUri: uri,
      subspaceToAccept: subspaceAddress as `0x${string}`, // Root
    }),
  });

  const writeResult = await writeContract(config, contractConfig.request);
  console.log('writeResult', writeResult);
}
