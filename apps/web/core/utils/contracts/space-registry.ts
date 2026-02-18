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
  /** keccak256('GOVERNANCE.PROPOSAL_CREATED') - creates a proposal (slow or fast path depending on VotingMode) */
  PROPOSAL_CREATED: '0xcf4356ed126c00d2e547ace2f69991a972d322b45371d61ce5478b1cb9acb4c2' as Hex,
  /** keccak256('GOVERNANCE.PROPOSAL_VOTED') - votes on a proposal */
  PROPOSAL_VOTED: '0x4ebf5f29676cedf7e2e4d346a8433289278f95a9fda73691dc1ce24574d5819e' as Hex,
  /** keccak256('GOVERNANCE.PROPOSAL_EXECUTED') - executes a passed proposal */
  PROPOSAL_EXECUTED: '0x62a60c0a9681612871e0dafa0f24bb0c83cbdde8be5a6299979c88d382369e96' as Hex,

  // Subspace management actions
  /** keccak256('GOVERNANCE.SUBSPACE_VERIFIED') - marks a subspace as verified */
  SUBSPACE_VERIFIED: '0xf78431edee20f4edc4766f7e4cd7ee37bf3d84514d93d8ff7e8d8b32dc8ccd39' as Hex,
  /** keccak256('GOVERNANCE.SUBSPACE_UNVERIFIED') - removes verified status from a subspace */
  SUBSPACE_UNVERIFIED: '0xbdcdbf5035c18cc3895457ce405cafbe8d62b8ca33d2a4e78db1e0b7897c9c34' as Hex,
  /** keccak256('GOVERNANCE.SUBSPACE_RELATED') - marks a subspace as related */
  SUBSPACE_RELATED: '0xe1dfc59a5ffb6192be6bd82457a48b1b675f4ff2886a6c1471f5c47631448de5' as Hex,
  /** keccak256('GOVERNANCE.SUBSPACE_UNRELATED') - removes related status from a subspace */
  SUBSPACE_UNRELATED: '0xa5ad9ae41010e3b9b1d8db394f518a795fcee6b8e4dacf924fd493f2fa8fa79c' as Hex,
  /** keccak256('GOVERNANCE.SUBSPACE_TOPIC_DECLARED') - declares a subtopic for a subspace using an entity UUID */
  SUBSPACE_TOPIC_DECLARED: '0xf475121947612f07c138e5ac27aa31355aaea0da3096cea1b702daeb5e8477aa' as Hex,
  /** keccak256('GOVERNANCE.SUBSPACE_TOPIC_REMOVED') - removes a subtopic from a subspace */
  SUBSPACE_TOPIC_REMOVED: '0x98ee515a05d2eb17f8e4c1e997a36ee6a8eca03af78d98943787935f9e39adda' as Hex,
} as const;

/**
 * DAOSpace voting modes
 */
export const VOTING_MODE = {
  /** Slow path - percentage threshold, wait for voting period */
  SLOW: 0,
  /** Fast path - flat count threshold, immediate execution */
  FAST: 1,
} as const;

/**
 * Minimal DAOSpace ABI for governance actions.
 *
 * The DAOSpace contract manages proposals, voting, and role-based access.
 * This partial ABI includes only the functions needed for governance operations
 * (membership management, subspace management via ping).
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
  {
    inputs: [
      { internalType: 'bytes32', name: '_action', type: 'bytes32' },
      { internalType: 'bytes32', name: '_topic', type: 'bytes32' },
      { internalType: 'bytes', name: '_data', type: 'bytes' },
    ],
    name: 'ping',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export const ZERO_SPACE_ID = '0x00000000000000000000000000000000' as Hex;

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
  {
    inputs: [{ internalType: 'address', name: '_account', type: 'address' }],
    name: 'addressToSpaceId',
    outputs: [{ internalType: 'bytes16', name: '_spaceId', type: 'bytes16' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
