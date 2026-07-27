import { createGeoWalletClient, defineGeoNetworkConfig, GeoTestnetConfig } from '@geoprotocol/geo-sdk';
import { type Account, type Address, type Hex, createPublicClient, http } from 'viem';

// Narrow interface capturing the surface every consumer in apps/web actually touches:
// `.account.address`, `.sendTransaction({to,data,value})`, `.sendUserOperation({calls})`.
export type GeoWalletClient = {
  account: { address: Address };
  sendTransaction: (args: { to: Address; data: Hex; value?: bigint }) => Promise<Hex>;
  sendUserOperation: (args: { calls: ReadonlyArray<{ to: Address; data: Hex; value?: bigint }> }) => Promise<Hex>;
  waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{ success: boolean }>;
};

// ──────────────────────────────────────────────────────────────────────────────
// ZeroDev EIP-7702 Kernel — the only wallet stack. The v2 SpaceRegistry keys
// permissions on the EOA address directly, so there is no Safe indirection.
//
// The signer MUST be a viem LocalAccount (type: 'local') with a working
// `signAuthorization` method. viem's standard `signAuthorization` action rejects
// JSON-RPC accounts outright, so the embedded Privy WalletClient cannot be used
// directly — wrap it via `toViemAccount` from `@privy-io/react-auth` at the call
// site (see apps/web/core/hooks/use-smart-account.ts) before passing it here.
// ──────────────────────────────────────────────────────────────────────────────

type GeoNetworkConfig = ReturnType<typeof defineGeoNetworkConfig>;

type GenerateZeroDevAccountParams = {
  signer: Account;
  /**
   * Full Geo network config (chain, sponsorship, contracts) for the target
   * network. Defaults to the SDK's built-in testnet config when omitted; the
   * app passes its env-driven config so a network flip needs no change here.
   */
  network?: GeoNetworkConfig;
};

// One successful verification per RPC URL per session. Only successes are
// cached: a rejected probe is evicted so a transient RPC error neither wedges
// login permanently nor disables the guard for the rest of the session.
const verifiedRpcUrls = new Map<string, Promise<void>>();

/**
 * Fail fast if the RPC serves a different chain than the one we're configured
 * for. Without this, EIP-7702 authorizations and user operations are built and
 * signed against the wrong chain and fail opaquely at submit time (AA10 after
 * the edit has already been uploaded to IPFS) — the exact failure mode this
 * guard's predecessor existed for before the ZeroDev migration dropped it.
 */
function assertRpcMatchesChain(chain: { id: number; rpcUrl?: string }): Promise<void> {
  const { id, rpcUrl } = chain;
  // No RPC URL to probe — createGeoWalletClient fails on its own terms.
  if (!rpcUrl) return Promise.resolve();

  const cached = verifiedRpcUrls.get(rpcUrl);
  if (cached) return cached;

  const probe = createPublicClient({ transport: http(rpcUrl) })
    .getChainId()
    .then(rpcChainId => {
      if (rpcChainId !== id) {
        throw new Error(
          `RPC ${rpcUrl} serves chain ${rpcChainId}, but the app is configured for chain ${id}. ` +
            'Refusing to sign against the wrong chain — check NEXT_PUBLIC_CHAIN_ID and the RPC endpoint vars.'
        );
      }
    });
  verifiedRpcUrls.set(rpcUrl, probe);
  probe.catch(() => verifiedRpcUrls.delete(rpcUrl));
  return probe;
}

export async function generateZeroDevAccount({
  signer,
  network,
}: GenerateZeroDevAccountParams): Promise<GeoWalletClient> {
  const chain = (network ?? GeoTestnetConfig).chain;
  if (chain) {
    await assertRpcMatchesChain(chain);
  }

  const kernelClient = await createGeoWalletClient({
    signer: signer as Parameters<typeof createGeoWalletClient>[0]['signer'],
    network: network ?? GeoTestnetConfig,
  });

  return kernelClient as unknown as GeoWalletClient;
}
