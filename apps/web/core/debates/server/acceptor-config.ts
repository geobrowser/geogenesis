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

/** Secrets UIs and shell exports often keep the wrapping quotes as part of the value. */
function readEnv(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  const quoted = /^(['"])([\s\S]*)\1$/.exec(value);
  return quoted ? quoted[2].trim() : value;
}

/** A correct key also arrives bare, without the `0x` prefix. Returns `null` for anything else. */
function toPrivateKey(value: string): Hex | null {
  const body = value.replace(/^0[xX]/, '');
  return /^[0-9a-fA-F]{64}$/.test(body) ? (`0x${body}` as Hex) : null;
}

/**
 * Describes a rejected key by prefix, length, and whether the body is hex, so an operator can tell
 * a truncated key from a non-hex one. Never includes the value; this message lands in server logs.
 */
function describeKeyShape(value: string): string {
  const body = value.replace(/^0[xX]/, '');
  const prefix = body.length === value.length ? 'no 0x prefix' : '0x prefix';
  const kind = /^[0-9a-fA-F]*$/.test(body) ? 'hex' : 'non-hex';
  return `${prefix}, body of ${body.length} ${kind} character(s)`;
}

/**
 * Returns the acceptor config, or `null` when it's unset (dev machines have no acceptor, so the
 * publish sweep reports "not configured" rather than failing). A key that's *set but malformed*
 * throws — fail-fast on bad config, mirroring gaia's `membership-acceptor/config.ts`. Every value
 * is unquoted, since a quoted space id would otherwise reach the chain as a broken UUID.
 */
export function getDebateAcceptorConfig(): DebateAcceptorConfig | null {
  const rawPrivateKey = readEnv('DEBATE_ACCEPTOR_PRIVATE_KEY');
  const address = readEnv('DEBATE_ACCEPTOR_ADDRESS') || undefined;
  const spaceId = readEnv('DEBATE_ACCEPTOR_SPACE_ID');
  const rpcUrl = readEnv('DEBATE_ACCEPTOR_RPC_URL') || undefined;

  if (!rawPrivateKey || !spaceId) return null;

  const privateKey = toPrivateKey(rawPrivateKey);
  if (!privateKey) {
    throw new Error(
      `DEBATE_ACCEPTOR_PRIVATE_KEY is set but is not a 0x-prefixed 32-byte hex key (${describeKeyShape(rawPrivateKey)}). ` +
        'Expected 64 hex characters, with or without the 0x prefix.'
    );
  }

  return { privateKey, address, spaceId, rpcUrl };
}
