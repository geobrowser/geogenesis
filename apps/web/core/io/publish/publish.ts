import { GeoProfileRegistryAbi, SpaceAbi } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import {
  createContentProposal,
  createSubspaceProposal,
  getAcceptSubspaceArguments,
  getProcessGeoProposalArguments,
  getRemoveSubspaceArguments,
} from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import * as Effect from 'effect/Effect';

import { WalletClient } from 'wagmi';
import {
  GetWalletClientResult,
  prepareWriteContract,
  readContract,
  waitForTransaction,
  writeContract,
} from 'wagmi/actions';

import { Action, ReviewState } from '../../types';
import { Storage } from '../storage';
import { IStorageClient } from '../storage/storage';
import { fetchSpace } from '../subgraph';

function getActionFromChangeStatus(action: Action) {
  switch (action.type) {
    case 'createTriple':
    case 'deleteTriple':
      return [action];
    case 'editTriple':
      return [action.before, action.after];
  }
}

export class TransactionRevertedError extends Error {
  readonly _tag = 'TransactionRevertedError';
}

export class WaitForTransactionBlockError extends Error {
  readonly _tag = 'WaitForTransactionBlockError';
}

export class TransactionPrepareFailedError extends Error {
  _tag = 'TransactionPrepareFailedError';
}

export class TransactionWriteFailedError extends Error {
  _tag = 'TransactionWriteFailedError';
}

export type MakeProposalOptions = {
  wallet: WalletClient;
  actions: Action[];
  space: string;
  onChangePublishState: (newState: ReviewState) => void;
  name: string;
  storageClient: Storage.IStorageClient;
};

export async function makeProposal({
  storageClient,
  actions,
  wallet,
  onChangePublishState,
  space,
  name,
}: MakeProposalOptions): Promise<void> {
  onChangePublishState('publishing-ipfs');
  const cids: string[] = [];

  const maybeSpace = await fetchSpace({ id: space });

  if (!maybeSpace || !maybeSpace.mainVotingPluginAddress) {
    return;
  }

  const proposal = createContentProposal(name, actions.flatMap(getActionFromChangeStatus));
  const cidString = await storageClient.uploadObject(proposal);

  const prepareTxEffect = Effect.tryPromise({
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
  });

  const writeTxEffect = Effect.gen(function* (awaited) {
    const contractConfig = yield* awaited(prepareTxEffect);

    onChangePublishState('signing-wallet');

    return yield* awaited(
      Effect.tryPromise({
        try: () => writeContract(contractConfig),
        catch: error => new TransactionWriteFailedError(`Publish failed: ${error}`),
      })
    );
  });

  const publishProgram = Effect.gen(function* (awaited) {
    const writeTxResult = yield* awaited(writeTxEffect);

    console.log('Transaction hash: ', writeTxResult.hash);
    onChangePublishState('publishing-contract');

    const waitForTransactionEffect = yield* awaited(
      Effect.tryPromise({
        try: () =>
          waitForTransaction({
            hash: writeTxResult.hash,
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

export async function uploadFile(storageClient: Storage.IStorageClient, file: File): Promise<string> {
  const fileUri = await storageClient.uploadFile(file);
  return fileUri;
}

export async function getRole(spaceId: string, role: 'EDITOR_ROLE' | 'ADMIN_ROLE' | 'EDITOR_CONTROLLER_ROLE') {
  const data = (await readContract({
    abi: SpaceAbi,
    address: spaceId as unknown as `0x${string}`,
    functionName: role,
  })) as string;

  return data;
}

export async function grantRole({
  spaceId,
  wallet,
  role,
  userAddress,
}: {
  spaceId: string;
  wallet: WalletClient;
  role: string;
  userAddress: string;
}) {
  const contractConfig = await prepareWriteContract({
    abi: SpaceAbi,
    address: spaceId as unknown as `0x${string}`,
    functionName: 'grantRole',
    walletClient: wallet,
    args: [role, userAddress],
  });

  const tx = await writeContract(contractConfig);
  console.log(`Role granted to ${userAddress}. Transaction hash: ${tx.hash}`);
  return tx.hash;
}

export async function revokeRole({
  spaceId,
  wallet,
  role,
  userAddress,
}: {
  spaceId: string;
  wallet: WalletClient;
  role: string;
  userAddress: string;
}) {
  const contractConfig = await prepareWriteContract({
    abi: SpaceAbi,
    address: spaceId as unknown as `0x${string}`,
    functionName: 'revokeRole',
    walletClient: wallet,
    args: [role, userAddress],
  });

  const tx = await writeContract(contractConfig);
  console.log(`Role revoked from ${userAddress}. Transaction hash: ${tx.hash}`);
  return tx.hash;
}

export async function registerGeoProfile(wallet: WalletClient, spaceId: `0x${string}`): Promise<string> {
  const contractConfig = await prepareWriteContract({
    abi: GeoProfileRegistryAbi,
    address: SYSTEM_IDS.PROFILE_REGISTRY_ADDRESS,
    functionName: 'registerGeoProfile',
    walletClient: wallet,
    args: [spaceId],
  });

  const tx = await writeContract(contractConfig);
  const waited = await waitForTransaction({
    hash: tx.hash,
  });

  console.log(`Geo profile created. Transaction hash: ${waited.transactionHash}`);
  return contractConfig.result as string;
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
  const config = await prepareWriteContract({
    walletClient: wallet,
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
  const config = await prepareWriteContract({
    walletClient: wallet,
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

  const writeResult = await writeContract(config);
  console.log('writeResult', writeResult);
}
