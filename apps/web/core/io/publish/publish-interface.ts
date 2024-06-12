import { Config } from 'wagmi';

import { Storage } from '../storage';
import { MakeProposalOptions } from './publish';

export interface IPublish {
  makeProposal: (options: MakeProposalOptions) => Promise<string[]>;
  uploadFile(storageClient: Storage.IStorageClient, file: File): Promise<string>;
  registerGeoProfile: (wallet: Config, spaceId: `0x${string}`) => Promise<string>;
}
