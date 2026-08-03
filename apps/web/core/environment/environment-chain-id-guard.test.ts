import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression guard for the silently-wrong-network failure mode. `resolveChainId`
// has no default: no env var positively signals "mainnet", so guessing is how a
// deploy ends up serving the wrong chain's data. Both an unset and a typo'd
// NEXT_PUBLIC_CHAIN_ID must fail the build. The happy path (an explicit testnet
// id resolving SDK defaults) is covered by geo-network-envcheck.test.ts.
describe('environment chain-id guard', () => {
  const ENV_KEYS = [
    'NEXT_PUBLIC_CHAIN_ID',
    'NEXT_PUBLIC_PRIVY_APP_ID',
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID',
    'NEXT_PUBLIC_GEOGENESIS_RPC',
    'NEXT_PUBLIC_API_ENDPOINT',
  ] as const;

  let saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));
    // The module reads env at import time, so each case needs a fresh registry.
    vi.resetModules();
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'x';
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = 'x';
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  // Dynamically importing environment.ts pulls in the geo-sdk + viem graph, which
  // is slow enough on a cold cache to flake against vitest's 5s default.
  it('throws when NEXT_PUBLIC_CHAIN_ID is unset', { timeout: 30_000 }, async () => {
    delete process.env.NEXT_PUBLIC_CHAIN_ID;

    await expect(import('~/core/environment/environment')).rejects.toThrow(/NEXT_PUBLIC_CHAIN_ID is not set/);
  });

  it('throws when NEXT_PUBLIC_CHAIN_ID is not a supported chain', { timeout: 30_000 }, async () => {
    process.env.NEXT_PUBLIC_CHAIN_ID = '1';

    await expect(import('~/core/environment/environment')).rejects.toThrow(/must be one of/);
  });
});
