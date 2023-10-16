import { ContextParams, VersionTag } from '@aragon/sdk-client-common';

import { WalletClient } from 'wagmi';

export type GeoPersonalSpaceAdminPluginContextParams = ContextParams & {
  geoPersonalSpaceAdminPluginAddress?: string;
  geoPersonalSpaceAdminPluginRepoAddress?: string;
};

export type PrepareInstallationParams = {
  daoAddressOrEns: string;
  version?: VersionTag;
  settings: {
    number: bigint;
  };
};

export type PluginInitState = 'idle' | 'signing-wallet' | 'publishing-contract' | 'publish-complete' | 'publish-error';

export type InitializePersonalSpaceAdminPluginOptions = {
  wallet: WalletClient;
  daoAddress: `0x${string}`;
  onInitStateChange: (newState: PluginInitState) => void;
};
