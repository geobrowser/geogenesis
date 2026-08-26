import { IS_TESTNET } from '~/core/sdk/geo-network';
import { useFeatureFlag } from '~/core/state/feature-flags';

import { BOUNTY_TYPE_ID } from './ontology';

/**
 * Feature gating for bounties. Two independent gates AND together:
 *
 * 1. Network gate (hard, server-knowable): bounties are testnet-only until the
 *    ontology ships on mainnet. Route server components call notFound() on
 *    this gate. Everything bounties read and write lives on the knowledge
 *    graph, so there is no service dependency to gate on.
 * 2. `bountiesTab` feature flag (soft, per-browser): the usual dev gate while
 *    surfaces are under construction. Client components check the combined
 *    hook and route away when it is off.
 */
export function computeBountiesEnabledForNetwork(isTestnet: boolean): boolean {
  return isTestnet;
}

/** The hard gate. Usable from server components; flipping mainnet on later is a one-line change here. */
export const bountiesEnabledForNetwork = computeBountiesEnabledForNetwork(IS_TESTNET);

/** The combined gate for client surfaces: network gate AND the `bountiesTab` flag. */
export function useBountiesEnabled(): boolean {
  const flagEnabled = useFeatureFlag('bountiesTab');
  return bountiesEnabledForNetwork && flagEnabled;
}

/**
 * Payout authoring is OFF until the curator points ledger (neo4j) derives from
 * the graph. curator-app writes a payout to the graph AND credits neo4j at
 * payout time (its `editors/bounty/$spaceId/payout/$bountyId` route publishes
 * the relation, then calls the backend credit); a payout published only from
 * here would never reach that ledger, so balances and rewards would silently
 * diverge. Flip this once curator-backend sweeps Payout entities from the
 * graph — its ProcessedPayout guard is already keyed on the payout id for it.
 */
export const PAYOUT_AUTHORING_ENABLED = false;

/** Whether an entity's type list marks it as a Bounty (ids compared dash-insensitively). */
export function isBountyEntity(types: readonly { id: string }[] | null | undefined): boolean {
  return !!types?.some(type => type.id.replace(/-/g, '').toLowerCase() === BOUNTY_TYPE_ID);
}
