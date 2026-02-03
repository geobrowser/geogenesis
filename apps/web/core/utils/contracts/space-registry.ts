import { type Hex } from 'viem';

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

/**
 * SpaceRegistry address (Geo Testnet)
 */
export const SPACE_REGISTRY_ADDRESS = '0xB01683b2f0d38d43fcD4D9aAB980166988924132' as const;

export const ZERO_ADDRESS_HEX = ZERO_ADDRESS as Hex;
export const SPACE_REGISTRY_ADDRESS_HEX = SPACE_REGISTRY_ADDRESS as Hex;

export const EMPTY_TOPIC = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
export const EMPTY_TOPIC_HEX = EMPTY_TOPIC as Hex;

export const EMPTY_SIGNATURE = '0x' as Hex;

/**
 * DAOSpace governance action constants (bytes32)
 *
 * These are keccak256 hashes matching the Solidity constants in ActionsConstants.sol.
 * Used as the `_action` parameter in SpaceRegistry.enter()
 */
export const GOVERNANCE_ACTIONS = {
  /** keccak256('GOVERNANCE.MEMBERSHIP_REQUESTED') - creates a fast-path proposal */
  MEMBERSHIP_REQUESTED: '0xe048e0dc301b1bb4e2446608d8858ecf95c326d7241c9943b14f647fd3a78d9a' as Hex,
  /** keccak256('GOVERNANCE.PROPOSAL_CREATED') - creates a slow-path proposal */
  PROPOSAL_CREATED: '0xcf4356ed126c00d2e547ace2f69991a972d322b45371d61ce5478b1cb9acb4c2' as Hex,
} as const;

/**
 * DAOSpace voting modes
 */
export const VOTING_MODE = {
  /** Fast path - flat count threshold, immediate execution */
  FAST: 0,
  /** Slow path - percentage threshold, wait for voting period */
  SLOW: 1,
} as const;

/**
 * Minimal DAOSpace ABI for governance actions.
 *
 * The DAOSpace contract manages proposals, voting, and role-based access.
 * This partial ABI includes only the functions needed for membership operations.
 */
export const DAOSpaceAbi = [
  {
    inputs: [{ internalType: 'bytes16', name: '_newMemberSpaceId', type: 'bytes16' }],
    name: 'addMember',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes16', name: '_oldMemberSpaceId', type: 'bytes16' }],
    name: 'removeMember',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes16', name: '_newEditorSpaceId', type: 'bytes16' }],
    name: 'addEditor',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes16', name: '_oldEditorSpaceId', type: 'bytes16' }],
    name: 'removeEditor',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

/**
 * Minimal SpaceRegistry ABI - only includes functions used by this app.
 */
export const SpaceRegistryAbi = [
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
] as const;
