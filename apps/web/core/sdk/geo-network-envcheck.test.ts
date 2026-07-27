import { describe, expect, it } from 'vitest';

// Regression guard for the env→SDK-defaults resolution chain: with only the
// truly-required vars set, RPC/API/contract addresses must resolve from the
// geo-sdk's built-in testnet config. If an SDK bump changes any of these
// values, this failing is the signal to review the cutover implications.
process.env.NEXT_PUBLIC_PRIVY_APP_ID = 'clpsvsqpt005fl70fe775owo5';
process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID = '1234';
// Clear the vite.config.js test-isolation endpoint overrides so the SDK
// fallback path is what actually resolves. Chain id included: this test also
// covers the unset-chain-id → testnet default (legal only because the mainnet
// endpoint vars are cleared too — set together they fail the build).
delete process.env.NEXT_PUBLIC_CHAIN_ID;
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
    expect(config.api).toBe('https://testnet-api-v2.geobrowser.io/graphql');

    expect(GEO_NETWORK.id).toBe('TESTNET');
    expect(GEO_NETWORK.apiOrigin).toBe('https://testnet-api-v2.geobrowser.io');
    expect(GEO_NETWORK.chain?.id).toBe(55516);
    expect(GEO_NETWORK.sponsorship?.rpcUrl).toBeTruthy();

    expect(SPACE_REGISTRY_ADDRESS).toBe('0x364231615dcEA33D13C823b13B449DD9F55381E7');
    expect(DAO_SPACE_FACTORY_ADDRESS).toBe('0x322A3eD5f7f40262a95C51457f56a8c762C27226');
  });
});
