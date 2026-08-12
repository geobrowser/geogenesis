import { ACTION_REVERTED_SELECTOR, type GovernanceRevert } from './governance-errors';

/**
 * Whether a passed proposal can actually be executed on-chain, and if not, why.
 *
 * - `checking`   — still probing (or no registered account to simulate from)
 * - `executable` — the execute call would succeed
 * - `dead`       — it can never execute and must be recreated: either the DAO has
 *                  no such proposal, or the proposal's own action reverts
 * - `blocked`    — some other governance revert (already executed, not enough
 *                  votes, voting period not elapsed) — transient or resolved
 */
export type ProposalExecutability = 'checking' | 'executable' | 'dead' | 'blocked';

/**
 * Decide a proposal's executability from the two independent signals we can
 * gather: whether the DAO knows the proposal at all, and what simulating its
 * execute call reverts with.
 *
 * Pure so the classification is testable without a chain. The reason it exists
 * separately from the probing is that the previous single-signal version quietly
 * mislabelled a whole class of proposals: it keyed only on the revert selector and
 * treated everything that was not `ActionReverted` as `blocked` — i.e. transient.
 * A proposal that the DAO has never heard of reverts `CanNotExecute()`, so it
 * landed in `blocked`, the UI kept showing the "Pending execution" fallback, and
 * it did so forever. Migration-only proposals (present in the indexer database,
 * never created on chain) sat like that indefinitely.
 *
 * `existsOnChain === false` therefore wins over any simulation result: it is the
 * one signal that distinguishes "cannot execute yet" from "can never execute".
 * Note the two false-negative traps that make the weaker signals unusable here —
 * `canExecuteProposal` and `isSupportThresholdReached` both return `false` for a
 * proposal id that does not exist, so neither can tell absence from "hasn't
 * passed yet"; only the version lookup discriminates.
 */
export function classifyProposalExecutability({
  existsOnChain,
  simulationRevert,
}: {
  /** `false` = the DAO has no such proposal. `null` = could not determine. */
  existsOnChain: boolean | null;
  /**
   * Decoded revert from simulating execute: `null` when it would not revert (or
   * the failure was unrecognisable), `undefined` when no simulation was run.
   */
  simulationRevert: GovernanceRevert | null | undefined;
}): ProposalExecutability {
  // Absent from the DAO is permanent and knowable without a wallet, so it is
  // checked before anything that needs one.
  if (existsOnChain === false) return 'dead';

  if (simulationRevert === undefined) return 'checking';

  // Includes the unrecognisable-failure case: fail open so a flaky RPC or an
  // unknown revert never hides a legitimate action behind a dead-end label.
  if (simulationRevert === null) return 'executable';

  return simulationRevert.selector === ACTION_REVERTED_SELECTOR ? 'dead' : 'blocked';
}
