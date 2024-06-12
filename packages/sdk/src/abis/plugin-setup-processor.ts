export const abi = [
  {
    inputs: [
      {
        internalType: 'contract PluginRepoRegistry',
        name: '_repoRegistry',
        type: 'address',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'plugin',
        type: 'address',
      },
    ],
    name: 'IPluginNotSupported',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'currentAppliedSetupId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'appliedSetupId',
        type: 'bytes32',
      },
    ],
    name: 'InvalidAppliedSetupId',
    type: 'error',
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint8',
            name: 'release',
            type: 'uint8',
          },
          {
            internalType: 'uint16',
            name: 'build',
            type: 'uint16',
          },
        ],
        internalType: 'struct PluginRepo.Tag',
        name: 'currentVersionTag',
        type: 'tuple',
      },
      {
        components: [
          {
            internalType: 'uint8',
            name: 'release',
            type: 'uint8',
          },
          {
            internalType: 'uint16',
            name: 'build',
            type: 'uint16',
          },
        ],
        internalType: 'struct PluginRepo.Tag',
        name: 'newVersionTag',
        type: 'tuple',
      },
    ],
    name: 'InvalidUpdateVersion',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PluginAlreadyInstalled',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'plugin',
        type: 'address',
      },
    ],
    name: 'PluginNonupgradeable',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'proxy',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'implementation',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'initData',
        type: 'bytes',
      },
    ],
    name: 'PluginProxyUpgradeFailed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PluginRepoNonexistent',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
    ],
    name: 'SetupAlreadyPrepared',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'caller',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: 'permissionId',
        type: 'bytes32',
      },
    ],
    name: 'SetupApplicationUnauthorized',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
    ],
    name: 'SetupNotApplicable',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'plugin',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'appliedSetupId',
        type: 'bytes32',
      },
    ],
    name: 'InstallationApplied',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'contract PluginRepo',
        name: 'pluginSetupRepo',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'uint8',
            name: 'release',
            type: 'uint8',
          },
          {
            internalType: 'uint16',
            name: 'build',
            type: 'uint16',
          },
        ],
        indexed: false,
        internalType: 'struct PluginRepo.Tag',
        name: 'versionTag',
        type: 'tuple',
      },
      {
        indexed: false,
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
      {
        indexed: false,
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
        indexed: false,
        internalType: 'struct IPluginSetup.PreparedSetupData',
        name: 'preparedSetupData',
        type: 'tuple',
      },
    ],
    name: 'InstallationPrepared',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'plugin',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
    ],
    name: 'UninstallationApplied',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'contract PluginRepo',
        name: 'pluginSetupRepo',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'uint8',
            name: 'release',
            type: 'uint8',
          },
          {
            internalType: 'uint16',
            name: 'build',
            type: 'uint16',
          },
        ],
        indexed: false,
        internalType: 'struct PluginRepo.Tag',
        name: 'versionTag',
        type: 'tuple',
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
        indexed: false,
        internalType: 'struct IPluginSetup.SetupPayload',
        name: 'setupPayload',
        type: 'tuple',
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
        indexed: false,
        internalType: 'struct PermissionLib.MultiTargetPermission[]',
        name: 'permissions',
        type: 'tuple[]',
      },
    ],
    name: 'UninstallationPrepared',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'plugin',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'appliedSetupId',
        type: 'bytes32',
      },
    ],
    name: 'UpdateApplied',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'contract PluginRepo',
        name: 'pluginSetupRepo',
        type: 'address',
      },
      {
        components: [
          {
            internalType: 'uint8',
            name: 'release',
            type: 'uint8',
          },
          {
            internalType: 'uint16',
            name: 'build',
            type: 'uint16',
          },
        ],
        indexed: false,
        internalType: 'struct PluginRepo.Tag',
        name: 'versionTag',
        type: 'tuple',
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
        indexed: false,
        internalType: 'struct IPluginSetup.SetupPayload',
        name: 'setupPayload',
        type: 'tuple',
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
        indexed: false,
        internalType: 'struct IPluginSetup.PreparedSetupData',
        name: 'preparedSetupData',
        type: 'tuple',
      },
      {
        indexed: false,
        internalType: 'bytes',
        name: 'initData',
        type: 'bytes',
      },
    ],
    name: 'UpdatePrepared',
    type: 'event',
  },
  {
    inputs: [],
    name: 'APPLY_INSTALLATION_PERMISSION_ID',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'APPLY_UNINSTALLATION_PERMISSION_ID',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'APPLY_UPDATE_PERMISSION_ID',
    outputs: [
      {
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
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
        components: [
          {
            components: [
              {
                components: [
                  {
                    internalType: 'uint8',
                    name: 'release',
                    type: 'uint8',
                  },
                  {
                    internalType: 'uint16',
                    name: 'build',
                    type: 'uint16',
                  },
                ],
                internalType: 'struct PluginRepo.Tag',
                name: 'versionTag',
                type: 'tuple',
              },
              {
                internalType: 'contract PluginRepo',
                name: 'pluginSetupRepo',
                type: 'address',
              },
            ],
            internalType: 'struct PluginSetupRef',
            name: 'pluginSetupRef',
            type: 'tuple',
          },
          {
            internalType: 'address',
            name: 'plugin',
            type: 'address',
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
          {
            internalType: 'bytes32',
            name: 'helpersHash',
            type: 'bytes32',
          },
        ],
        internalType: 'struct PluginSetupProcessor.ApplyInstallationParams',
        name: '_params',
        type: 'tuple',
      },
    ],
    name: 'applyInstallation',
    outputs: [],
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
            components: [
              {
                components: [
                  {
                    internalType: 'uint8',
                    name: 'release',
                    type: 'uint8',
                  },
                  {
                    internalType: 'uint16',
                    name: 'build',
                    type: 'uint16',
                  },
                ],
                internalType: 'struct PluginRepo.Tag',
                name: 'versionTag',
                type: 'tuple',
              },
              {
                internalType: 'contract PluginRepo',
                name: 'pluginSetupRepo',
                type: 'address',
              },
            ],
            internalType: 'struct PluginSetupRef',
            name: 'pluginSetupRef',
            type: 'tuple',
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
        internalType: 'struct PluginSetupProcessor.ApplyUninstallationParams',
        name: '_params',
        type: 'tuple',
      },
    ],
    name: 'applyUninstallation',
    outputs: [],
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
            components: [
              {
                components: [
                  {
                    internalType: 'uint8',
                    name: 'release',
                    type: 'uint8',
                  },
                  {
                    internalType: 'uint16',
                    name: 'build',
                    type: 'uint16',
                  },
                ],
                internalType: 'struct PluginRepo.Tag',
                name: 'versionTag',
                type: 'tuple',
              },
              {
                internalType: 'contract PluginRepo',
                name: 'pluginSetupRepo',
                type: 'address',
              },
            ],
            internalType: 'struct PluginSetupRef',
            name: 'pluginSetupRef',
            type: 'tuple',
          },
          {
            internalType: 'bytes',
            name: 'initData',
            type: 'bytes',
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
          {
            internalType: 'bytes32',
            name: 'helpersHash',
            type: 'bytes32',
          },
        ],
        internalType: 'struct PluginSetupProcessor.ApplyUpdateParams',
        name: '_params',
        type: 'tuple',
      },
    ],
    name: 'applyUpdate',
    outputs: [],
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
            components: [
              {
                components: [
                  {
                    internalType: 'uint8',
                    name: 'release',
                    type: 'uint8',
                  },
                  {
                    internalType: 'uint16',
                    name: 'build',
                    type: 'uint16',
                  },
                ],
                internalType: 'struct PluginRepo.Tag',
                name: 'versionTag',
                type: 'tuple',
              },
              {
                internalType: 'contract PluginRepo',
                name: 'pluginSetupRepo',
                type: 'address',
              },
            ],
            internalType: 'struct PluginSetupRef',
            name: 'pluginSetupRef',
            type: 'tuple',
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes',
          },
        ],
        internalType: 'struct PluginSetupProcessor.PrepareInstallationParams',
        name: '_params',
        type: 'tuple',
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
            components: [
              {
                components: [
                  {
                    internalType: 'uint8',
                    name: 'release',
                    type: 'uint8',
                  },
                  {
                    internalType: 'uint16',
                    name: 'build',
                    type: 'uint16',
                  },
                ],
                internalType: 'struct PluginRepo.Tag',
                name: 'versionTag',
                type: 'tuple',
              },
              {
                internalType: 'contract PluginRepo',
                name: 'pluginSetupRepo',
                type: 'address',
              },
            ],
            internalType: 'struct PluginSetupRef',
            name: 'pluginSetupRef',
            type: 'tuple',
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
            name: 'setupPayload',
            type: 'tuple',
          },
        ],
        internalType: 'struct PluginSetupProcessor.PrepareUninstallationParams',
        name: '_params',
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
        name: 'permissions',
        type: 'tuple[]',
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
            components: [
              {
                internalType: 'uint8',
                name: 'release',
                type: 'uint8',
              },
              {
                internalType: 'uint16',
                name: 'build',
                type: 'uint16',
              },
            ],
            internalType: 'struct PluginRepo.Tag',
            name: 'currentVersionTag',
            type: 'tuple',
          },
          {
            components: [
              {
                internalType: 'uint8',
                name: 'release',
                type: 'uint8',
              },
              {
                internalType: 'uint16',
                name: 'build',
                type: 'uint16',
              },
            ],
            internalType: 'struct PluginRepo.Tag',
            name: 'newVersionTag',
            type: 'tuple',
          },
          {
            internalType: 'contract PluginRepo',
            name: 'pluginSetupRepo',
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
            name: 'setupPayload',
            type: 'tuple',
          },
        ],
        internalType: 'struct PluginSetupProcessor.PrepareUpdateParams',
        name: '_params',
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
    inputs: [],
    name: 'repoRegistry',
    outputs: [
      {
        internalType: 'contract PluginRepoRegistry',
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
        internalType: 'bytes32',
        name: '',
        type: 'bytes32',
      },
    ],
    name: 'states',
    outputs: [
      {
        internalType: 'uint256',
        name: 'blockNumber',
        type: 'uint256',
      },
      {
        internalType: 'bytes32',
        name: 'currentAppliedSetupId',
        type: 'bytes32',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: 'pluginInstallationId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes32',
        name: 'preparedSetupId',
        type: 'bytes32',
      },
    ],
    name: 'validatePreparedSetupId',
    outputs: [],
    stateMutability: 'view',
    type: 'function',
  },
] as const
