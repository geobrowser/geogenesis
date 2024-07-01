export const abi = [
  {
    inputs: [],
    stateMutability: 'nonpayable',
    type: 'constructor',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'index',
        type: 'uint256',
      },
    ],
    name: 'ActionFailed',
    type: 'error',
  },
  {
    inputs: [],
    name: 'AnyAddressDisallowedForWhoAndWhere',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'contract IPermissionCondition',
        name: 'condition',
        type: 'address',
      },
    ],
    name: 'ConditionInterfacNotSupported',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'contract IPermissionCondition',
        name: 'condition',
        type: 'address',
      },
    ],
    name: 'ConditionNotAContract',
    type: 'error',
  },
  {
    inputs: [],
    name: 'GrantWithConditionNotSupported',
    type: 'error',
  },
  {
    inputs: [],
    name: 'InsufficientGas',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint256',
        name: 'expected',
        type: 'uint256',
      },
      {
        internalType: 'uint256',
        name: 'actual',
        type: 'uint256',
      },
    ],
    name: 'NativeTokenDepositAmountMismatch',
    type: 'error',
  },
  {
    inputs: [
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
      {
        internalType: 'address',
        name: 'currentCondition',
        type: 'address',
      },
      {
        internalType: 'address',
        name: 'newCondition',
        type: 'address',
      },
    ],
    name: 'PermissionAlreadyGrantedForDifferentCondition',
    type: 'error',
  },
  {
    inputs: [],
    name: 'PermissionsForAnyAddressDisallowed',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'uint8[3]',
        name: 'protocolVersion',
        type: 'uint8[3]',
      },
    ],
    name: 'ProtocolVersionUpgradeNotSupported',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ReentrantCall',
    type: 'error',
  },
  {
    inputs: [],
    name: 'TooManyActions',
    type: 'error',
  },
  {
    inputs: [
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
    name: 'Unauthorized',
    type: 'error',
  },
  {
    inputs: [
      {
        internalType: 'bytes4',
        name: 'callbackSelector',
        type: 'bytes4',
      },
      {
        internalType: 'bytes4',
        name: 'magicNumber',
        type: 'bytes4',
      },
    ],
    name: 'UnkownCallback',
    type: 'error',
  },
  {
    inputs: [],
    name: 'ZeroAmount',
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
        name: 'sender',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'bytes4',
        name: 'sig',
        type: 'bytes4',
      },
      {
        indexed: false,
        internalType: 'bytes',
        name: 'data',
        type: 'bytes',
      },
    ],
    name: 'CallbackReceived',
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
        name: 'token',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'string',
        name: '_reference',
        type: 'string',
      },
    ],
    name: 'Deposited',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'address',
        name: 'actor',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'bytes32',
        name: 'callId',
        type: 'bytes32',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'to',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'value',
            type: 'uint256',
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes',
          },
        ],
        indexed: false,
        internalType: 'struct IDAO.Action[]',
        name: 'actions',
        type: 'tuple[]',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'allowFailureMap',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'failureMap',
        type: 'uint256',
      },
      {
        indexed: false,
        internalType: 'bytes[]',
        name: 'execResults',
        type: 'bytes[]',
      },
    ],
    name: 'Executed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'permissionId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'here',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'where',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'who',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'condition',
        type: 'address',
      },
    ],
    name: 'Granted',
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
        internalType: 'bytes',
        name: 'metadata',
        type: 'bytes',
      },
    ],
    name: 'MetadataSet',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'sender',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'uint256',
        name: 'amount',
        type: 'uint256',
      },
    ],
    name: 'NativeTokenDeposited',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'string',
        name: 'daoURI',
        type: 'string',
      },
    ],
    name: 'NewURI',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: 'bytes32',
        name: 'permissionId',
        type: 'bytes32',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'here',
        type: 'address',
      },
      {
        indexed: false,
        internalType: 'address',
        name: 'where',
        type: 'address',
      },
      {
        indexed: true,
        internalType: 'address',
        name: 'who',
        type: 'address',
      },
    ],
    name: 'Revoked',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'signatureValidator',
        type: 'address',
      },
    ],
    name: 'SignatureValidatorSet',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'bytes4',
        name: 'interfaceId',
        type: 'bytes4',
      },
      {
        indexed: false,
        internalType: 'bytes4',
        name: 'callbackSelector',
        type: 'bytes4',
      },
      {
        indexed: false,
        internalType: 'bytes4',
        name: 'magicNumber',
        type: 'bytes4',
      },
    ],
    name: 'StandardCallbackRegistered',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: false,
        internalType: 'address',
        name: 'forwarder',
        type: 'address',
      },
    ],
    name: 'TrustedForwarderSet',
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
    stateMutability: 'nonpayable',
    type: 'fallback',
  },
  {
    inputs: [],
    name: 'EXECUTE_PERMISSION_ID',
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
    name: 'REGISTER_STANDARD_CALLBACK_PERMISSION_ID',
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
    name: 'ROOT_PERMISSION_ID',
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
    name: 'SET_METADATA_PERMISSION_ID',
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
    name: 'SET_SIGNATURE_VALIDATOR_PERMISSION_ID',
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
    name: 'SET_TRUSTED_FORWARDER_PERMISSION_ID',
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
    name: 'UPGRADE_DAO_PERMISSION_ID',
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
        name: '_items',
        type: 'tuple[]',
      },
    ],
    name: 'applyMultiTargetPermissions',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_where',
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
            name: 'who',
            type: 'address',
          },
          {
            internalType: 'bytes32',
            name: 'permissionId',
            type: 'bytes32',
          },
        ],
        internalType: 'struct PermissionLib.SingleTargetPermission[]',
        name: 'items',
        type: 'tuple[]',
      },
    ],
    name: 'applySingleTargetPermissions',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'daoURI',
    outputs: [
      {
        internalType: 'string',
        name: '',
        type: 'string',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_token',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: '_amount',
        type: 'uint256',
      },
      {
        internalType: 'string',
        name: '_reference',
        type: 'string',
      },
    ],
    name: 'deposit',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes32',
        name: '_callId',
        type: 'bytes32',
      },
      {
        components: [
          {
            internalType: 'address',
            name: 'to',
            type: 'address',
          },
          {
            internalType: 'uint256',
            name: 'value',
            type: 'uint256',
          },
          {
            internalType: 'bytes',
            name: 'data',
            type: 'bytes',
          },
        ],
        internalType: 'struct IDAO.Action[]',
        name: '_actions',
        type: 'tuple[]',
      },
      {
        internalType: 'uint256',
        name: '_allowFailureMap',
        type: 'uint256',
      },
    ],
    name: 'execute',
    outputs: [
      {
        internalType: 'bytes[]',
        name: 'execResults',
        type: 'bytes[]',
      },
      {
        internalType: 'uint256',
        name: 'failureMap',
        type: 'uint256',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getTrustedForwarder',
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
        name: '_where',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_who',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: '_permissionId',
        type: 'bytes32',
      },
    ],
    name: 'grant',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_where',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_who',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: '_permissionId',
        type: 'bytes32',
      },
      {
        internalType: 'contract IPermissionCondition',
        name: '_condition',
        type: 'address',
      },
    ],
    name: 'grantWithCondition',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_where',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_who',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: '_permissionId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes',
        name: '_data',
        type: 'bytes',
      },
    ],
    name: 'hasPermission',
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
        internalType: 'bytes',
        name: '_metadata',
        type: 'bytes',
      },
      {
        internalType: 'address',
        name: '_initialOwner',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_trustedForwarder',
        type: 'address',
      },
      {
        internalType: 'string',
        name: 'daoURI_',
        type: 'string',
      },
    ],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'uint8[3]',
        name: '_previousProtocolVersion',
        type: 'uint8[3]',
      },
      {
        internalType: 'bytes',
        name: '_initData',
        type: 'bytes',
      },
    ],
    name: 'initializeFrom',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_where',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_who',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: '_permissionId',
        type: 'bytes32',
      },
      {
        internalType: 'bytes',
        name: '_data',
        type: 'bytes',
      },
    ],
    name: 'isGranted',
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
        internalType: 'bytes32',
        name: '_hash',
        type: 'bytes32',
      },
      {
        internalType: 'bytes',
        name: '_signature',
        type: 'bytes',
      },
    ],
    name: 'isValidSignature',
    outputs: [
      {
        internalType: 'bytes4',
        name: '',
        type: 'bytes4',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'protocolVersion',
    outputs: [
      {
        internalType: 'uint8[3]',
        name: '',
        type: 'uint8[3]',
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
        internalType: 'bytes4',
        name: '_interfaceId',
        type: 'bytes4',
      },
      {
        internalType: 'bytes4',
        name: '_callbackSelector',
        type: 'bytes4',
      },
      {
        internalType: 'bytes4',
        name: '_magicNumber',
        type: 'bytes4',
      },
    ],
    name: 'registerStandardCallback',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_where',
        type: 'address',
      },
      {
        internalType: 'address',
        name: '_who',
        type: 'address',
      },
      {
        internalType: 'bytes32',
        name: '_permissionId',
        type: 'bytes32',
      },
    ],
    name: 'revoke',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'string',
        name: 'newDaoURI',
        type: 'string',
      },
    ],
    name: 'setDaoURI',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'bytes',
        name: '_metadata',
        type: 'bytes',
      },
    ],
    name: 'setMetadata',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_signatureValidator',
        type: 'address',
      },
    ],
    name: 'setSignatureValidator',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: '_newTrustedForwarder',
        type: 'address',
      },
    ],
    name: 'setTrustedForwarder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'signatureValidator',
    outputs: [
      {
        internalType: 'contract IERC1271',
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
        internalType: 'bytes4',
        name: 'interfaceId',
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
  {
    stateMutability: 'payable',
    type: 'receive',
  },
] as const
