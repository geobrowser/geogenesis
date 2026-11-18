import { afterEach, describe, expect, it, vi } from 'vitest';

const load = async (env: Record<string, string>) => {
  vi.resetModules();
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  return (await import('~/core/sdk/geo-network')).GEO_WEB_ORIGIN;
};

const MAINNET = {
  NEXT_PUBLIC_CHAIN_ID: '80451',
  NEXT_PUBLIC_GEOGENESIS_RPC: 'https://rpc.example.com',
  NEXT_PUBLIC_API_ENDPOINT: 'https://api.example.com/graphql',
  NEXT_PUBLIC_SPACE_REGISTRY_ADDRESS: `0x${'1'.repeat(40)}`,
  NEXT_PUBLIC_DAO_SPACE_FACTORY_ADDRESS: `0x${'2'.repeat(40)}`,
  NEXT_PUBLIC_GEO_WEB_ORIGIN: '',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GEO_WEB_ORIGIN', () => {
  it('has none on mainnet until it is set', async () => {
    expect(await load(MAINNET)).toBeNull();
  }, 30_000);

  it('takes the origin of the set value', async () => {
    expect(await load({ ...MAINNET, NEXT_PUBLIC_GEO_WEB_ORIGIN: 'https://geo.example.com/some/path' })).toBe(
      'https://geo.example.com'
    );
  }, 30_000);
});
