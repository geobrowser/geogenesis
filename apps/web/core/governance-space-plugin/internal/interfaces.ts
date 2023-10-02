export interface IGeoPluginClientMethods {
  isMember(address: string): Promise<boolean>;
}
export interface IGeoPluginClientEncoding {
  initalizeSpacePlugin(daoAddress: `0x${string}`, firstBlockContentUri: string): Promise<`0x${string}`>;

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

  // createProposal

  cancelProposal(proposalId: bigint): Promise<`0x${string}`>;

  vote(proposalId: bigint, vote: number, tryEarlyExecution: boolean): Promise<`0x${string}`>;

  executeMainVotingPlugin(proposalId: bigint): Promise<`0x${string}`>;

  // updateVotingSettings

  upgradeToMainVotingPlugin(pluginAddress: `0x${string}`): Promise<`0x${string}`>;

  upgradeToAndCallMainVotingPlugin(pluginAddress: `0x${string}`, calldata: `0x${string}`): Promise<`0x${string}`>;
}

export interface IGeoPluginClient {
  methods: IGeoPluginClientMethods;
  encoding: IGeoPluginClientEncoding;
}
