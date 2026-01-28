import { type Hex } from 'viem';

export const EMPTY_SPACE_ID = '0x00000000000000000000000000000000' as const;

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/**
 * SpaceRegistry address (Geo Testnet)
 */
export const SPACE_REGISTRY_ADDRESS = '0xB01683b2f0d38d43fcD4D9aAB980166988924132' as const;

export const EMPTY_SPACE_ID_HEX = EMPTY_SPACE_ID as Hex;
export const ZERO_ADDRESS_HEX = ZERO_ADDRESS as Hex;
export const SPACE_REGISTRY_ADDRESS_HEX = SPACE_REGISTRY_ADDRESS as Hex;

export const EMPTY_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
export const EMPTY_TOPIC_HEX = EMPTY_TOPIC as Hex;

export const SpaceRegistryAbi = [
  { inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ internalType: 'address', name: 'target', type: 'address' }], name: 'AddressEmptyCode', type: 'error' },
  {
    inputs: [{ internalType: 'address', name: 'implementation', type: 'address' }],
    name: 'ERC1967InvalidImplementation',
    type: 'error',
  },
  { inputs: [], name: 'ERC1967NonPayable', type: 'error' },
  { inputs: [], name: 'FailedCall', type: 'error' },
  { inputs: [], name: 'InvalidCaller', type: 'error' },
  { inputs: [], name: 'InvalidInitialization', type: 'error' },
  { inputs: [], name: 'NotInitializing', type: 'error' },
  { inputs: [{ internalType: 'address', name: 'owner', type: 'address' }], name: 'OwnableInvalidOwner', type: 'error' },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
    type: 'error',
  },
  { inputs: [], name: 'SpaceAlreadyRegistered', type: 'error' },
  { inputs: [], name: 'SpaceNotRegistered', type: 'error' },
  { inputs: [], name: 'UUPSUnauthorizedCallContext', type: 'error' },
  {
    inputs: [{ internalType: 'bytes32', name: 'slot', type: 'bytes32' }],
    name: 'UUPSUnsupportedProxiableUUID',
    type: 'error',
  },
  {
    anonymous: true,
    inputs: [
      { indexed: true, internalType: 'bytes16', name: 'fromSpaceId', type: 'bytes16' },
      { indexed: true, internalType: 'bytes16', name: 'toSpaceId', type: 'bytes16' },
      { indexed: true, internalType: 'bytes32', name: 'action', type: 'bytes32' },
      { indexed: true, internalType: 'bytes32', name: 'topic', type: 'bytes32' },
      { indexed: false, internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'Action',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: 'uint64', name: 'version', type: 'uint64' }],
    name: 'Initialized',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'previousOwner', type: 'address' },
      { indexed: true, internalType: 'address', name: 'newOwner', type: 'address' },
    ],
    name: 'OwnershipTransferred',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: 'address', name: 'implementation', type: 'address' }],
    name: 'Upgraded',
    type: 'event',
  },
  {
    inputs: [],
    name: 'UPGRADE_INTERFACE_VERSION',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes16', name: '_spaceId', type: 'bytes16' },
      { internalType: 'bytes32', name: '_type', type: 'bytes32' },
      { internalType: 'bytes', name: '_version', type: 'bytes' },
    ],
    name: 'acceptSpaceMigration',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_account', type: 'address' }],
    name: 'addressToSpaceId',
    outputs: [{ internalType: 'bytes16', name: '_spaceId', type: 'bytes16' }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'clearSpaceId', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  {
    inputs: [
      { internalType: 'bytes16', name: '_fromSpaceId', type: 'bytes16' },
      { internalType: 'bytes16', name: '_toSpaceId', type: 'bytes16' },
      { internalType: 'bytes32', name: '_action', type: 'bytes32' },
      { internalType: 'bytes32', name: '_topic', type: 'bytes32' },
      { internalType: 'bytes', name: '_data', type: 'bytes' },
      { internalType: 'bytes', name: '_signature', type: 'bytes' },
    ],
    name: 'enter',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: '_account', type: 'address' },
      { internalType: 'uint256', name: '_nonce', type: 'uint256' },
    ],
    name: 'generateSpaceId',
    outputs: [{ internalType: 'bytes16', name: '_spaceId', type: 'bytes16' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes', name: '_initializerData', type: 'bytes' }],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'name',
    outputs: [{ internalType: 'string', name: '_name', type: 'string' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: '_action', type: 'bytes32' }],
    name: 'permissionlessActions',
    outputs: [{ internalType: 'bool', name: '_isPermissionless', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '_newAccount', type: 'address' }],
    name: 'proposeSpaceMigration',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'proxiableUUID',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: '_type', type: 'bytes32' },
      { internalType: 'bytes', name: '_version', type: 'bytes' },
    ],
    name: 'registerSpaceId',
    outputs: [{ internalType: 'bytes16', name: '_spaceId', type: 'bytes16' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  { inputs: [], name: 'renounceOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  {
    inputs: [
      { internalType: 'bytes32', name: '_action', type: 'bytes32' },
      { internalType: 'bool', name: '_isPermissionless', type: 'bool' },
    ],
    name: 'setPermissionlessAction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes16', name: '_spaceId', type: 'bytes16' }],
    name: 'spaceIdToAddress',
    outputs: [{ internalType: 'address', name: '_account', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes16', name: '_spaceId', type: 'bytes16' }],
    name: 'spaceIdToProposedAddress',
    outputs: [{ internalType: 'address', name: '_account', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'newOwner', type: 'address' }],
    name: 'transferOwnership',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'typeId',
    outputs: [{ internalType: 'bytes32', name: '_type', type: 'bytes32' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'address', name: 'newImplementation', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'upgradeToAndCall',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'version',
    outputs: [{ internalType: 'string', name: '_version', type: 'string' }],
    stateMutability: 'pure',
    type: 'function',
  },
] as const;
