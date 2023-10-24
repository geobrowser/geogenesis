import { ExecutePersonalSpaceAdminPluginProposalOptions, InitializePersonalSpaceAdminPluginOptions } from '../types';

export interface IGeoPersonalSpacePluginClientMethods {
  initializePersonalSpaceAdminPlugin({
    wallet,
    daoAddress,
    onInitStateChange,
  }: InitializePersonalSpaceAdminPluginOptions): Promise<void>;
  executeProposal({
    metadata,
    actions,
    allowFailureMap,
    onProposalStateChange,
  }: ExecutePersonalSpaceAdminPluginProposalOptions): Promise<void>;
  isEditor(address: `0x${string}`): Promise<boolean>;
  supportsInterface(interfaceId: `0x${string}`): Promise<boolean>;
  proposalCount(): Promise<bigint>;
}
export interface IGeoPersonalSpacePluginClientEncoding {
  // fix the installation function first, then add this
}

export interface IGeoPersonalSpacePluginClient {
  methods: IGeoPersonalSpacePluginClientMethods;
  encoding: IGeoPersonalSpacePluginClientEncoding;
}
