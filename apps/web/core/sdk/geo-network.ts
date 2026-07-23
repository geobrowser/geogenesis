import { GeoTestnetConfig, defineGeoNetworkConfig } from '@geoprotocol/geo-sdk';

import { type Hex, createPublicClient, http } from 'viem';

import { Environment } from '../environment';
import { GEOGENESIS } from '../wallet/geo-chain';

/**
 * Single source of truth for which Geo network this build targets.
 *
 * Everything network-identifying — chain, RPC, API origin, contract addresses,
 * gas sponsorship — resolves here from the environment, so switching networks
 * (v2 testnet cutover, eventual mainnet flip) is an env change, not a code
 * change. Nothing outside this module may hardcode a chain id, a contract
 * address, or a `network: 'TESTNET'` literal.
 */

const config = Environment.getConfig();

const IS_TESTNET = config.chainId === '55516';

// On testnet the SDK's built-in addresses are the defaults and env vars are
// overrides (used by the v2 contract cutover until the SDK publishes the new
// addresses). On any other chain the SDK has nothing to offer — the addresses
// MUST come from the environment, and we fail the build rather than fall back:
// a wrong registry address fails silently on-chain (txs to a codeless address
// succeed with no events).
// Env values are format-validated in environment.ts, so the Hex casts are safe.
const contracts: { SPACE_REGISTRY_ADDRESS?: Hex; DAO_SPACE_FACTORY_ADDRESS?: Hex } = {
  ...(IS_TESTNET ? GeoTestnetConfig.contracts : {}),
  ...(Environment.variables.spaceRegistryAddress
    ? { SPACE_REGISTRY_ADDRESS: Environment.variables.spaceRegistryAddress as Hex }
    : {}),
  ...(Environment.variables.daoSpaceFactoryAddress
    ? { DAO_SPACE_FACTORY_ADDRESS: Environment.variables.daoSpaceFactoryAddress as Hex }
    : {}),
};

if (!contracts.SPACE_REGISTRY_ADDRESS || !contracts.DAO_SPACE_FACTORY_ADDRESS) {
  throw new Error(
    `Chain ${config.chainId} has no built-in contract addresses. Set NEXT_PUBLIC_SPACE_REGISTRY_ADDRESS and NEXT_PUBLIC_DAO_SPACE_FACTORY_ADDRESS.`
  );
}

export const GEO_NETWORK = defineGeoNetworkConfig({
  id: IS_TESTNET ? 'TESTNET' : 'MAINNET',
  name: IS_TESTNET ? 'Geo Testnet' : 'Geo Genesis',
  // The SDK expects the API *origin* (it appends /graphql, /ipfs/…); the env
  // var carries the full GraphQL URL.
  apiOrigin: new URL(config.api).origin,
  chain: {
    id: Number(config.chainId),
    name: 'Geo Genesis',
    rpcUrl: config.rpc,
  },
  // Testnet gas sponsorship (combined bundler + paymaster) ships inside the
  // SDK config. Mainnet has no endpoint yet — it lands here once infra
  // provides one.
  sponsorship: IS_TESTNET ? GeoTestnetConfig.sponsorship : undefined,
  contracts,
});

export const SPACE_REGISTRY_ADDRESS = contracts.SPACE_REGISTRY_ADDRESS;

export const SPACE_REGISTRY_ADDRESS_HEX = SPACE_REGISTRY_ADDRESS as Hex;

export const DAO_SPACE_FACTORY_ADDRESS = contracts.DAO_SPACE_FACTORY_ADDRESS as Hex;

// ─────────────────────────────────────────────────────────────────────────────
// Fail-closed deployment guard.
//
// A tx sent to an address with no code succeeds with an empty receipt — no
// revert, no events, nothing indexed. That is the exact failure mode of a
// stale network config (registry address pointing at the wrong chain's
// contract), so the vote/execute paths check for bytecode before sending
// instead of trusting the receipt.
// ─────────────────────────────────────────────────────────────────────────────

const codeCache = new Map<string, Promise<boolean>>();

/**
 * Whether `address` has contract code on the configured chain. Cached for the
 * session; resolves `true` on RPC failure so a flaky RPC can never block a
 * healthy network (the tx itself would surface a real connectivity problem).
 */
export function contractHasCode(address: Hex): Promise<boolean> {
  let cached = codeCache.get(address);
  if (!cached) {
    cached = createPublicClient({ chain: GEOGENESIS, transport: http() })
      .getCode({ address })
      .then(code => Boolean(code && code !== '0x'))
      .catch(() => true);
    codeCache.set(address, cached);
  }
  return cached;
}

/** Throws before a write can be sent to a SpaceRegistry address with no code. */
export async function assertSpaceRegistryDeployed(): Promise<void> {
  if (!(await contractHasCode(SPACE_REGISTRY_ADDRESS_HEX))) {
    throw new Error(
      `No contract code at SpaceRegistry ${SPACE_REGISTRY_ADDRESS} on chain ${config.chainId}. ` +
        'The configured registry address does not match this chain — refusing to send a transaction that would silently do nothing.'
    );
  }
}
