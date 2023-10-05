import { MetadataAbiInput } from '@aragon/sdk-client-common';

export const mainVotingPluginSetupAbi = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [],
    name: 'implementation',
    outputs: [
      {
        internalType: 'address',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_dao',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: '_data',
        type: 'bytes',
      },
    ],
    name: 'prepareInstallation',
    outputs: [
      {
        internalType: 'address',
        name: 'plugin',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'address[]',
            name: 'helpers',
            type: 'address[]',
          },
          {
            components: [
              {
                internalType: 'enum PermissionLib.Operation',
                name: 'operation',
                type: 'uint8',
              },
              {
                internalType: 'address',
                name: 'where',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'who',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'condition',
                type: 'address',
              },
              {
                internalType: 'bytes32',
                name: 'permissionId',
                type: 'bytes32',
              },
            ],
            internalType: 'struct PermissionLib.MultiTargetPermission[]',
            name: 'permissions',
            type: 'tuple[]',
          },
        ],
        internalType: 'struct IPluginSetup.PreparedSetupData',
        name: 'preparedSetupData',
        type: 'tuple',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_dao',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'plugin',
            type: 'address',
          },
          {
            internalType: 'address[]',
            name: 'currentHelpers',
            type: 'address[]',
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes',
          },
        ],
        internalType: 'struct IPluginSetup.SetupPayload',
        name: '_payload',
        type: 'tuple',
      },
    ],
    name: 'prepareUninstallation',
    outputs: [
      {
        components: [
          {
            internalType: 'enum PermissionLib.Operation',
            name: 'operation',
            type: 'uint8',
          },
          {
            internalType: 'address',
            name: 'where',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'who',
            type: 'address',
          },
          {
            internalType: 'address',
            name: 'condition',
            type: 'address',
          },
          {
            internalType: 'bytes32',
            name: 'permissionId',
            type: 'bytes32',
          },
        ],
        internalType: 'struct PermissionLib.MultiTargetPermission[]',
        name: 'permissionChanges',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_dao',
        type: 'address',
      },
      {
        internalType: 'uint16',
        name: '_currentBuild',
        type: 'uint16',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'plugin',
            type: 'address',
          },
          {
            internalType: 'address[]',
            name: 'currentHelpers',
            type: 'address[]',
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes',
          },
        ],
        internalType: 'struct IPluginSetup.SetupPayload',
        name: '_payload',
        type: 'tuple',
      },
    ],
    name: 'prepareUpdate',
    outputs: [
      {
        internalType: 'bytes',
        name: 'initData',
        type: 'bytes',
      },
      {
        components: [
          {
            internalType: 'address[]',
            name: 'helpers',
            type: 'address[]',
          },
          {
            components: [
              {
                internalType: 'enum PermissionLib.Operation',
                name: 'operation',
                type: 'uint8',
              },
              {
                internalType: 'address',
                name: 'where',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'who',
                type: 'address',
              },
              {
                internalType: 'address',
                name: 'condition',
                type: 'address',
              },
              {
                internalType: 'bytes32',
                name: 'permissionId',
                type: 'bytes32',
              },
            ],
            internalType: 'struct PermissionLib.MultiTargetPermission[]',
            name: 'permissions',
            type: 'tuple[]',
          },
        ],
        internalType: 'struct IPluginSetup.PreparedSetupData',
        name: 'preparedSetupData',
        type: 'tuple',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes4',
        name: '_interfaceId',
        type: 'bytes4',
      },
    ],
    name: 'supportsInterface',
    outputs: [
      {
        internalType: 'bool',
        name: '',
        type: 'bool',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const mainVotingPluginSetupInstallAbi: MetadataAbiInput[] = [
  {
    components: [
      {
        internalType: 'enum MajorityVotingBase.VotingMode',
        name: 'votingMode',
        type: 'uint8',
        description:
          'A parameter to select the vote mode. In standard mode (0), early execution and vote replacement are disabled. In early execution mode (1), a proposal can be executed early before the end date if the vote outcome cannot mathematically change by more voters voting. In vote replacement mode (2), voters can change their vote multiple times and only the latest vote option is tallied.',
      },
      {
        internalType: 'uint32',
        name: 'supportThreshold',
        type: 'uint32',
        description:
          'The support threshold value. Its value has to be in the interval [0, 10^6] defined by `RATIO_BASE = 10**6`.',
      },
      {
        internalType: 'uint32',
        name: 'minParticipation',
        type: 'uint32',
        description:
          'The minimum participation value. Its value has to be in the interval [0, 10^6] defined by `RATIO_BASE = 10**6`.',
      },
      {
        internalType: 'uint64',
        name: 'minDuration',
        type: 'uint64',
        description: 'The minimum duration of the proposal vote in seconds.',
      },
      {
        internalType: 'uint256',
        name: 'minProposerVotingPower',
        type: 'uint256',
        description: 'The minimum voting power required to create a proposal.',
      },
    ],
    internalType: 'struct MajorityVotingBase.VotingSettings',
    name: 'votingSettings',
    type: 'tuple',
    description: 'The voting settings that will be enforced when proposals are created.',
  },
  {
    internalType: 'address[]',
    name: 'initialEditors',
    type: 'address[]',
    description: 'The addresses of the initial members to be added.',
  },
  {
    internalType: 'address',
    name: 'pluginUpgrader',
    type: 'address',
    description: 'The addresses of the upgrader.',
  },
];
