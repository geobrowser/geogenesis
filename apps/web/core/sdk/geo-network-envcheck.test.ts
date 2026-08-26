import { describe, expect, it } from 'vitest';

// Regression guard for the env→SDK-defaults resolution chain: with only the
// truly-required vars set, RPC/API/contract addresses must resolve from the
// geo-sdk's built-in testnet config. If an SDK bump changes any of these
// values, this failing is the signal to review the cutover implications.
//
// Values below are geo-sdk 0.20.0-beta.9. That bump moved all three: the API
// origin was renamed (both hostnames still serve identical data), and the
// contract addresses now point at the 2026-07-29 redeploy instead of the
// abandoned one beta.8 shipped.
process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'clpsvsqpt005fl70fe775owo5';
process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = '1234';
// Clear the vite.config.js test-isolation endpoint overrides so the SDK
// fallback path is what actually resolves. The chain id stays set explicitly —
// it is required (no default), and testnet is the identity under test here.
process.env.NEXT_PUBLIC_CHAIN_ID = '55516';
delete process.env.NEXT_PUBLIC_GEOGENESIS_RPC;
delete process.env.NEXT_PUBLIC_GEOGENESIS_RPC_TESTNET;
delete process.env.NEXT_PUBLIC_API_ENDPOINT;
delete process.env.NEXT_PUBLIC_API_ENDPOINT_TESTNET;

describe('geo-network env resolution (SDK defaults)', () => {
  it('resolves testnet identity entirely from the SDK when env overrides are unset', async () => {
    const { Environment } = await import('~/core/environment');
    const { GEO_NETWORK, SPACE_REGISTRY_ADDRESS, DAO_SPACE_FACTORY_ADDRESS } = await import('~/core/sdk/geo-network');

    const config = Environment.getConfig();
    expect(config.chainId).toBe('55516');
    expect(config.rpc).toBe('https://rpc-geo-testnet-irdc0cgb0w.t.conduit.xyz');
    expect(config.api).toBe('https://api-testnet.geobrowser.io/graphql');

    expect(GEO_NETWORK.id).toBe('TESTNET');
    expect(GEO_NETWORK.apiOrigin).toBe('https://api-testnet.geobrowser.io');
    expect(GEO_NETWORK.chain?.id).toBe(55516);
    expect(GEO_NETWORK.sponsorship?.rpcUrl).toBeTruthy();

    expect(SPACE_REGISTRY_ADDRESS).toBe('0xCF13491802747e759e1BB8E364bc43045398d1DD');
    expect(DAO_SPACE_FACTORY_ADDRESS).toBe('0x323aF429B85c954D4a161b2A6281c26DF45b7128');
    // Two dynamic imports of the environment and SDK modules, which is most of the app's
    // config graph. Measured at ~5.3s against the 5s default, so this was already tipping
    // over on a loaded machine and reporting a timeout rather than a real regression — the
    // failure mode looks identical to an SDK bump, which is exactly what it must not do.
  }, 30_000);
});
