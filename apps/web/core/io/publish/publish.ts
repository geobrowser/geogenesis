import { Root } from '@geogenesis/action-schema';
import { GeoProfileRegistryAbi, SpaceAbi } from '@geogenesis/contracts';
import { SYSTEM_IDS } from '@geogenesis/ids';
import * as Effect from 'effect/Effect';

import { WalletClient } from 'wagmi';
import { prepareWriteContract, readContract, waitForTransaction, writeContract } from 'wagmi/actions';

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
  const ipfsEffect = Effect.gen(function* (_) {
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

      const cidString = yield* _(
        Effect.tryPromise({
          try: () => storageClient.uploadObject(root),
          catch: error => new IpfsUploadError(String(error)),
        })
      );

      if (!cidString.startsWith('Qm')) {
        return yield* _(
          Effect.fail(
            new InvalidIpfsQmHashError('Failure when uploading content to IPFS. Did not recieve valid Qm hash.')
          )
        );
      }

      cids.push(`ipfs://${cidString}`);
    }

    return cids;
  });

  const prepareTxEffect = (cids: string[]) =>
    Effect.tryPromise({
      try: () =>
        prepareWriteContract({
          abi: SpaceAbi,
          address: space as unknown as `0x${string}`,
          functionName: 'addEntries',
          walletClient: wallet,
          args: [cids],
        }),
      catch: error => new TransactionPrepareFailedError(`Transaction prepare failed: ${error}`),
    });

  const writeTxEffect = Effect.gen(function* (awaited) {
    const cids = yield* awaited(ipfsEffect);

    if (cids.some(cid => !cid.startsWith('ipfs://Qm'))) {
      return yield* awaited(
        Effect.fail(
          new InvalidIpfsQmHashError('Failure when uploading content to IPFS. Did not recieve valid Qm hash.')
        )
      );
    }

    const contractConfig = yield* awaited(prepareTxEffect(cids));

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
