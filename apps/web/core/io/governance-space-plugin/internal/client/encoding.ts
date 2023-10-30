import { ClientCore } from '@aragon/sdk-client-common';
import { encodeAbiParameters, encodeFunctionData, hexToBytes } from 'viem';

import { GEO_MAIN_VOTING_PLUGIN_REPO_ADDRESS, GEO_MEMBER_ACCESS_PLUGIN_REPO_ADDRESS } from '~/core/constants';

import { mainVotingPluginAbi, memberAccessPluginAbi, spacePluginAbi } from '../../abis';
import { GeoPluginContext } from '../../context';
import { MainVotingSettingsType } from '../../types';

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
  // encoded functions would be passed in as actions in a proposal
  public async processGeoProposal(blockIndex: number, itemIndex: number, contentUri: string) {
    const processProposalData = encodeFunctionData({
      abi: spacePluginAbi,
      functionName: 'processGeoProposal',
      args: [blockIndex, itemIndex, contentUri],
    });
    return processProposalData;
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

  // Space Plugin: Encoded Inherited Functions
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

  // Installation Functions
  static getMainVotingPluginInstallItem(params: {
    votingSettings: {
      votingMode: number;
      supportThreshold: number;
      minParticipation: number;
      minDuration: number;
      minProposerVotingPower: number;
    };
    initialEditors: string[];
    pluginUpgrader: string;
  }) {
    // Define the ABI for the prepareInstallation function's inputs
    const prepareInstallationInputs = [
      {
        components: [
          {
            internalType: 'enum MajorityVotingBase.VotingMode',
            name: 'votingMode',
            type: 'uint8',
          },
          {
            internalType: 'uint32',
            name: 'supportThreshold',
            type: 'uint32',
          },
          {
            internalType: 'uint32',
            name: 'minParticipation',
            type: 'uint32',
          },
          {
            internalType: 'uint64',
            name: 'minDuration',
            type: 'uint64',
          },
          {
            internalType: 'uint256',
            name: 'minProposerVotingPower',
            type: 'uint256',
          },
        ],
        internalType: 'struct MajorityVotingBase.VotingSettings',
        name: 'votingSettings',
        type: 'tuple',
      },
      {
        internalType: 'address[]',
        name: 'initialEditors',
        type: 'address[]',
      },
      {
        internalType: 'address',
        name: 'pluginUpgrader',
        type: 'address',
      },
    ];

    console.log('params', params);

    console.log('prepare installation inputs:', prepareInstallationInputs);

    if (!prepareInstallationInputs) {
      throw new Error('Could not find inputs for prepareInstallation in the ABI');
    }

    // Encode the data using encodeAbiParameters
    const encodedData = encodeAbiParameters(prepareInstallationInputs, [
      params.votingSettings,
      params.initialEditors,
      params.pluginUpgrader,
    ]);

    return {
      id: GEO_MAIN_VOTING_PLUGIN_REPO_ADDRESS, // Assuming you have this constant defined somewhere
      data: hexToBytes(encodedData as `0x${string}`),
    };
  }

  static getMemberAccessPluginInstallItem(params: {
    multisigSettings: {
      proposalDuration: number;
      mainVotingPlugin: string;
    };
    pluginUpgrader: string;
  }) {
    // Define the ABI for the prepareInstallation function's inputs
    const prepareInstallationInputs = [
      {
        components: [
          {
            internalType: 'uint64',
            name: 'proposalDuration',
            type: 'uint64',
          },
          {
            internalType: 'contract MainVotingPlugin',
            name: 'mainVotingPlugin',
            type: 'address',
          },
        ],
        internalType: 'struct MemberAccessPlugin.MultisigSettings',
        name: '_multisigSettings',
        type: 'tuple',
        description: 'The settings of the multisig approval logic',
      },
      {
        internalType: 'address',
        name: 'pluginUpgrader',
        type: 'address',
      },
    ];

    if (!prepareInstallationInputs) {
      throw new Error('Could not find inputs for prepareInstallation in the ABI');
    }

    // Encode the data using encodeAbiParameters
    const encodedData = encodeAbiParameters(prepareInstallationInputs, [
      params.multisigSettings,
      params.pluginUpgrader,
    ]);

    return {
      id: GEO_MEMBER_ACCESS_PLUGIN_REPO_ADDRESS,
      data: hexToBytes(encodedData as `0x${string}`),
    };
  }

  // Main Voting Plugin: Encoded Functions
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

  public async executeMemberAccessPlugin(proposalId: bigint) {
    const executeData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'execute',
      args: [proposalId],
    });
    return executeData;
  }

  // Member Access Plugin: Encoded Inherited Functions
  public async upgradeToMemberAccessPlugin(pluginAddress: `0x${string}`) {
    const upgradeToData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'upgradeTo',
      args: [pluginAddress],
    });
    return upgradeToData;
  }

  public async upgradeToAndCallMemberAccessPlugin(pluginAddress: `0x${string}`, calldata: `0x${string}`) {
    const upgradeToData = encodeFunctionData({
      abi: memberAccessPluginAbi,
      functionName: 'upgradeToAndCall',
      args: [pluginAddress, calldata],
    });
    return upgradeToData;
  }

  // Main Voting Plugin: Encoded Functions
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

  // Main Voting: Encoded Inherited Functions
  public async updateVotingSettings({ mainVotingSettings }: MainVotingSettingsType) {
    const updateVotingSettingsData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'updateVotingSettings',
      args: [mainVotingSettings],
    });
    return updateVotingSettingsData;
  }

  public async upgradeToMainVotingPlugin(pluginAddress: `0x${string}`) {
    const upgradeToData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'upgradeTo',
      args: [pluginAddress],
    });
    return upgradeToData;
  }

  public async upgradeToAndCallMainVotingPlugin(pluginAddress: `0x${string}`, calldata: `0x${string}`) {
    const upgradeToData = encodeFunctionData({
      abi: mainVotingPluginAbi,
      functionName: 'upgradeToAndCall',
      args: [pluginAddress, calldata],
    });
    return upgradeToData;
  }
}
