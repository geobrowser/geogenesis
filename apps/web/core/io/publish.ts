import { Root } from '@geogenesis/action-schema';
import { SpaceAbi } from '@geogenesis/contracts';
import { parseGwei } from 'viem';

import { WalletClient } from 'wagmi';
import { prepareWriteContract, writeContract } from 'wagmi/actions';

import { Action, ReviewState } from '../types';
import { IStorageClient } from './storage';

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

export type PublishOptions = {
  wallet: WalletClient;
  actions: Action[];
  space: string;
  onChangePublishState: (newState: ReviewState) => void;
  name: string;
  storageClient: IStorageClient;
};

export const publish = async ({
  storageClient,
  actions,
  wallet,
  onChangePublishState,
  space,
  name,
}: PublishOptions): Promise<void> => {
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

  let maxFee = 400;
  let maxPriorityFee = 80;

  // Sometimes responses from the gas station fail or the API values/endpoint changes. We provide
  // fallback values in case there are issues fetching the realtime estimates.
  try {
    const gasResponse = await fetch('https://gasstation.polygon.technology/v2');

    const gasSuggestion: {
      fast: {
        maxPriorityFee: number;
        maxFee: number;
      };
    } = await gasResponse.json();

    maxFee = gasSuggestion.fast.maxFee;
    maxPriorityFee = gasSuggestion.fast.maxPriorityFee;
  } catch (e) {
    console.log(`Unable to fetch gas suggestions. Using defaults maxFee of ${400} and maxPriorityFee of ${80}. ${e}`);
  }

  const maxFeeAsGWei = parseGwei(maxFee.toString());
  const maxPriorityFeeAsGWei = parseGwei(maxPriorityFee.toString());

  console.log('maxFeeAsGWei', maxFeeAsGWei);
  console.log('maxPriorityFeeAsGWei', maxPriorityFeeAsGWei);

  const contractConfig = await prepareWriteContract({
    abi: SpaceAbi,
    address: space as unknown as `0x${string}`,
    functionName: 'addEntries',
    walletClient: wallet,
    args: [cids],
    maxFeePerGas: maxFeeAsGWei,
    maxPriorityFeePerGas: maxPriorityFeeAsGWei,
  });

  console.log('after prepareWriteContract');
  onChangePublishState('signing-wallet');

  const tx = await writeContract(contractConfig);
  onChangePublishState('publishing-contract');

  console.log(`Transaction receipt: ${JSON.stringify(tx.hash)}`);
};

export const uploadFile = async (storageClient: IStorageClient, file: File): Promise<string> => {
  const fileUri = await storageClient.uploadFile(file);
  return fileUri;
};
