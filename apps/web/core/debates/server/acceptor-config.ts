import type { Hex } from 'viem';

/**
 * Server-only credentials for the debate acceptor — the account that auto-publishes finished
 * debates to the knowledge graph. Named after gaia's `membership-acceptor`, which follows the
 * same pattern (a dedicated bot key signing governance writes from `*_PRIVATE_KEY` env vars).
 * Unprefixed (non-`NEXT_PUBLIC_`) so the private key never reaches the client bundle. Production
 * creds are set at deploy time; for local testing point these at a throwaway key granted editor
 * on the target space.
 */
export type DebateAcceptorConfig = {
  privateKey: Hex;
  /** The acceptor's smart-account/EOA address, for ops records only — not used in the publish flow. */
  address?: string;
  /** The acceptor's registered personal-space id — used as the proposal author / caller space. */
  spaceId: string;
  /** Optional RPC override; defaults to the SDK's testnet RPC. */
  rpcUrl?: string;
};

/**
 * Returns the acceptor config, or `null` when it's unset (dev machines have no acceptor, so the
 * publish sweep reports "not configured" rather than failing). A key that's *set but malformed*
 * throws — fail-fast on bad config, mirroring gaia's `membership-acceptor/config.ts`.
 */
export function getDebateAcceptorConfig(): DebateAcceptorConfig | null {
  const privateKey = process.env.DEBATE_ACCEPTOR_PRIVATE_KEY?.trim();
  const address = process.env.DEBATE_ACCEPTOR_ADDRESS?.trim() || undefined;
  const spaceId = process.env.DEBATE_ACCEPTOR_SPACE_ID?.trim();
  const rpcUrl = process.env.DEBATE_ACCEPTOR_RPC_URL?.trim() || undefined;

  if (!privateKey || !spaceId) return null;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('DEBATE_ACCEPTOR_PRIVATE_KEY is set but is not a 0x-prefixed 32-byte hex key.');
  }

  return { privateKey: privateKey as Hex, address, spaceId, rpcUrl };
}
