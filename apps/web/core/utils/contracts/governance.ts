import { type Hex, encodeAbiParameters } from 'viem';

/**
 * Generates a random bytes16 value suitable for use as a proposal ID.
 *
 * Uses crypto.randomUUID() and converts it to a hex string without hyphens.
 * The result is a 32-character hex string (16 bytes) prefixed with 0x.
 */
export function generateProposalId(): Hex {
  const uuid = crypto.randomUUID();
  // Remove hyphens from UUID to get 32 hex characters (16 bytes)
  const hex = uuid.replace(/-/g, '');
  return `0x${hex}` as Hex;
}

/**
 * Converts a space ID string (without 0x prefix) to a hex bytes16 format.
 */
export function spaceIdToBytes16(spaceId: string): Hex {
  // Ensure the space ID is lowercase and has no prefix
  const cleanId = spaceId.toLowerCase().replace(/^0x/, '');
  return `0x${cleanId}` as Hex;
}

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
export function encodeProposalCreatedData(
  proposalId: Hex,
  votingMode: number,
  actions: ProposalAction[]
): Hex {
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
