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
import { readContract, simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';

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
};

export async function makeProposal({
  storageClient,
  walletConfig,
  ops,
  onChangePublishState,
  space,
  name,
}: MakeProposalOptions) {
  onChangePublishState('publishing-ipfs');
  const maybeSpace = await fetchSpace({ id: space });

  if (!maybeSpace || !maybeSpace.mainVotingPluginAddress) {
    return;
  }

  const uploadEffect = Effect.retry(
    Effect.tryPromise({
      try: async () => {
        const proposal = createEditProposal({ name, ops, author: walletConfig.account.address });
        return await storageClient.uploadBinary(proposal);
      },
      catch: error => new IpfsUploadError(`IPFS upload failed: ${error}`),
    }),
    Schedule.exponential('100 millis').pipe(Schedule.jittered)
  );

  const prepareTxEffect = Effect.gen(function* (_) {
    const cidString = yield* _(uploadEffect);

    if (!cidString.startsWith('ipfs://Qm')) {
      return yield* _(
        Effect.fail(
          new InvalidIpfsQmHashError('Failure when uploading content to IPFS. Did not recieve valid Qm hash.')
        )
      );
    }

    return yield* _(
      Effect.tryPromise({
        try: () =>
          prepareWriteContract({
            walletClient: wallet,
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
      })
    );
  });

  const writeTxEffect = Effect.gen(function* (awaited) {
    const contractConfig = yield* awaited(prepareTxEffect);

    onChangePublishState('signing-wallet');

    return yield* awaited(
      Effect.tryPromise({
        try: () => writeContract(walletConfig, contractConfig.request),
        catch: error => new TransactionWriteFailedError(`Publish failed: ${error}`),
      })
    );
  });

  const publishProgram = Effect.gen(function* (awaited) {
    const writeTxHash = yield* awaited(writeTxEffect);

    console.log('Transaction hash: ', writeTxHash);
    onChangePublishState('publishing-contract');

    const waitForTransactionEffect = yield* awaited(
      Effect.tryPromise({
        try: () =>
          waitForTransactionReceipt(walletConfig, {
            hash: writeTxHash,
          }),
        catch: error => new WaitForTransactionBlockError(`Error while waiting for transaction block: ${error}`),
      })
    );

    if (waitForTransactionEffect.status !== 'success') {
      return yield* awaited(
        Effect.fail(
          new TransactionRevertedError(`Transaction reverted:
      hash: ${waitForTransactionEffect.transactionHash}
      status: ${waitForTransactionEffect.status}
      blockNumber: ${waitForTransactionEffect.blockNumber}
      blockHash: ${waitForTransactionEffect.blockHash}
      ${JSON.stringify(waitForTransactionEffect)}
      `)
        )
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

export async function registerGeoProfile(wallet: WalletClient, spaceId: `0x${string}`): Promise<string> {
  const contractConfig = await prepareWriteContract({
    abi: ProfileRegistryAbi,
    address: SYSTEM_IDS.PROFILE_REGISTRY_ADDRESS,
    functionName: 'registerGeoProfile',
    args: [spaceId],
  });

  const txHash = await writeContract(walletConfig, request);
  const waited = await waitForTransactionReceipt(walletConfig, {
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
  wallet: GetWalletClientResult | undefined;
  storageClient: IStorageClient;
  // @TODO: Handle adding subspace for spaces with different governance types
  mainVotingPluginAddress: string | null;
  spacePluginAddress: string;
  subspaceAddress: string;
}

// @TODO: Effectify with error handling and UI states
export async function proposeAddSubspace({
  wallet,
  storageClient,
  spacePluginAddress,
  mainVotingPluginAddress,
  subspaceAddress,
}: ProposeAddSubspaceArgs) {
  // @TODO: Handle adding subspace for spaces with different governance types
  if (!wallet || !mainVotingPluginAddress) {
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
  const config = await simulateContract(wallet, {
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

  const writeResult = await writeContract(config);
  console.log('writeResult', writeResult);
}

// @TODO: Effectify with error handling and UI states
export async function proposeRemoveSubspace({
  wallet,
  storageClient,
  spacePluginAddress,
  mainVotingPluginAddress,
  subspaceAddress,
}: ProposeAddSubspaceArgs) {
  // @TODO: Handle adding subspace for spaces with different governance types
  if (!wallet || !mainVotingPluginAddress) {
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
  const config = await simulateContract(wallet, {
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

  const writeResult = await writeContract(wallet, config);
  console.log('writeResult', writeResult);
}
