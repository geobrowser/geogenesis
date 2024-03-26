import { Config } from 'wagmi';

import { Storage } from '../storage';
import { MakeProposalOptions } from './publish';

export interface IPublish {
  makeProposal: (options: MakeProposalOptions) => Promise<void>;
  uploadFile(storageClient: Storage.IStorageClient, file: File): Promise<string>;
  getRole(
    config: Config,
    spaceId: string,
    role: 'EDITOR_ROLE' | 'ADMIN_ROLE' | 'EDITOR_CONTROLLER_ROLE'
  ): Promise<string>;
  grantRole(options: { spaceId: string; walletConfig: Config; role: string; userAddress: string }): Promise<string>;
  revokeRole(options: { spaceId: string; walletConfig: Config; role: string; userAddress: string }): Promise<string>;
  registerGeoProfile: (walletConfig: Config, spaceId: `0x${string}`) => Promise<string>;
}
