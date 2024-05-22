import { Root } from '@geogenesis/action-schema';
import { SpaceAbi } from '@geogenesis/contracts';
import { Schedule } from 'effect';
import * as Effect from 'effect/Effect';
import { PrivateKeyAccount, PublicClient, WalletClient } from 'viem';

import { UPLOAD_CHUNK_SIZE } from '~/core/constants';
import { Storage } from '~/core/io';
import { Action } from '~/core/types';

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

export class IpfsUploadFailedError extends Error {
  readonly _tag = 'IpfsUploadFailedError';
}

export class InvalidIpfsQmHashError extends Error {
  readonly _tag = 'InvalidIpfsQmHashError';
}

export type MakeProposalServerOptions = {
  account: PrivateKeyAccount;
  publicClient: PublicClient;
  wallet: WalletClient;
  actions: Action[];
  space: string;
  name: string;
  storageClient: Storage.IStorageClient;
};

export async function makeProposalServer({
  account,
  actions,
  wallet,
  space,
  name,
  storageClient,
  publicClient,
}: MakeProposalServerOptions) {
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

    const uploadEffect = Effect.retry(
      Effect.tryPromise({
        try: async () => {
          const cidString = await storageClient.uploadObject(root);
          if (!cidString.startsWith('Qm')) {
            throw new InvalidIpfsQmHashError('Failure when uploading content to IPFS. Did not recieve valid Qm hash.');
          }

          return cidString;
        },
        catch: error => new IpfsUploadFailedError(`IPFS upload failed: ${error}`),
      }),
      Schedule.exponential('100 millis').pipe(Schedule.jittered)
    );

    const cidString = await Effect.runPromise(uploadEffect);
    cids.push(`ipfs://${cidString}`);
  }

  const prepareTxEffect = Effect.tryPromise({
    try: () =>
      publicClient.simulateContract({
        account,
        abi: SpaceAbi,
        address: space as `0x${string}`,
        functionName: 'addEntries',
        args: [cids],
      }),
    catch: error => new TransactionPrepareFailedError(`Transaction prepare failed: ${error}`),
  });

  const writeTxEffect = Effect.gen(function* (awaited) {
    const contractConfig = yield* awaited(
      Effect.retry(prepareTxEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered))
    );

    return yield* awaited(
      Effect.retry(
        Effect.tryPromise({
          try: () => wallet.writeContract(contractConfig.request),
          catch: error => new TransactionWriteFailedError(`Publish failed: ${error}`),
        }),
        Schedule.exponential('100 millis').pipe(Schedule.jittered)
      )
    );
  });

  const publishProgram = Effect.gen(function* (awaited) {
    const writeTxHash = yield* awaited(
      Effect.retry(writeTxEffect, Schedule.exponential('100 millis').pipe(Schedule.jittered))
    );

    const waitForTransactionEffect = yield* awaited(
      Effect.tryPromise({
        try: () =>
          publicClient.waitForTransactionReceipt({
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

  return publishProgram;
}
