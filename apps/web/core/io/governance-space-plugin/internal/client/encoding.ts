import { ClientCore, PluginInstallItem } from '@aragon/sdk-client-common';
import { encodeAbiParameters, encodeFunctionData, hexToBytes } from 'viem';

import { GEO_GOVERNANCE_PLUGIN_REPO_ADDRESS, GEO_SPACE_PLUGIN_REPO_ADDRESS, ZERO_ADDRESS } from '~/core/constants';

import { mainVotingPluginAbi, memberAccessPluginAbi, spacePluginAbi, spacePluginSetupAbi } from '../../abis';
import { GeoPluginContext } from '../../context';
import { MainVotingSettingsType } from '../../types';

export class GeoPluginClientEncoding extends ClientCore {
  private geoSpacePluginAddress: string;
  private geoGovernancePluginAddress: string;
  // private geoMemberAccessPluginAddress: string;
  // private geoMainVotingPluginAddress: string;

  constructor(pluginContext: GeoPluginContext) {
    super(pluginContext);

    // Plugin Addresses
    this.geoSpacePluginAddress = pluginContext.geoSpacePluginAddress;
    this.geoGovernancePluginAddress = pluginContext.geoGovernancePluginAddress;
    // this.geoMemberAccessPluginAddress = pluginContext.geoMemberAccessPluginAddress;
    // this.geoMainVotingPluginAddress = pluginContext.geoMainVotingPluginAddress;
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
  static async getSpacePluginInstallItem({
    firstBlockContentUri,
    pluginUpgrader,
    precedessorSpace = ZERO_ADDRESS,
  }: {
    firstBlockContentUri: string;
    pluginUpgrader: string;
    precedessorSpace?: string;
  }): Promise<PluginInstallItem> {
    // Define the ABI for the prepareInstallation function's inputs. This comes from the
    // `space-build-metadata.json` in our contracts repo, not from the setup plugin's ABIs.
    const prepareInstallationInputs = [
      {
        name: 'firstBlockContentUri',
        type: 'string',
        internalType: 'string',
        description: 'The inital contents of the first block item.',
      },
      {
        internalType: 'address',
        name: 'predecessorAddress',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'pluginUpgrader',
        type: 'address',
      },
    ];

    // This works but only if it's the only plugin being published. If we try multiple plugins we get an unpredictable gas limit
    const encodedParams = encodeAbiParameters(prepareInstallationInputs, [
      firstBlockContentUri,
      precedessorSpace,
      pluginUpgrader,
    ]);

    return {
      id: GEO_SPACE_PLUGIN_REPO_ADDRESS,
      data: hexToBytes(encodedParams),
    };
  }

  static async getGovernancePluginInstallItem(params: {
    votingSettings: {
      votingMode: 0 | 1;
      supportThreshold: number;
      minParticipation: number;
      minDuration: bigint;
      minProposerVotingPower: bigint;
    };
    initialEditors: `0x${string}`[];
    pluginUpgrader: `0x${string}`;
    memberAccessProposalDuration: bigint;
  }): Promise<PluginInstallItem> {
    // MajorityVotingBase.VotingSettings memory _votingSettings,
    // address[] memory _initialEditors,
    // uint64 _memberAccessProposalDuration,
    // address _pluginUpgrader
    //  struct VotingSettings {
    //     VotingMode votingMode;
    //     uint32 supportThreshold;
    //     uint32 minParticipation;
    //     uint64 minDuration;
    //     uint256 minProposerVotingPower;
    // }
    // votingSettings: comes from the MainVotingPlugin
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
        internalType: 'uint64',
        name: 'memberAccessProposalDuration',
        type: 'uint64',
      },
      {
        internalType: 'address',
        name: 'pluginUpgrader',
        type: 'address',
      },
    ];

    const encodedParams = encodeAbiParameters(prepareInstallationInputs, [
      params.votingSettings,
      params.initialEditors,
      params.memberAccessProposalDuration,
      params.pluginUpgrader,
    ]);

    return {
      id: GEO_GOVERNANCE_PLUGIN_REPO_ADDRESS,
      data: hexToBytes(encodedParams),
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
