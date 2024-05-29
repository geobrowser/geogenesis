import { Op, getProcessGeoProposalArguments } from '@geogenesis/sdk';
import { MainVotingAbi } from '@geogenesis/sdk/abis';
import { createEditProposal } from '@geogenesis/sdk/proto';
import { Schedule } from 'effect';
import * as Effect from 'effect/Effect';
import { PrivateKeyAccount, PublicClient, WalletClient } from 'viem';

import { Storage } from '~/core/io';
import { fetchSpace } from '~/core/io/subgraph';

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
  ops: Op[];
  space: string;
  name: string;
  storageClient: Storage.IStorageClient;
};

export async function makeProposalServer({
  account,
  ops,
  wallet,
  space,
  name,
  storageClient,
  publicClient,
}: MakeProposalServerOptions) {
  const maybeSpace = await fetchSpace({ id: space });

  if (!maybeSpace || !maybeSpace.mainVotingPluginAddress) {
    return Effect.succeed(undefined);
  }

  const proposal = createEditProposal({ name, ops, author: account.address });
  const cidString = await storageClient.uploadObject(proposal);

  const prepareTxEffect = Effect.tryPromise({
    try: () =>
      publicClient.simulateContract({
        account,
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
