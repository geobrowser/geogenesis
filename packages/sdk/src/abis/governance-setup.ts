export const abi = [
  {
    "inputs": [
      {
        "internalType": "contract PluginSetupProcessor",
        "name": "pluginSetupProcessorAddress",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "actualLength",
        "type": "uint256"
      }
    ],
    "name": "InvalidHelpers",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "address",
        "name": "dao",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "mainVotingPlugin",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "memberAccessPlugin",
        "type": "address"
      }
    ],
    "name": "GeoGovernancePluginsCreated",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_data",
        "type": "bytes"
      }
    ],
    "name": "decodeInstallationParams",
    "outputs": [
      {
        "components": [
          {
            "internalType": "enum MajorityVotingBase.VotingMode",
            "name": "votingMode",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "supportThreshold",
            "type": "uint32"
          },
          {
            "internalType": "uint64",
            "name": "duration",
            "type": "uint64"
          }
        ],
        "internalType": "struct MajorityVotingBase.VotingSettings",
        "name": "votingSettings",
        "type": "tuple"
      },
      {
        "internalType": "address[]",
        "name": "initialEditors",
        "type": "address[]"
      },
      {
        "internalType": "uint64",
        "name": "memberAccessProposalDuration",
        "type": "uint64"
      },
      {
        "internalType": "address",
        "name": "pluginUpgrader",
        "type": "address"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes",
        "name": "_data",
        "type": "bytes"
      }
    ],
    "name": "decodeUninstallationParams",
    "outputs": [
      {
        "internalType": "address",
        "name": "pluginUpgrader",
        "type": "address"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {
            "internalType": "enum MajorityVotingBase.VotingMode",
            "name": "votingMode",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "supportThreshold",
            "type": "uint32"
          },
          {
            "internalType": "uint64",
            "name": "duration",
            "type": "uint64"
          }
        ],
        "internalType": "struct MajorityVotingBase.VotingSettings",
        "name": "_votingSettings",
        "type": "tuple"
      },
      {
        "internalType": "address[]",
        "name": "_initialEditors",
        "type": "address[]"
      },
      {
        "internalType": "uint64",
        "name": "_memberAccessProposalDuration",
        "type": "uint64"
      },
      {
        "internalType": "address",
        "name": "_pluginUpgrader",
        "type": "address"
      }
    ],
    "name": "encodeInstallationParams",
    "outputs": [
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_pluginUpgrader",
        "type": "address"
      }
    ],
    "name": "encodeUninstallationParams",
    "outputs": [
      {
        "internalType": "bytes",
        "name": "",
        "type": "bytes"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "implementation",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "memberAccessPluginImplementation",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_dao",
        "type": "address"
      },
      {
        "internalType": "bytes",
        "name": "_data",
        "type": "bytes"
      }
    ],
    "name": "prepareInstallation",
    "outputs": [
      {
        "internalType": "address",
        "name": "mainVotingPlugin",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "address[]",
            "name": "helpers",
            "type": "address[]"
          },
          {
            "components": [
              {
                "internalType": "enum PermissionLib.Operation",
                "name": "operation",
                "type": "uint8"
              },
              {
                "internalType": "address",
                "name": "where",
                "type": "address"
              },
              {
                "internalType": "address",
                "name": "who",
                "type": "address"
              },
              {
                "internalType": "address",
                "name": "condition",
                "type": "address"
              },
              {
                "internalType": "bytes32",
                "name": "permissionId",
                "type": "bytes32"
              }
            ],
            "internalType": "struct PermissionLib.MultiTargetPermission[]",
            "name": "permissions",
            "type": "tuple[]"
          }
        ],
        "internalType": "struct IPluginSetup.PreparedSetupData",
        "name": "preparedSetupData",
        "type": "tuple"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_dao",
        "type": "address"
      },
      {
        "components": [
          {
            "internalType": "address",
            "name": "plugin",
            "type": "address"
          },
          {
            "internalType": "address[]",
            "name": "currentHelpers",
            "type": "address[]"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct IPluginSetup.SetupPayload",
        "name": "_payload",
        "type": "tuple"
      }
    ],
    "name": "prepareUninstallation",
    "outputs": [
      {
        "components": [
          {
            "internalType": "enum PermissionLib.Operation",
            "name": "operation",
            "type": "uint8"
          },
          {
            "internalType": "address",
            "name": "where",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "who",
            "type": "address"
          },
          {
            "internalType": "address",
            "name": "condition",
            "type": "address"
          },
          {
            "internalType": "bytes32",
            "name": "permissionId",
            "type": "bytes32"
          }
        ],
        "internalType": "struct PermissionLib.MultiTargetPermission[]",
        "name": "permissionChanges",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_dao",
        "type": "address"
      },
      {
        "internalType": "uint16",
        "name": "_currentBuild",
        "type": "uint16"
      },
      {
        "components": [
          {
            "internalType": "address",
            "name": "plugin",
            "type": "address"
          },
          {
            "internalType": "address[]",
            "name": "currentHelpers",
            "type": "address[]"
          },
          {
            "internalType": "bytes",
            "name": "data",
            "type": "bytes"
          }
        ],
        "internalType": "struct IPluginSetup.SetupPayload",
        "name": "_payload",
        "type": "tuple"
      }
    ],
    "name": "prepareUpdate",
    "outputs": [
      {
        "internalType": "bytes",
        "name": "initData",
        "type": "bytes"
      },
      {
        "components": [
          {
            "internalType": "address[]",
            "name": "helpers",
            "type": "address[]"
          },
          {
            "components": [
              {
                "internalType": "enum PermissionLib.Operation",
                "name": "operation",
                "type": "uint8"
              },
              {
                "internalType": "address",
                "name": "where",
                "type": "address"
              },
              {
                "internalType": "address",
                "name": "who",
                "type": "address"
              },
              {
                "internalType": "address",
                "name": "condition",
                "type": "address"
              },
              {
                "internalType": "bytes32",
                "name": "permissionId",
                "type": "bytes32"
              }
            ],
            "internalType": "struct PermissionLib.MultiTargetPermission[]",
            "name": "permissions",
            "type": "tuple[]"
          }
        ],
        "internalType": "struct IPluginSetup.PreparedSetupData",
        "name": "preparedSetupData",
        "type": "tuple"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes4",
        "name": "_interfaceId",
        "type": "bytes4"
      }
    ],
    "name": "supportsInterface",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const