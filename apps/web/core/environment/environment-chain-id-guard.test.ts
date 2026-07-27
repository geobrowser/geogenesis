import { describe, expect, it } from 'vitest';

// Regression guard for the half-configured-mainnet failure mode: mainnet
// endpoint vars set while NEXT_PUBLIC_CHAIN_ID is unset (forgotten, or the var
// name typo'd) must fail the build instead of silently defaulting the deploy
// to testnet. The happy testnet-default path (all mainnet signals absent) is
// covered by geo-network-envcheck.test.ts.
describe('environment chain-id guard', () => {
  it('throws when mainnet endpoint vars are set without an explicit chain id', async () => {
    process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'x';
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = 'x';
    process.env.NEXT_PUBLIC_GEOGENESIS_RPC = 'https://rpc.example.com';
    process.env.NEXT_PUBLIC_API_ENDPOINT = 'https://api.example.com/graphql';
    delete process.env.NEXT_PUBLIC_CHAIN_ID;

    await expect(import('~/core/environment/environment')).rejects.toThrow(
      /NEXT_PUBLIC_CHAIN_ID/
    );
  });
});
