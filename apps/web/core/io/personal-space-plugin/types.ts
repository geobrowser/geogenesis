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

export type PluginInitState =
  | 'idle'
  | 'initializing-plugin'
  | 'signing-wallet'
  | 'waiting-for-transaction'
  | 'transaction-complete'
  | 'transaction-error';

export type ProposalInitState =
  | 'idle'
  | 'initializing-proposal-plugin'
  | 'signing-wallet'
  | 'waiting-for-transaction'
  | 'transaction-complete'
  | 'transaction-error';

export type InitializePersonalSpaceAdminPluginOptions = {
  wallet: WalletClient;
  daoAddress: `0x${string}`;
  onInitStateChange: (newState: PluginInitState) => void;
};

export type ExecutePersonalSpaceAdminPluginProposalOptions = {
  metadata: `0x${string}`;
  actions: readonly { to: `0x${string}`; value: bigint; data: `0x${string}` }[];
  allowFailureMap: bigint;
  onProposalStateChange: (newState: ProposalInitState) => void;
};
