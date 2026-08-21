import { IS_TESTNET } from '~/core/sdk/geo-network';
import { useFeatureFlag } from '~/core/state/feature-flags';

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
