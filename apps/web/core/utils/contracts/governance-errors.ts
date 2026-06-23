import { describeError } from '~/core/utils/error-diagnostics';

/**
 * DAOSpace / SpaceRegistry custom-error selectors mapped to a name + an
 * actionable hint. A revert comes back as a bare 4-byte selector when viem can't
 * decode it (the smart-account transaction doesn't carry the contract ABI), so
 * "Execute failed: 0xdf322356" is all the user — and our copied bug reports —
 * would otherwise see. Decoding it here turns every governance revert into a
 * named, actionable error so a report tells us the exact on-chain cause.
 *
 * Selectors are keccak256(errorSignature) truncated to 4 bytes (e.g.
 * `CanNotExecute()` -> 0xdf322356). Extend this table when the contracts add
 * errors; anything unmapped falls back to the raw cause chain.
 */
export type GovernanceRevert = { selector: string; name: string; hint: string };

/**
 * The DAO wraps any revert thrown by a proposal's own action in this opaque
 * error. For legacy editor/member proposals created before the action target was
 * fixed, the stored action calls a method that doesn't exist on its target
 * contract, so it reverts every time — the proposal is permanently dead and must
 * be recreated. Used to tell a recoverable "not executable yet" state apart from
 * a "this can never execute" one.
 */
export const ACTION_REVERTED_SELECTOR = '0x24c05f9a';

const REVERTS: readonly GovernanceRevert[] = [
  {
    selector: '0xdf322356',
    name: 'CanNotExecute',
    hint: "The chain won't execute this proposal — it may not have enough votes to meet quorum/threshold yet, its voting period may not have fully elapsed, or it was already executed.",
  },
  {
    selector: '0x543ffef7',
    name: 'CanNotVote',
    hint: 'The vote was rejected — voting has ended, you already voted, or you are not eligible.',
  },
  {
    selector: ACTION_REVERTED_SELECTOR,
    name: 'ActionReverted',
    hint: "This proposal can't be completed — one of its on-chain actions reverts when executed. Older editor and member requests can hit this permanently and need to be recreated.",
  },
  {
    selector: '0x0992f7ad',
    name: 'InvalidProposalId',
    hint: 'The proposal was not found on-chain — the indexer may be ahead of the chain.',
  },
  {
    selector: '0x196f9913',
    name: 'InvalidFromSpace',
    hint: 'Your personal space is not valid for this action — it may not be registered yet.',
  },
  {
    selector: '0x48f5c3ed',
    name: 'InvalidCaller',
    hint: 'The connected account is not authorized for this action in this space.',
  },
  {
    selector: '0x4a7f394f',
    name: 'InvalidAction',
    hint: 'The proposal contains an action the contract rejected.',
  },
  {
    selector: '0x3a9c66d4',
    name: 'FastPathRestricted',
    hint: 'Fast-path voting is not allowed for this proposal.',
  },
  {
    selector: '0x9c28247f',
    name: 'OneActionForFastPath',
    hint: 'Fast-path proposals must contain exactly one action.',
  },
  {
    selector: '0x48b38022',
    name: 'InvalidSpaceIdForRole',
    hint: 'The target space id is not valid for this membership role.',
  },
  {
    selector: '0xda581c0a',
    name: 'SpaceNotRegistered',
    hint: 'The space is not registered — a personal space may need to be created first.',
  },
  {
    selector: '0xd6bda275',
    name: 'FailedCall',
    hint: 'A low-level contract call failed during execution.',
  },
];

/**
 * Identify a governance revert from an error's cause chain — by decoded name
 * (when viem had the ABI) or by raw 4-byte selector (when it didn't).
 */
export function decodeGovernanceRevert(error: unknown): GovernanceRevert | null {
  const description = describeError(error).toLowerCase();
  return REVERTS.find(r => description.includes(r.selector) || description.includes(r.name.toLowerCase())) ?? null;
}

/**
 * Human-readable, actionable message for a governance revert; falls back to the
 * raw cause chain for anything not in the table.
 */
export function describeGovernanceError(error: unknown): string {
  const revert = decodeGovernanceRevert(error);
  return revert ? `${revert.name}: ${revert.hint} (${revert.selector})` : describeError(error);
}
