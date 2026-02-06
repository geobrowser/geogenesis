import { type Hex, encodeAbiParameters } from 'viem';

/**
 * DAOSpace VoteOption enum values matching the Solidity contract.
 * Used for encoding votes in PROPOSAL_VOTED actions.
 */
export const VoteOption = {
  None: 0,
  Yes: 1,
  No: 2,
  Abstain: 3,
} as const;

export type VoteOptionType = (typeof VoteOption)[keyof typeof VoteOption];

/**
 * Encodes the data payload for a MEMBERSHIP_REQUESTED action.
 *
 * @param proposalId - bytes16 proposal ID
 * @param newMemberSpaceId - bytes16 space ID of the user requesting membership
 * @returns Encoded bytes for use in SpaceRegistry.enter()
 */
export function encodeMembershipRequestData(proposalId: Hex, newMemberSpaceId: Hex): Hex {
  return encodeAbiParameters(
    [
      { name: 'proposalId', type: 'bytes16' },
      { name: 'newMemberSpaceId', type: 'bytes16' },
    ],
    [proposalId, newMemberSpaceId]
  );
}

/**
 * Represents a single action to be executed as part of a proposal.
 */
export interface ProposalAction {
  /** Target contract address */
  to: Hex;
  /** Value to send (usually 0n) */
  value: bigint;
  /** Encoded function call data */
  data: Hex;
}

/**
 * Encodes the data payload for a PROPOSAL_CREATED action (slow path).
 *
 * @param proposalId - bytes16 proposal ID
 * @param votingMode - 0 for FAST, 1 for SLOW
 * @param actions - Array of actions to execute if proposal passes
 * @returns Encoded bytes for use in SpaceRegistry.enter()
 */
export function encodeProposalCreatedData(proposalId: Hex, votingMode: number, actions: ProposalAction[]): Hex {
  return encodeAbiParameters(
    [
      { name: 'proposalId', type: 'bytes16' },
      { name: 'votingMode', type: 'uint8' },
      {
        name: 'actions',
        type: 'tuple[]',
        components: [
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    [proposalId, votingMode, actions]
  );
}

/**
 * Encodes the data payload for a PROPOSAL_VOTED action.
 *
 * @param proposalId - bytes16 proposal ID
 * @param voteOption - VoteOption enum value (1=Yes, 2=No, 3=Abstain)
 * @returns Encoded bytes for use in SpaceRegistry.enter()
 */
export function encodeProposalVotedData(proposalId: Hex, voteOption: VoteOptionType): Hex {
  return encodeAbiParameters(
    [
      { name: 'proposalId', type: 'bytes16' },
      { name: 'voteOption', type: 'uint8' },
    ],
    [proposalId, voteOption]
  );
}

/**
 * Encodes the data payload for a PROPOSAL_EXECUTED action.
 *
 * @param proposalId - bytes16 proposal ID
 * @returns Encoded bytes for use in SpaceRegistry.enter()
 */
export function encodeProposalExecutedData(proposalId: Hex): Hex {
  return encodeAbiParameters([{ name: 'proposalId', type: 'bytes16' }], [proposalId]);
}

/**
 * The types of subspace relationships that can be set.
 *
 * - Verified: The parent space has verified the subspace
 * - Related: The parent space considers the subspace related
 * - Subtopic: The subspace is categorized under a specific topic entity (identified by UUID)
 */
export type SubspaceRelationType = 'verified' | 'related' | 'subtopic';

/**
 * Pads a bytes16 hex string (32 hex chars) to bytes32 (64 hex chars) for use as topic.
 *
 * @param bytes16Hex - A hex string representing bytes16 (with or without 0x prefix)
 * @returns A bytes32 hex string padded with trailing zeros
 * @throws Error if input is not a valid bytes16 hex string
 *
 * @example
 * padBytes16ToBytes32('0x1234567890abcdef1234567890abcdef')
 * // Returns: '0x1234567890abcdef1234567890abcdef00000000000000000000000000000000'
 */
export function padBytes16ToBytes32(bytes16Hex: string): Hex {
  const BYTES16_HEX_LENGTH = 32; // 16 bytes = 32 hex chars
  const BYTES32_HEX_LENGTH = 64; // 32 bytes = 64 hex chars

  const withoutPrefix = bytes16Hex.startsWith('0x') ? bytes16Hex.slice(2) : bytes16Hex;

  if (withoutPrefix.length !== BYTES16_HEX_LENGTH) {
    throw new Error(
      `Invalid bytes16 hex string: expected ${BYTES16_HEX_LENGTH} hex characters, got ${withoutPrefix.length}`
    );
  }

  // Validate hex characters
  if (!/^[0-9a-fA-F]+$/.test(withoutPrefix)) {
    throw new Error('Invalid bytes16 hex string: contains non-hex characters');
  }

  const paddingLength = BYTES32_HEX_LENGTH - BYTES16_HEX_LENGTH;
  return `0x${withoutPrefix}${'0'.repeat(paddingLength)}` as Hex;
}
