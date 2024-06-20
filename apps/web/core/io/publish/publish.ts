import { SYSTEM_IDS } from '@geogenesis/sdk';
import {
  Op,
  createSubspaceProposal,
  getAcceptSubspaceArguments,
  getProcessGeoProposalArguments,
  getRemoveSubspaceArguments,
} from '@geogenesis/sdk';
import { MainVotingAbi, ProfileRegistryAbi } from '@geogenesis/sdk/abis';
import { createEditProposal } from '@geogenesis/sdk/proto';
import { Schedule } from 'effect';
import * as Effect from 'effect/Effect';

import { Config } from 'wagmi';
import { simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';

import { ReviewState } from '../../types';
import { Storage } from '../storage';
import { IStorageClient } from '../storage/storage';
import { fetchSpace } from '../subgraph';

export class TransactionRevertedError extends Error {
  readonly _tag = 'TransactionRevertedError';
}

export class WaitForTransactionBlockError extends Error {
  readonly _tag = 'WaitForTransactionBlockError';
}

export class TransactionPrepareFailedError extends Error {
  readonly _tag = 'TransactionPrepareFailedError';
}

export class TransactionWriteFailedError extends Error {
  readonly _tag = 'TransactionWriteFailedError';
}

export class InvalidIpfsQmHashError extends Error {
  readonly _tag = 'InvalidIpfsQmHashError';
}

export class IpfsUploadError extends Error {
  readonly _tag = 'IpfsUploadError';
}

export type MakeProposalOptions = {
  walletConfig: Config;
  ops: Op[];
  space: string;
  onChangePublishState: (newState: ReviewState) => void;
  name: string;
  storageClient: Storage.IStorageClient;
  account: string;
};

export async function makeProposal({
  storageClient,
  walletConfig,
  ops,
  onChangePublishState,
  space,
  name,
  account,
}: MakeProposalOptions) {
  onChangePublishState('publishing-ipfs');
  const maybeSpace = await fetchSpace({ id: space });

  if (!maybeSpace || !maybeSpace.mainVotingPluginAddress) {
    return;
  }

  const uploadEffect = Effect.retry(
    Effect.tryPromise({
      try: async () => {
        const proposal = createEditProposal({ name, ops, author: account });
        return await storageClient.uploadBinary(proposal);
      },
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    }),
    Schedule.exponential('100 millis').pipe(Schedule.jittered)
  );

  const prepareTxEffect = Effect.gen(function* () {
    const cidString = yield* uploadEffect;

    if (!cidString.startsWith('ipfs://Qm')) {
      return yield* Effect.fail(
        new InvalidIpfsQmHashError('Failure when uploading content to IPFS. Did not recieve valid Qm hash.')
      );
    }

    return yield* Effect.tryPromise({
      try: () =>
        simulateContract(walletConfig, {
          address: maybeSpace.mainVotingPluginAddress as `0x${string}`,
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
          args: getProcessGeoProposalArguments(space as `0x${string}`, `ipfs://${cidString}`),
        }),
      catch: error => new TransactionPrepareFailedError(`Transaction prepare failed: ${error}`),
    });
  });

  const writeTxEffect = Effect.gen(function* () {
    const contractConfig = yield* prepareTxEffect;

    onChangePublishState('signing-wallet');

    // @TODO: Write transaction here should use the smart account shit we create in usePublish
    return yield* Effect.tryPromise({
      try: () => writeContract(walletConfig, contractConfig.request),
      catch: error => new TransactionWriteFailedError(`Publish failed: ${error}`),
    });
  });

  const publishProgram = Effect.gen(function* () {
    const writeTxHash = yield* writeTxEffect;

    console.log('Transaction hash: ', writeTxHash);
    onChangePublishState('publishing-contract');

    const waitForTransactionEffect = yield* Effect.tryPromise({
      try: () =>
        waitForTransactionReceipt(walletConfig, {
          hash: writeTxHash,
        }),
      catch: error => new WaitForTransactionBlockError(`Error while waiting for transaction block: ${error}`),
    });

    if (waitForTransactionEffect.status !== 'success') {
      return yield* Effect.fail(
        new TransactionRevertedError(`Transaction reverted:
      hash: ${waitForTransactionEffect.transactionHash}
      status: ${waitForTransactionEffect.status}
      blockNumber: ${waitForTransactionEffect.blockNumber}
      blockHash: ${waitForTransactionEffect.blockHash}
      ${JSON.stringify(waitForTransactionEffect)}
      `)
      );
    }

    console.log(`Transaction successful. Receipt:
    hash: ${waitForTransactionEffect.transactionHash}
    status: ${waitForTransactionEffect.status}
    blockNumber: ${waitForTransactionEffect.blockNumber}
    blockHash: ${waitForTransactionEffect.blockHash}
    `);
  });

  await Effect.runPromise(publishProgram);
}

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

// @TODO: Effectify with error handling and UI states
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

// @TODO: Effectify with error handling and UI states
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
