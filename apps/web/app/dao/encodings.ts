import { PluginInstallItem } from '@aragon/sdk-client-common';
import { VotingMode } from '@geogenesis/sdk';
import { GOVERNANCE_PLUGIN_REPO_ADDRESS, SPACE_PLUGIN_REPO_ADDRESS } from '@geogenesis/sdk/contracts';
import { encodeAbiParameters, hexToBytes } from 'viem';

import { ZERO_ADDRESS } from '~/core/constants';

export function getSpacePluginInstallItem({
  firstBlockContentUri,
  pluginUpgrader,
  precedessorSpace = ZERO_ADDRESS,
}: {
  firstBlockContentUri: string;
  pluginUpgrader: string;
  precedessorSpace?: string;
}): PluginInstallItem {
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
    id: SPACE_PLUGIN_REPO_ADDRESS,
    data: hexToBytes(encodedParams),
  };
}

export function getGovernancePluginInstallItem(params: {
  votingSettings: {
    votingMode: VotingMode;
    supportThreshold: number;
    minParticipation: number;
    minDuration: bigint;
    minProposerVotingPower: bigint;
  };
  initialEditors: `0x${string}`[];
  pluginUpgrader: `0x${string}`;
  memberAccessProposalDuration: bigint;
}): PluginInstallItem {
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
    id: GOVERNANCE_PLUGIN_REPO_ADDRESS,
    data: hexToBytes(encodedParams),
  };
}
