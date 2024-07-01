import { SYSTEM_IDS } from '@geogenesis/sdk';
import { ProfileRegistryAbi } from '@geogenesis/sdk/abis';

import { Config } from 'wagmi';
import { simulateContract, waitForTransactionReceipt, writeContract } from 'wagmi/actions';

import { Storage } from '../storage';

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
