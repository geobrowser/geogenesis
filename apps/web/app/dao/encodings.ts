import { PluginInstallItem } from '@aragon/sdk-client-common';
import { VotingMode } from '@geogenesis/sdk';
import {
  GOVERNANCE_PLUGIN_REPO_ADDRESS,
  PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS,
  SPACE_PLUGIN_REPO_ADDRESS,
} from '@geogenesis/sdk/contracts';
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

export function getPersonalSpaceGovernancePluginInstallItem({
  initialEditor,
}: {
  initialEditor: string;
}): PluginInstallItem {
  // Define the ABI for the prepareInstallation function's inputs. This comes from the
  // `personal-space-admin-build-metadata.json` in our contracts repo, not from the setup plugin's ABIs.
  const prepareInstallationInputs = [
    {
      name: '_initialEditorAddress',
      type: 'address',
      internalType: 'address',
      description: 'The address of the first address to be granted the editor permission.',
    },
  ];

  const encodedParams = encodeAbiParameters(prepareInstallationInputs, [initialEditor]);

  return {
    id: PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS,
    data: hexToBytes(encodedParams),
  };
}

export function getGovernancePluginInstallItem(params: {
  votingSettings: {
    votingMode: VotingMode;
    supportThreshold: number;
    minParticipation: number;
    duration: bigint;
  };
  initialEditors: `0x${string}`[];
  pluginUpgrader: `0x${string}`;
  memberAccessProposalDuration: bigint;
}): PluginInstallItem {
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
          name: 'duration',
          type: 'uint64',
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
