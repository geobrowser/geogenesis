import { Config } from 'wagmi';

import { Storage } from '../storage';

export interface IPublish {
  uploadFile(storageClient: Storage.IStorageClient, file: File): Promise<string>;
  registerGeoProfile: (wallet: Config, spaceId: `0x${string}`) => Promise<string>;
}
