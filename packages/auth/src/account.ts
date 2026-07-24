import { createGeoWalletClient, defineGeoNetworkConfig, GeoTestnetConfig } from '@geoprotocol/geo-sdk';
import { type Account, type Address, type Hex } from 'viem';

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

export async function generateZeroDevAccount({
  signer,
  network,
}: GenerateZeroDevAccountParams): Promise<GeoWalletClient> {
  const kernelClient = await createGeoWalletClient({
    signer: signer as Parameters<typeof createGeoWalletClient>[0]['signer'],
    network: network ?? GeoTestnetConfig,
  });

  return kernelClient as unknown as GeoWalletClient;
}
