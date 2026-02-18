import type { Hex } from 'viem';

export const DAO_SPACE_FACTORY_ADDRESS = '0x19f56F9Ed2c2ED2B5884668E392DcA4396F7feBd' as const;

export type VotingSettings = {
  slowPathPercentageThreshold: bigint;
  fastPathFlatThreshold: bigint;
  quorum: bigint;
  duration: bigint;
};

export const DEFAULT_VOTING_SETTINGS: VotingSettings = {
  slowPathPercentageThreshold: 510000n, // 51% for slow path (RATIO_BASE is 10^6)
  fastPathFlatThreshold: 0n, // 0 votes for fast path (auto-executes on first YES vote)
  quorum: 1n, // 1 vote quorum
  duration: 1n * 24n * 60n * 60n, // 1 day in seconds
};

export const EMPTY_SPACE_ID = '0x00000000000000000000000000000000' as Hex;

export const DaoSpaceFactoryAbi = [
  { inputs: [], stateMutability: 'nonpayable', type: 'constructor' },
  { inputs: [{ internalType: 'address', name: 'target', type: 'address' }], name: 'AddressEmptyCode', type: 'error' },
  {
    inputs: [{ internalType: 'address', name: 'implementation', type: 'address' }],
    name: 'ERC1967InvalidImplementation',
    type: 'error',
  },
  { inputs: [], name: 'ERC1967NonPayable', type: 'error' },
  { inputs: [], name: 'FailedCall', type: 'error' },
  { inputs: [], name: 'InvalidInitialization', type: 'error' },
  { inputs: [], name: 'NotInitializing', type: 'error' },
  { inputs: [{ internalType: 'address', name: 'owner', type: 'address' }], name: 'OwnableInvalidOwner', type: 'error' },
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'OwnableUnauthorizedAccount',
    type: 'error',
  },
  { inputs: [], name: 'UUPSUnauthorizedCallContext', type: 'error' },
  {
    inputs: [{ internalType: 'bytes32', name: 'slot', type: 'bytes32' }],
    name: 'UUPSUnsupportedProxiableUUID',
    type: 'error',
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
      {
        components: [
          { internalType: 'uint256', name: 'slowPathPercentageThreshold', type: 'uint256' },
          { internalType: 'uint256', name: 'fastPathFlatThreshold', type: 'uint256' },
          { internalType: 'uint256', name: 'quorum', type: 'uint256' },
          { internalType: 'uint256', name: 'duration', type: 'uint256' },
        ],
        internalType: 'struct IDAOSpace.VotingSettings',
        name: '_votingSettings',
        type: 'tuple',
      },
      { internalType: 'bytes16[]', name: '_initialEditors', type: 'bytes16[]' },
      { internalType: 'bytes16[]', name: '_initialMembers', type: 'bytes16[]' },
      { internalType: 'bytes', name: '_initialEditsContentUri', type: 'bytes' },
      { internalType: 'bytes', name: '_initialEditsMetadata', type: 'bytes' },
      { internalType: 'bytes16', name: '_initialTopicId', type: 'bytes16' },
      { internalType: 'bytes', name: '_initialTopicData', type: 'bytes' },
    ],
    name: 'createDAOSpaceProxy',
    outputs: [{ internalType: 'address', name: '_newDAOSpaceProxy', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'daoSpaceBeacon',
    outputs: [{ internalType: 'address', name: '_daoSpaceBeacon', type: 'address' }],
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
    inputs: [],
    name: 'proxiableUUID',
    outputs: [{ internalType: 'bytes32', name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  { inputs: [], name: 'renounceOwnership', outputs: [], stateMutability: 'nonpayable', type: 'function' },
  {
    inputs: [],
    name: 'spaceRegistry',
    outputs: [{ internalType: 'contract ISpaceRegistry', name: '_spaceRegistry', type: 'address' }],
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
