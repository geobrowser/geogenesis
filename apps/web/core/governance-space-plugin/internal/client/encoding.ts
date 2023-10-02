import { ClientCore } from '@aragon/sdk-client-common';
import { encodeFunctionData, getContract } from 'viem';
import { _ } from 'vitest/dist/global-fe52f84b';

import { mainVotingPluginAbi, memberAccessPluginAbi, spacePluginAbi } from '../../abis';
import { GeoPluginContext } from '../../context';
import { publicClient } from './methods';

export class GeoPluginClientEncoding extends ClientCore {
  private geoSpacePluginAddress: string;
  private geoMemberAccessPluginAddress: string;
  private geoMainVotingPluginAddress: string;

  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);

    // Plugin Addresses
    this.geoSpacePluginAddress = pluginContext.geoSpacePluginAddress;
    this.geoMemberAccessPluginAddress = pluginContext.geoMemberAccessPluginAddress;
    this.geoMainVotingPluginAddress = pluginContext.geoMainVotingPluginAddress;
  }

  // Space Plugin: Functions
  public async initalizeSpacePlugin(daoAddress: `0x${string}`, firstBlockContentUri: string) {
    const initalizeData = encodeFunctionData({
      abi: spacePluginAbi,
      functionName: 'initialize',
      args: [daoAddress, firstBlockContentUri],
    });
    return initalizeData;
  }

  public async setContent(blockIndex: number, itemIndex: number, contentUri: string) {
    const setContentData = encodeFunctionData({
      abi: spacePluginAbi,
      functionName: 'setContent',
      args: [blockIndex, itemIndex, contentUri],
    });
    return setContentData;
  }

  public async acceptSubspace(subspaceDaoAddress: `0x${string}`) {
    const acceptSubspaceData = encodeFunctionData({
      abi: spacePluginAbi,
      functionName: 'acceptSubspace',
      args: [subspaceDaoAddress],
    });
    return acceptSubspaceData;
  }

  public async removeSubspace(subspaceDaoAddress: `0x${string}`) {
    const removeSubspaceData = encodeFunctionData({
      abi: spacePluginAbi,
      functionName: 'removeSubspace',
      args: [subspaceDaoAddress],
    });
    return removeSubspaceData;
  }

  // Space Plugin: Inherited Functions

  public async upgradeToSpacePlugin(pluginAddress: `0x${string}`) {
    const upgradeToData = encodeFunctionData({
      abi: spacePluginAbi,
      functionName: 'upgradeTo',
      args: [pluginAddress],
    });
    return upgradeToData;
  }

  public async upgradeToAndCallSpacePlugin(pluginAddress: `0x${string}`, calldata: `0x${string}`) {
    const upgradeToData = encodeFunctionData({
      abi: spacePluginAbi,
      functionName: 'upgradeToAndCall',
      args: [pluginAddress, calldata],
    });
    return upgradeToData;
  }

  // Member Access: Functions

  public async initalizeMemberAccessPlugin(daoAddress: `0x${string}`, firstBlockContentUri: string) {
    const initalizeData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'initialize',
      args: [daoAddress, firstBlockContentUri],
    });
    return initalizeData;
  }

  public async updateMultisigSettings(proposalDuration: bigint, mainVotingPluginAddress: `0x${string}`) {
    const updateMultisigSettingsData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'updateMultisigSettings',
      args: [{ proposalDuration, mainVotingPlugin: mainVotingPluginAddress }],
    });
    return updateMultisigSettingsData;
  }

  public async proposeNewMember(metadataUri: `0x${string}`, memberAddress: `0x${string}`) {
    const proposeNewMemberData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'proposeNewMember',
      args: [metadataUri, memberAddress],
    });
    return proposeNewMemberData;
  }

  public async proposeRemoveMember(metadataUri: `0x${string}`, memberAddress: `0x${string}`) {
    const proposeRemoveMemberData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'proposeRemoveMember',
      args: [metadataUri, memberAddress],
    });
    return proposeRemoveMemberData;
  }

  public async approve(proposalId: bigint, earlyExecution = true) {
    const approveData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'approve',
      args: [proposalId, earlyExecution],
    });
    return approveData;
  }

  public async reject(proposalId: bigint) {
    const rejectData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'reject',
      args: [proposalId],
    });
    return rejectData;
  }

  public async execute(proposalId: bigint) {
    const executeData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'execute',
      args: [proposalId],
    });
    return executeData;
  }

  public async upgradeToMainVotingPlugin(pluginAddress: `0x${string}`) {
    const upgradeToData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'upgradeTo',
      args: [pluginAddress],
    });
    return upgradeToData;
  }

  public async upgradeToAndCallMainVotingPlugin(pluginAddress: `0x${string}`, calldata: `0x${string}`) {
    const upgradeToData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'upgradeToAndCall',
      args: [pluginAddress, calldata],
    });
    return upgradeToData;
  }

  // Member Access: Inherited Functions

  // Main Voting: Functions

  public async initalizeMainVotingPlugin(daoAddress: `0x${string}`, firstBlockContentUri: string) {
    const initalizeData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'initialize',
      // args: [daoAddress, firstBlockContentUri],
    });
    return initalizeData;
  }

  public async addAddresses(addresses: `0x${string}`[]) {
    const addAddressesData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'addAddresses',
      args: [addresses],
    });
    return addAddressesData;
  }

  public async removeAddresses(addresses: `0x${string}`[]) {
    const removeAddressesData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'removeAddresses',
      args: [addresses],
    });
    return removeAddressesData;
  }

  public async createProposal() {
    const createProposalData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'createProposal',
      args: [],
    });
    return createProposalData;
  }

  public async cancelProposal() {
    const cancelProposalData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'cancelProposal', // need new abi
      args: [],
    });
    return cancelProposalData;
  }

  // Main Voting: Inherited Functions

  public async vote(proposalId: bigint, vote: number, tryEarlyExecution: boolean) {
    const voteData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'vote',
      args: [proposalId, vote, tryEarlyExecution],
    });
    return voteData;
  }
}
