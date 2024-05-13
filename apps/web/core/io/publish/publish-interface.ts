import { WalletClient } from 'wagmi';

import { Storage } from '../storage';
import { MakeProposalOptions } from './publish';

export interface IPublish {
  makeProposal: (options: MakeProposalOptions) => Promise<void>;
  uploadFile(storageClient: Storage.IStorageClient, file: File): Promise<string>;
  registerGeoProfile: (wallet: WalletClient, spaceId: `0x${string}`) => Promise<string>;
}
