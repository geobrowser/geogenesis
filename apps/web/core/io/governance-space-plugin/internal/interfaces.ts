import {
  CancelMainVotingPluginProposalOptions,
  CreateMainVotingPluginProposalOptions,
  ExecuteMainVotingPluginProposalOptions,
  InitializeMainVotingPluginOptions,
  InitializeMemberAccessPluginOptions,
  InitializeSpacePluginOptions,
  SetContentSpacePluginOptions,
  VoteMainVotingPluginProposalOptions,
} from '../types';

export interface IGeoPluginClientMethods {
  initializeSpacePlugin({
    wallet,
    daoAddress,
    firstBlockUri,
    onInitStateChange,
  }: InitializeSpacePluginOptions): Promise<void>;
  setContent({
    wallet,
    blockIndex,
    itemIndex,
    contentUri,
    onProposalStateChange,
  }: SetContentSpacePluginOptions): Promise<void>;
  initializeMemberAccessPlugin({
    wallet,
    daoAddress,
    memberAccessSettings,
    onInitStateChange,
  }: InitializeMemberAccessPluginOptions): Promise<void>;
  isMember(address: `0x${string}`): Promise<boolean>;
  isEditor(address: `0x${string}`): Promise<boolean>;
  canApprove(proposalId: bigint, address: `0x${string}`): Promise<boolean>;
  canExecute(proposalId: bigint): Promise<boolean>;
  hasApproved(proposalId: bigint, address: `0x${string}`): Promise<boolean>;
  supportsInterface(interfaceId: `0x${string}`): Promise<boolean>;
  initializeMainVotingPlugin({
    wallet,
    daoAddress,
    votingSettings,
    initialEditors,
    onInitStateChange,
  }: InitializeMainVotingPluginOptions): Promise<void>;
  createProposal({
    wallet,
    metadata,
    actions,
    allowFailureMap,
    arg3 = BigInt(0),
    arg4 = BigInt(0),
    voteOption,
    tryEarlyExecution,
    onProposalStateChange,
  }: CreateMainVotingPluginProposalOptions): Promise<void>;
  cancelProposal({ proposalId, onProposalStateChange }: CancelMainVotingPluginProposalOptions): Promise<void>;
  voteProposal({
    wallet,
    proposalId,
    vote,
    tryEarlyExecution,
    onProposalStateChange,
  }: VoteMainVotingPluginProposalOptions): Promise<void>;
  executeProposal({ wallet, proposalId, onProposalStateChange }: ExecuteMainVotingPluginProposalOptions): Promise<void>;
  canVote(proposalId: bigint, voterAddress: `0x${string}`, voteOption: number): Promise<boolean>;
  canExecuteMainVoting(proposalId: bigint): Promise<boolean>;
  getVoteOption(proposalId: bigint, voterAddress: `0x${string}`): Promise<number>;
  isSupportThresholdReached(proposalId: bigint): Promise<boolean>;
  isSupportThresholdReachedEarly(proposalId: bigint): Promise<boolean>;
  isMinParticipationReached(proposalId: bigint): Promise<boolean>;
  supportThreshold(): Promise<number>;
  minParticipation(): Promise<number>;
  minDuration(): Promise<bigint>;
  minProposerVotingPower(): Promise<bigint>;
  votingMode(): Promise<number>;
  totalVotingPower(blockNumber: bigint): Promise<bigint>;
  implementationMainVoting(): Promise<`0x${string}`>;
}
export interface IGeoPluginClientEncoding {
  setContent(blockIndex: number, itemIndex: number, contentUri: string): Promise<`0x${string}`>;

  acceptSubspace(subspaceDaoAddress: `0x${string}`): Promise<`0x${string}`>;

  removeSubspace(subspaceDaoAddress: `0x${string}`): Promise<`0x${string}`>;

  upgradeToSpacePlugin(pluginAddress: `0x${string}`): Promise<`0x${string}`>;

  upgradeToAndCallSpacePlugin(pluginAddress: `0x${string}`, calldata: `0x${string}`): Promise<`0x${string}`>;

  updateMultisigSettings(proposalDuration: bigint, mainVotingPluginAddress: `0x${string}`): Promise<`0x${string}`>;

  proposeNewMember(metadataUri: `0x${string}`, memberAddress: `0x${string}`): Promise<`0x${string}`>;

  proposeRemoveMember(metadataUri: `0x${string}`, memberAddress: `0x${string}`): Promise<`0x${string}`>;

  approve(proposalId: bigint, earlyExecution?: boolean): Promise<`0x${string}`>;

  reject(proposalId: bigint): Promise<`0x${string}`>;

  executeMemberAccessPlugin(proposalId: bigint): Promise<`0x${string}`>;

  upgradeToMemberAccessPlugin(pluginAddress: `0x${string}`): Promise<`0x${string}`>;

  upgradeToAndCallMemberAccessPlugin(pluginAddress: `0x${string}`, calldata: `0x${string}`): Promise<`0x${string}`>;

  addAddresses(addresses: `0x${string}`[]): Promise<`0x${string}`>;

  removeAddresses(addresses: `0x${string}`[]): Promise<`0x${string}`>;

  // updateVotingSettings

  upgradeToMainVotingPlugin(pluginAddress: `0x${string}`): Promise<`0x${string}`>;

  upgradeToAndCallMainVotingPlugin(pluginAddress: `0x${string}`, calldata: `0x${string}`): Promise<`0x${string}`>;
}

export interface IGeoPluginClient {
  methods: IGeoPluginClientMethods;
  encoding: IGeoPluginClientEncoding;
}
