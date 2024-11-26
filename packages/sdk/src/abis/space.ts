export const abi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'dao',
        type: 'address',
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
        internalType: 'bytes32',
        name: 'permissionId',
        type: 'bytes32',
      },
    ],
    name: 'DaoUnauthorized',
    type: 'error',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'previousAdmin',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'newAdmin',
        type: 'address',
      },
    ],
    name: 'AdminChanged',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'beacon',
        type: 'address',
      },
    ],
    name: 'BeaconUpgraded',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'string',
        name: 'contentUri',
        type: 'string',
      },
    ],
    name: 'EditsPublished',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'uint8',
        name: 'version',
        type: 'uint8',
      },
    ],
    name: 'Initialized',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'subspaceDao',
        type: 'address',
      },
    ],
    name: 'SubspaceAccepted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'subspaceDao',
        type: 'address',
      },
    ],
    name: 'SubspaceRemoved',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'dao',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'predecessorSpace',
        type: 'address',
      },
    ],
    name: 'SuccessorSpaceCreated',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'implementation',
        type: 'address',
      },
    ],
    name: 'Upgraded',
    type: 'event',
  },
  {
    inputs: [],
    name: 'UPGRADE_PLUGIN_PERMISSION_ID',
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
        name: '_subspaceDao',
        type: 'address',
      },
    ],
    name: 'acceptSubspace',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'dao',
    outputs: [
      {
        internalType: 'contract IDAO',
        name: '',
        type: 'address',
      },
    ],
    stateMutability: 'view',
    type: 'function',
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
        internalType: 'contract IDAO',
        name: '_dao',
        type: 'address',
      },
      {
        internalType: 'string',
        name: '_firstContentUri',
        type: 'string',
      },
      {
        internalType: 'address',
        name: '_predecessorSpace',
        type: 'address',
      },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'pluginType',
    outputs: [
      {
        internalType: 'enum IPlugin.PluginType',
        name: '',
        type: 'uint8',
      },
    ],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [],
    name: 'proxiableUUID',
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
        internalType: 'string',
        name: '_contentUri',
        type: 'string',
      },
    ],
    name: 'publishEdits',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_subspaceDao',
        type: 'address',
      },
    ],
    name: 'removeSubspace',
    outputs: [],
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
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newImplementation',
        type: 'address',
      },
    ],
    name: 'upgradeTo',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'newImplementation',
        type: 'address',
      },
      {
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
] as const;
