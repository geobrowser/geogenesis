import { type Hex, encodeAbiParameters } from 'viem';

/** An action that targets no address — used when the action targets a space id instead. */
export const ZERO_ADDRESS: Hex = '0x0000000000000000000000000000000000000000';

/** An action that targets no space — used when the action targets an address instead. */
export const ZERO_SPACE_ID: Hex = '0x00000000000000000000000000000000';

/**
 * Represents a single action to be executed as part of a proposal.
 *
 * An action targets EITHER a contract address or a space id, never both and never
 * neither — the contract resolves a space id to its address at execution time. This
 * mirrors the SDK's `normalizeProposalActions`.
 */
export interface ProposalAction {
  /** Target contract address. `ZERO_ADDRESS` when targeting a space id instead. */
  toAddress: Hex;
  /** Target space id (bytes16). Defaults to `ZERO_SPACE_ID` when targeting an address. */
  toSpaceId?: Hex;
  /** Value to send (usually 0n) */
  value: bigint;
  /** Encoded function call data */
  data: Hex;
}

/**
 * Encodes the data payload for a PROPOSAL_CREATED action.
 *
 * The action tuple MUST stay byte-compatible with the SDK's `encodeCreateProposal`
 * (geo-sdk `dist/src/client/dao-spaces.js`), which is what the deployed contracts
 * decode. It carries four fields; the `toSpaceId` field was added in the v2 redeploy.
 *
 * Getting this wrong does not produce a clean revert: the missing field shifts every
 * subsequent offset, so the contract reads a garbage length prefix for the dynamic
 * `data` field and dies with "out of memory". That failure mode cost us the subspace
 * and DAO-topic write paths, so `governance.test.ts` pins the layout against calldata
 * the SDK itself produces.
 *
 * @param proposalId - bytes16 proposal ID
 * @param votingMode - 0 for SLOW, 1 for FAST (matches Solidity enum VotingMode { Slow, Fast })
 * @param actions - Array of actions to execute if proposal passes
 * @returns Encoded bytes for use in SpaceRegistry.enter()
 */
export function encodeProposalCreatedData(proposalId: Hex, votingMode: number, actions: ProposalAction[]): Hex {
  const normalized = actions.map((action, index) => {
    const toSpaceId = action.toSpaceId ?? ZERO_SPACE_ID;
    const targetsAddress = action.toAddress.toLowerCase() !== ZERO_ADDRESS;
    const targetsSpace = toSpaceId.toLowerCase() !== ZERO_SPACE_ID;

    // Fail here rather than let the contract revert opaquely. Both-or-neither is
    // always a caller bug, and the on-chain error would not say so.
    if (targetsAddress && targetsSpace) {
      throw new Error(`actions[${index}] must target either toAddress or toSpaceId, not both`);
    }
    if (!targetsAddress && !targetsSpace) {
      throw new Error(`actions[${index}] must target either toAddress or toSpaceId`);
    }

    return { toAddress: action.toAddress, toSpaceId, value: action.value, data: action.data };
  });

  return encodeAbiParameters(
    [
      { name: 'proposalId', type: 'bytes16' },
      { name: 'votingMode', type: 'uint8' },
      {
        name: 'actions',
        type: 'tuple[]',
        components: [
          { name: 'toAddress', type: 'address' },
          { name: 'toSpaceId', type: 'bytes16' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    [proposalId, votingMode, normalized]
  );
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
