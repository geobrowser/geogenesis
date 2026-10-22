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
 * Payouts attached to a REVIEW stay off here: the review flow pays the
 * submission's creator entity, which can be a person rather than the curator's
 * space. Direct payouts to an allocated curator (`useDirectPayout`) are on, and
 * run LEDGER FIRST: credit the curator points ledger (neo4j) through
 * curator-backend, whose balance check decides whether the payout happens, and
 * only then publish the Payout relation. That is the reverse of curator-app's
 * route, and deliberate: publishing first can leave a Payout in the graph that
 * the ledger then refused. (The ledger's check is not concurrency-safe across
 * different payouts; see `payout-credit.ts`.)
 */
export const PAYOUT_AUTHORING_ENABLED = false;

/** Whether an entity's type list marks it as a Bounty (ids compared dash-insensitively). */
export function isBountyEntity(types: readonly { id: string }[] | null | undefined): boolean {
  return !!types?.some(type => type.id.replace(/-/g, '').toLowerCase() === BOUNTY_TYPE_ID);
}

/**
 * curator-backend, which owns the curator points ledger (space balances and
 * curator rewards). Testnet host — bounties are testnet-only (see above).
 */
export const CURATOR_API_URL = 'https://curator-api-testnet.geobrowser.io';
