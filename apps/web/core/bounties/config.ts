import { IS_TESTNET } from '~/core/sdk/geo-network';
import { useFeatureFlag } from '~/core/state/feature-flags';

/**
 * Feature gating for bounties. Two independent gates AND together:
 *
 * 1. Network gate (hard, server-knowable): bounties are testnet-only until the
 *    ontology ships on mainnet, and useless without a curator-backend to hold
 *    the points ledger — so both the network and the backend URL must be
 *    present. Route server components call notFound() on this gate.
 * 2. `bountiesTab` feature flag (soft, per-browser): the usual dev gate while
 *    surfaces are under construction. Client components check the combined
 *    hook and route away when it is off.
 */

/**
 * Base URL of the curator-backend HTTP API (points ledger, submission review
 * lifecycle, allocation validation/notification). Normalized without trailing
 * slashes; null when unset or blank — a blank Vercel value must hide the
 * feature, never fall back to localhost, so a misconfigured production build
 * fails visible instead of routing browsers at a developer's laptop.
 */
export function parseCuratorApiBaseUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

export const CURATOR_API_BASE_URL = parseCuratorApiBaseUrl(process.env.NEXT_PUBLIC_CURATOR_API_BASE_URL);

export function computeBountiesEnabledForNetwork(isTestnet: boolean, curatorApiBaseUrl: string | null): boolean {
  return isTestnet && curatorApiBaseUrl !== null;
}

/** The hard gate. Usable from server components; flipping mainnet on later is a one-line change here. */
export const bountiesEnabledForNetwork = computeBountiesEnabledForNetwork(IS_TESTNET, CURATOR_API_BASE_URL);

/** The combined gate for client surfaces: network gate AND the `bountiesTab` flag. */
export function useBountiesEnabled(): boolean {
  const flagEnabled = useFeatureFlag('bountiesTab');
  return bountiesEnabledForNetwork && flagEnabled;
}
