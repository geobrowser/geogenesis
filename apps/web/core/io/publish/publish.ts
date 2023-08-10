import { Root } from '@geogenesis/action-schema';
import { SpaceAbi } from '@geogenesis/contracts';

import { WalletClient } from 'wagmi';
import { prepareWriteContract, readContract, waitForTransaction, writeContract } from 'wagmi/actions';

import { Action, ReviewState } from '../../types';
import { Storage } from '../storage';

const UPLOAD_CHUNK_SIZE = 2000;

function getActionFromChangeStatus(action: Action) {
  switch (action.type) {
    case 'createTriple':
    case 'deleteTriple':
      return [action];
    case 'editTriple':
      return [action.before, action.after];
  }
}

export class TransactionFailedError extends Error {
  readonly _tag = 'TransactionFailedError';
}

export class PublishFailedError extends Error {
  _tag = 'PublishFailedError';
}

export type PublishOptions = {
  wallet: WalletClient;
  actions: Action[];
  space: string;
  onChangePublishState: (newState: ReviewState) => void;
  name: string;
  storageClient: Storage.IStorageClient;
};

export async function publish({
  storageClient,
  actions,
  wallet,
  onChangePublishState,
  space,
  name,
}: PublishOptions): Promise<void> {
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

  try {
    const contractConfig = await prepareWriteContract({
      abi: SpaceAbi,
      address: space as unknown as `0x${string}`,
      functionName: 'addEntries',
      walletClient: wallet,
      args: [cids],
    });

    onChangePublishState('signing-wallet');
    const tx = await writeContract(contractConfig);
    console.log('Transaction hash: ', tx.hash);

    onChangePublishState('publishing-contract');
    const transaction = await waitForTransaction({
      hash: tx.hash,
    });

    if (transaction.status !== 'success') {
      throw new TransactionFailedError(`Transaction failed: 
    hash: ${transaction.transactionHash}
    status: ${transaction.status}
    blockNumber: ${transaction.blockNumber}
    blockHash: ${transaction.blockHash}
    ${JSON.stringify(transaction)}
    `);
    }

    console.log(`Transaction receipt: 
  hash: ${transaction.transactionHash}
  status: ${transaction.status}
  blockNumber: ${transaction.blockNumber}
  blockHash: ${transaction.blockHash}
  `);
  } catch (e) {
    console.error(`Publish failed: ${e}`);
    throw new PublishFailedError(`Publish failed: ${e}`);
  }
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
