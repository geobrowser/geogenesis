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

/**
 * Exported for feature gating only (e.g. bounties are testnet-only until the
 * ontology ships on mainnet). Consumers branch on this boolean instead of
 * comparing network literals, keeping this module the single network authority.
 */
export const IS_TESTNET = Number(config.chainId) === GeoTestnetConfig.chain?.id;

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
  // SDK config; NEXT_PUBLIC_SPONSORSHIP_RPC_URL overrides it (e.g. to route
  // around a ZeroDev-side proxy bug without waiting on a geo-sdk release).
  // Mainnet has no endpoint yet — it lands here once infra provides one.
  sponsorship: IS_TESTNET
    ? Environment.variables.sponsorshipRpcUrl
      ? { rpcUrl: Environment.variables.sponsorshipRpcUrl }
      : GeoTestnetConfig.sponsorship
    : undefined,
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
 * Whether `address` has contract code on the configured chain. Successful probes
 * are cached for the session.
 *
 * An RPC failure resolves `true` — fail-open, so a flaky RPC can never block a
 * healthy network (the tx itself would surface a real connectivity problem) —
 * but that answer is NOT cached. Baking the fallback into the cached promise
 * meant one transient blip on the first probe pinned `true` for the rest of the
 * session, silently disabling the guard below for every later write.
 */
export function contractHasCode(address: Hex): Promise<boolean> {
  const cached = codeCache.get(address);
  if (cached) return cached;

  const probe = createPublicClient({ chain: GEOGENESIS, transport: http() })
    .getCode({ address })
    .then(code => Boolean(code && code !== '0x'));

  codeCache.set(address, probe);
  // Evict on failure so the next call re-probes rather than inheriting the
  // fail-open answer; the caller still gets `true` for this attempt.
  probe.catch(() => codeCache.delete(address));

  return probe.catch(() => true);
}

const ACTIVE_SPACE_IDS_ABI = [
  {
    type: 'function',
    name: 'activeSpaceIds',
    stateMutability: 'view',
    inputs: [{ name: 'spaceId', type: 'bytes16' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const activeSpaceCache = new Map<string, Promise<boolean>>();

/**
 * Whether the registry still considers `spaceId` active.
 *
 * The registry is the authority on which space an account owns, and it can retire
 * one: `overrideSpaceId` zeroes an account's previous id when reassigning it, which
 * the indexer does not currently reflect — it keeps serving the retired row. An
 * account with both rows indexed can therefore be handed a dead space id, and every
 * write authored by it reverts `SpaceNotActive()`.
 *
 * Failure resolves `false` rather than fail-open: this only runs to break a tie
 * between duplicate rows, and a wrong "active" answer would pick the dead space and
 * brick writes, while a wrong "inactive" answer just falls back to index order.
 * Successful probes are cached for the session; failures are evicted so the next
 * call re-probes.
 */
export function isSpaceActiveOnChain(spaceId: string): Promise<boolean> {
  const normalized = spaceId.startsWith('0x') ? spaceId : `0x${spaceId}`;

  const cached = activeSpaceCache.get(normalized);
  if (cached) return cached;

  const probe = createPublicClient({ chain: GEOGENESIS, transport: http() }).readContract({
    address: SPACE_REGISTRY_ADDRESS_HEX,
    abi: ACTIVE_SPACE_IDS_ABI,
    functionName: 'activeSpaceIds',
    args: [normalized as Hex],
  });

  activeSpaceCache.set(normalized, probe);
  probe.catch(() => activeSpaceCache.delete(normalized));

  return probe.catch(() => false);
}

const SPACE_ID_TO_ADDRESS_ABI = [
  {
    type: 'function',
    name: 'spaceIdToAddress',
    stateMutability: 'view',
    inputs: [{ name: 'spaceId', type: 'bytes16' }],
    outputs: [{ name: '', type: 'address' }],
  },
] as const;

const LATEST_PROPOSAL_VERSION_ABI = [
  {
    type: 'function',
    name: 'latestProposalVersion',
    stateMutability: 'view',
    inputs: [{ name: '_proposalId', type: 'bytes16' }],
    outputs: [{ name: '_version', type: 'uint8' }],
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Whether `proposalId` exists on its space's DAO contract.
 *
 * `null` means "could not determine" — callers must treat that as "assume it
 * exists" rather than as absence, since a wrong "absent" permanently labels a
 * healthy proposal as unexecutable.
 *
 * This is the only reliable way to tell a proposal that can never execute from
 * one that merely cannot execute yet. The migration copied proposal history into
 * the database without recreating those proposals on chain, so the DAO has no
 * record of them and `executeProposal` reverts forever. Both of the obvious
 * checks are useless for detecting that: `canExecuteProposal` and
 * `isSupportThresholdReached` each return `false` for an unknown proposal id,
 * exactly as they do for one that simply has not passed yet. A zero version is
 * unambiguous — the DAO assigns version 1 on creation.
 *
 * Needs no wallet, so signed-out viewers get the honest answer too.
 */
export async function proposalExistsOnChain(spaceId: string, proposalId: string): Promise<boolean | null> {
  const spaceIdHex = (spaceId.startsWith('0x') ? spaceId : `0x${spaceId}`) as Hex;
  const proposalIdHex = (proposalId.startsWith('0x') ? proposalId : `0x${proposalId}`) as Hex;

  try {
    // An eth_call against an address with no code returns empty data, which
    // decodes as a zero version — indistinguishable from a real absence. Bail to
    // `null` instead of reporting every proposal in the space as dead.
    if (!(await contractHasCode(SPACE_REGISTRY_ADDRESS_HEX))) return null;

    const client = createPublicClient({ chain: GEOGENESIS, transport: http() });

    const daoAddress = (await client.readContract({
      address: SPACE_REGISTRY_ADDRESS_HEX,
      abi: SPACE_ID_TO_ADDRESS_ABI,
      functionName: 'spaceIdToAddress',
      args: [spaceIdHex],
    })) as Hex;

    if (!daoAddress || daoAddress.toLowerCase() === ZERO_ADDRESS) return null;
    if (!(await contractHasCode(daoAddress))) return null;

    const version = await client.readContract({
      address: daoAddress,
      abi: LATEST_PROPOSAL_VERSION_ABI,
      functionName: 'latestProposalVersion',
      args: [proposalIdHex],
    });

    return Number(version) > 0;
  } catch {
    // Fail open: an RPC blip must never brand a live proposal unexecutable.
    return null;
  }
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
