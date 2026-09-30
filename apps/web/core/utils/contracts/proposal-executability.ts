import {
  ACTION_REVERTED_SELECTOR,
  type GovernanceRevert,
  INVALID_SPACE_ID_FOR_ROLE_SELECTOR,
} from './governance-errors';

/**
 * Whether a passed proposal can actually be executed on-chain, and if not, why.
 *
 * - `checking`   — still probing (or no registered account to simulate from)
 * - `executable` — the execute call would succeed
 * - `dead`       — it can never execute: the DAO has no such proposal, the
 *                  proposal's own action reverts, or its role change doesn't
 *                  match the space's on-chain roles
 * - `blocked`    — some other governance revert (already executed, not enough
 *                  votes, voting period not elapsed) — transient or resolved
 */
export type ProposalExecutability = 'checking' | 'executable' | 'dead' | 'blocked';

/**
 * Execute reverts that no amount of waiting or voting will clear.
 *
 * `InvalidSpaceIdForRole` belongs here, not with the transient reverts: during
 * execution it means the proposal's role change contradicts the DAO's current
 * roles (adding someone who already holds the role, or removing someone who
 * doesn't). Classifying it `blocked` made the UI treat it as "indexer is stale,
 * refresh" — so a proposal to remove an editor the contract never had (GEO-2609)
 * came back as "Pending execution" and offered Execute again on every visit.
 */
const PERMANENT_EXECUTE_REVERTS: ReadonlySet<string> = new Set([
  ACTION_REVERTED_SELECTOR,
  INVALID_SPACE_ID_FOR_ROLE_SELECTOR,
]);

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

  return isPermanentExecuteRevert(simulationRevert) ? 'dead' : 'blocked';
}

/** Whether an execute revert (simulated or real) means the proposal can never execute. */
export function isPermanentExecuteRevert(revert: GovernanceRevert | null): boolean {
  return revert !== null && PERMANENT_EXECUTE_REVERTS.has(revert.selector);
}

/**
 * Why a `dead` proposal can't be completed, in words a viewer can act on.
 *
 * Keyed on the revert the chain gave us, because the three causes need different
 * things from the person reading it: a proposal missing from the DAO must be
 * published again, a legacy request with a broken action must be recreated, and
 * a role change that contradicts the chain needs nothing re-proposed at all —
 * the chain already has the outcome the proposal asked for, and what's wrong is
 * the role list the UI was showing.
 */
export function describeDeadProposal(revert: GovernanceRevert | null): string {
  if (revert?.selector === INVALID_SPACE_ID_FOR_ROLE_SELECTOR) {
    return "This proposal can't be completed: its role change doesn't match the space's on-chain roles. The person it removes doesn't hold that role on-chain (or the person it adds already does), so executing it always fails. Nothing needs to be re-proposed.";
  }

  if (revert?.selector === ACTION_REVERTED_SELECTOR) {
    return "This proposal can't be completed: one of its on-chain actions reverts every time it runs. Older editor and member requests hit this permanently and need to be recreated.";
  }

  return "This proposal can't be completed: the space's DAO has no record of it on-chain. Proposals that predate this space's migration hit this permanently and need to be published again.";
}
