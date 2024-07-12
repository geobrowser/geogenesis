import { CreateDaoParams } from '@aragon/sdk-client';
import { VotingMode } from '@geogenesis/sdk';
import {
  GOVERNANCE_PLUGIN_REPO_ADDRESS,
  PERSONAL_SPACE_ADMIN_PLUGIN_REPO_ADDRESS,
  SPACE_PLUGIN_REPO_ADDRESS,
} from '@geogenesis/sdk/contracts';
import { encodeAbiParameters } from 'viem';

import { ZERO_ADDRESS } from '~/core/constants';
import { OmitStrict } from '~/core/types';

// Using viem for the dao creation requires a slightly different encoding state for our plugins.
// When using ethers the type for `data` is expected to be a Uint8Array, but when using viem and
// encodeFunctionData it expects a hex bytes string.
export interface CreateGeoDaoParams extends OmitStrict<CreateDaoParams, 'plugins'> {
  plugins: PluginInstallationWithViem[];
}

// Using viem for the dao creation requires a slightly different encoding state for our plugins.
// When using ethers the type for `data` is expected to be a Uint8Array, but when using viem and
// encodeFunctionData it expects a hex bytes string.
type PluginInstallationWithViem = {
  id: `0x${string}`;
  data: `0x${string}`;
};

export function getSpacePluginInstallItem({
  firstBlockContentUri,
  pluginUpgrader,
  precedessorSpace = ZERO_ADDRESS,
}: {
  firstBlockContentUri: string;
  pluginUpgrader: string;
  precedessorSpace?: string;
}): PluginInstallationWithViem {
  // from `encodeInstallationParams`
  const prepareInstallationInputs = [
    {
      internalType: 'string',
      name: '_firstBlockContentUri',
      type: 'string',
    },
    {
      internalType: 'address',
      name: '_predecessorAddress',
      type: 'address',
    },
    {
      internalType: 'address',
      name: '_pluginUpgrader',
      type: 'address',
    },
  ];

  // This works but only if it's the only plugin being published. If we try multiple plugins with
  // the same upgrader we get an unpredictable gas limit
  const encodedParams = encodeAbiParameters(prepareInstallationInputs, [
    firstBlockContentUri,
    precedessorSpace,
    pluginUpgrader,
  ]);

  return {
    id: SPACE_PLUGIN_REPO_ADDRESS,
    data: encodedParams,
  };
}

export function getPersonalSpaceGovernancePluginInstallItem({
  initialEditor,
}: {
  initialEditor: string;
}): PluginInstallationWithViem {
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
    data: encodedParams,
  };
}

export function getGovernancePluginInstallItem(params: {
  votingSettings: {
    votingMode: VotingMode;
    supportThreshold: number;
    duration: bigint;
  };
  initialEditors: `0x${string}`[];
  memberAccessProposalDuration: bigint;
  pluginUpgrader: `0x${string}`;
}): PluginInstallationWithViem {
  // From `encodeInstallationParams`
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
          internalType: 'uint64',
          name: 'duration',
          type: 'uint64',
        },
      ],
      internalType: 'struct MajorityVotingBase.VotingSettings',
      name: '_votingSettings',
      type: 'tuple',
    },
    {
      internalType: 'address[]',
      name: '_initialEditors',
      type: 'address[]',
    },
    {
      internalType: 'uint64',
      name: '_memberAccessProposalDuration',
      type: 'uint64',
    },
    {
      internalType: 'address',
      name: '_pluginUpgrader',
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
    data: encodedParams,
  };
}
