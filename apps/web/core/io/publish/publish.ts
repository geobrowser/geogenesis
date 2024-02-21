import { Root } from '@geogenesis/action-schema';
import { GeoProfileRegistryAbi, SpaceAbi } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';
import { WalletClient } from 'viem';

import { Config } from 'wagmi';
import { readContract, simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';

import { UPLOAD_CHUNK_SIZE } from '~/core/constants';

import { Action, ReviewState } from '../../types';
import { Storage } from '../storage';

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
  walletConfig: Config;
  actions: Action[];
  space: string;
  onChangePublishState: (newState: ReviewState) => void;
  name: string;
  storageClient: Storage.IStorageClient;
};

export async function makeProposal({
  storageClient,
  actions,
  walletConfig,
  onChangePublishState,
  space,
  name,
}: MakeProposalOptions): Promise<void> {
  onChangePublishState('publishing-ipfs');
  const cids: string[] = [];

  for (let i = 0; i < actions.length; i += UPLOAD_CHUNK_SIZE) {
    console.log(`Publishing ${i / UPLOAD_CHUNK_SIZE}/${Math.ceil(actions.length / UPLOAD_CHUNK_SIZE)}`);

    const chunk = actions.slice(i, i + UPLOAD_CHUNK_SIZE);

    const root: Root = {
      type: 'root',
      version: '0.0.1',
      actions: chunk.flatMap(getActionFromChangeStatus),
      name,
    };

    const cidString = await storageClient.uploadObject(root);
    cids.push(`ipfs://${cidString}`);
  }

  const prepareTxEffect = Effect.tryPromise({
    try: () =>
      simulateContract(walletConfig, {
        abi: SpaceAbi,
        address: space as unknown as `0x${string}`,
        functionName: 'addEntries',
        args: [cids],
      }),
    catch: error => new TransactionPrepareFailedError(`Transaction prepare failed: ${error}`),
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

export async function uploadFile(storageClient: Storage.IStorageClient, file: File): Promise<string> {
  const fileUri = await storageClient.uploadFile(file);
  return fileUri;
}

export async function getRole(
  walletConfig: Config,
  spaceId: string,
  role: 'EDITOR_ROLE' | 'ADMIN_ROLE' | 'EDITOR_CONTROLLER_ROLE'
) {
  const data = (await readContract(walletConfig, {
    abi: SpaceAbi,
    address: spaceId as unknown as `0x${string}`,
    functionName: role,
  })) as string;

  return data;
}

export async function grantRole({
  spaceId,
  walletConfig,
  role,
  userAddress,
}: {
  spaceId: string;
  walletConfig: Config;
  role: string;
  userAddress: string;
}) {
  const { request } = await simulateContract(walletConfig, {
    abi: SpaceAbi,
    address: spaceId as unknown as `0x${string}`,
    functionName: 'grantRole',
    args: [role, userAddress],
  });

  const txHash = await writeContract(walletConfig, request);
  console.log(`Role granted to ${userAddress}. Transaction hash: ${txHash}`);
  return txHash;
}

export async function revokeRole({
  spaceId,
  walletConfig,
  role,
  userAddress,
}: {
  spaceId: string;
  walletConfig: Config;
  role: string;
  userAddress: string;
}) {
  const { request } = await simulateContract(walletConfig, {
    abi: SpaceAbi,
    address: spaceId as unknown as `0x${string}`,
    functionName: 'revokeRole',
    args: [role, userAddress],
  });

  const txHash = await writeContract(walletConfig, request);
  console.log(`Role revoked from ${userAddress}. Transaction hash: ${txHash}`);
  return txHash;
}

export async function registerGeoProfile(walletConfig: Config, spaceId: `0x${string}`): Promise<string> {
  const { request, result } = await simulateContract(walletConfig, {
    abi: GeoProfileRegistryAbi,
    address: SYSTEM_IDS.PROFILE_REGISTRY_ADDRESS,
    functionName: 'registerGeoProfile',
    args: [spaceId],
  });

  const txHash = await writeContract(walletConfig, request);
  const waited = await waitForTransactionReceipt(walletConfig, {
    hash: txHash,
  });

  console.log(`Geo profile created. Transaction hash: ${waited.transactionHash}`);
  return result as string;
}
