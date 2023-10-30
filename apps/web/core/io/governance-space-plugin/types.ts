import { ContextParams, VersionTag } from '@aragon/sdk-client-common';

import { WalletClient } from 'wagmi';

export type GeoPluginContextParams = ContextParams & {
  geoSpacePluginAddress?: string;
  geoMemberAccessPluginAddress?: string;
  geoMainVotingPluginAddress?: string;

  geoSpacePluginRepoAddress?: string;
  geoMemberAccessPluginRepoAddress?: string;
  geoMainVotingPluginRepoAddress?: string;
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

export type InitializeSpacePluginOptions = {
  wallet: WalletClient;
  daoAddress: `0x${string}`;
  firstBlockUri: string;
  onInitStateChange: (newState: PluginInitState) => void;
};

export type ProcessGeoProposalSpacePluginOptions = {
  wallet: WalletClient;
  blockIndex: number;
  itemIndex: number;
  contentUri: string;
  onProposalStateChange: (newState: ProposalInitState) => void;
};

export type InitializeMemberAccessPluginOptions = {
  wallet: WalletClient;
  daoAddress: `0x${string}`;
  memberAccessSettings: {
    proposalDuration: bigint;
    mainVotingPlugin: `0x${string}`;
  };
  onInitStateChange: (newState: PluginInitState) => void;
};

export type PrepareSetupMemberAccessPluginOptions = {
  wallet: WalletClient;
  memberAccessSettings: {
    proposalDuration: bigint;
    mainVotingPlugin: `0x${string}`;
  };
  onInitStateChange: (newState: PluginInitState) => void;
};

export type MainVotingPluginVotingSettings = {
  votingMode: number;
  supportThreshold: number;
  minParticipation: number;
  minDuration: bigint;
  minProposerVotingPower: bigint;
};

export type MainVotingSettingsType = {
  mainVotingSettings: {
    votingMode: number;
    supportThreshold: number;
    minParticipation: number;
    minDuration: bigint;
    minProposerVotingPower: bigint;
  };
};

export type InitializeMainVotingPluginOptions = {
  wallet?: WalletClient;
  daoAddress: `0x${string}`;
  votingSettings: MainVotingPluginVotingSettings;
  initialEditors: `0x${string}`[];
  onInitStateChange?: (newState: PluginInitState) => void;
};

export type CreateMainVotingPluginProposalOptions = {
  wallet: WalletClient;
  metadata: `0x${string}`;
  actions: readonly { to: `0x${string}`; value: bigint; data: `0x${string}` }[];
  allowFailureMap: bigint;
  arg3: bigint;
  arg4: bigint;
  voteOption: number;
  tryEarlyExecution: boolean;
  onProposalStateChange: (newState: ProposalInitState) => void;
};

export type CancelMainVotingPluginProposalOptions = {
  wallet: WalletClient;
  proposalId: bigint;
  onProposalStateChange: (newState: ProposalInitState) => void;
};

export type VoteMainVotingPluginProposalOptions = {
  wallet: WalletClient;
  proposalId: bigint;
  vote: number;
  tryEarlyExecution: boolean;
  onProposalStateChange: (newState: ProposalInitState) => void;
};

export type ExecuteMainVotingPluginProposalOptions = {
  wallet: WalletClient;
  proposalId: bigint;
  onProposalStateChange: (newState: ProposalInitState) => void;
};
