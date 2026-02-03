import { type Hex, encodeAbiParameters } from 'viem';

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
