import { createGeoWalletClient, defineGeoNetworkConfig, GeoTestnetConfig } from '@geoprotocol/geo-sdk';
import { getOwnableValidator, getSmartSessionsValidator, RHINESTONE_ATTESTER_ADDRESS } from '@rhinestone/module-sdk';
import { createSmartAccountClient } from 'permissionless';
import { type ToSafeSmartAccountParameters, toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import {
  type Account,
  type Address,
  type Chain,
  createPublicClient,
  type Hex,
  http,
  type WalletClient,
} from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';

// ERC-7579 module addresses — must match the Curator app's constants
const SAFE_7579_MODULE_ADDRESS: Hex = '0x7579EE8307284F293B1927136486880611F20002';
const ERC7579_LAUNCHPAD_ADDRESS: Hex = '0x7579011aB74c46090561ea277Ba79D510c6C00ff';

// Narrow interface capturing the surface every consumer in apps/web actually touches:
// `.account.address`, `.sendTransaction({to,data,value})`, `.sendUserOperation({calls})`.
// Both KernelAccountClient (testnet 55516, EIP-7702) and the Safe-backed SmartAccountClient
// (mainnet 80451) satisfy this. Loosening from the previous Safe-specific type lets the
// branched factory return either client without consumers caring.
export type GeoWalletClient = {
  account: { address: Address };
  sendTransaction: (args: { to: Address; data: Hex; value?: bigint }) => Promise<Hex>;
  sendUserOperation: (args: {
    calls: ReadonlyArray<{ to: Address; data: Hex; value?: bigint }>;
  }) => Promise<Hex>;
  waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{ success: boolean }>;
};

// ──────────────────────────────────────────────────────────────────────────────
// Testnet (chain 55516): ZeroDev EIP-7702 Kernel.
//
// The signer MUST be a viem LocalAccount (type: 'local') with a working
// `signAuthorization` method. viem's standard `signAuthorization` action rejects
// JSON-RPC accounts outright, so the embedded Privy WalletClient cannot be used
// directly — wrap it via `toViemAccount` from `@privy-io/react-auth` at the call
// site (see apps/web/core/hooks/use-smart-account.ts) before passing it here.
// ──────────────────────────────────────────────────────────────────────────────

type GenerateZeroDevAccountParams = {
  signer: Account;
  /**
   * Chain RPC override. Only needed for the local-anvil e2e environment; on real
   * testnet the SDK's built-in GeoTestnetConfig RPC is used when omitted.
   */
  rpcUrl?: string;
  /**
   * Sponsorship (combined bundler + paymaster) RPC override. Only needed for the
   * local-anvil e2e environment; the SDK's GeoTestnetConfig ships the Geo-managed
   * ZeroDev sponsorship endpoint, so production/testnet callers omit this.
   */
  sponsorshipRpcUrl?: string;
};

export async function generateZeroDevAccount({
  signer,
  rpcUrl,
  sponsorshipRpcUrl,
}: GenerateZeroDevAccountParams): Promise<GeoWalletClient> {
  const network =
    rpcUrl || sponsorshipRpcUrl
      ? defineGeoNetworkConfig({
          ...GeoTestnetConfig,
          chain: { ...GeoTestnetConfig.chain!, ...(rpcUrl ? { rpcUrl } : {}) },
          sponsorship: sponsorshipRpcUrl ? { rpcUrl: sponsorshipRpcUrl } : GeoTestnetConfig.sponsorship,
        })
      : GeoTestnetConfig;

  const kernelClient = await createGeoWalletClient({
    signer: signer as Parameters<typeof createGeoWalletClient>[0]['signer'],
    network,
  });

  return kernelClient as unknown as GeoWalletClient;
}

// ──────────────────────────────────────────────────────────────────────────────
// Mainnet (chain 80451): Safe + Pimlico.
//
// Try legacy Safe v1.4.1 first; fall back to the 7579 module-validator path if
// the legacy address isn't deployed yet.
// ──────────────────────────────────────────────────────────────────────────────

type GenerateSmartAccountParams = {
  rpcUrl: string;
  bundlerUrl: string;
  chain: Chain;
  walletClient: WalletClient;
};

export async function generateSmartAccount({
  rpcUrl,
  bundlerUrl,
  chain,
  walletClient,
}: GenerateSmartAccountParams): Promise<GeoWalletClient> {
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ transport, chain });

  const legacyParams: ToSafeSmartAccountParameters<'0.7', undefined> = {
    client: publicClient,
    owners: [walletClient],
    entryPoint: { address: entryPoint07Address, version: '0.7' },
    version: '1.4.1',
  };

  const legacyAccount = await toSafeSmartAccount(legacyParams);

  // The RPC must actually serve the chain we think we're on. If it doesn't, viem reads the
  // account's bytecode from the wrong chain, concludes it isn't deployed, and attaches init
  // code — which the bundler rejects as `AA10 sender already constructed`, but only after the
  // edit has been uploaded to IPFS. Fail here instead, where the cause is still legible.
  const rpcChainId = await publicClient.getChainId();

  if (rpcChainId !== chain.id) {
    throw new Error(
      `RPC chain mismatch: ${rpcUrl} serves chain ${rpcChainId}, but the app is configured for ${chain.name} (${chain.id}). Point RPC_ENDPOINT_TESTNET at a chain ${chain.id} RPC.`
    );
  }

  let safeAccount;
  if (await legacyAccount.isDeployed()) {
    safeAccount = legacyAccount;
  } else {
    const ownerAddress = walletClient.account?.address;
    if (!ownerAddress) {
      throw new Error('Wallet client has no account address');
    }

    const ownableValidator = getOwnableValidator({ owners: [ownerAddress], threshold: 1 });
    const smartSessionsValidator = getSmartSessionsValidator({});

    const erc7579Params: ToSafeSmartAccountParameters<'0.7', Hex> = {
      client: publicClient,
      owners: [walletClient],
      version: '1.4.1',
      entryPoint: { address: entryPoint07Address, version: '0.7' },
      safe4337ModuleAddress: SAFE_7579_MODULE_ADDRESS,
      erc7579LaunchpadAddress: ERC7579_LAUNCHPAD_ADDRESS,
      attesters: [RHINESTONE_ATTESTER_ADDRESS],
      attestersThreshold: 1,
      validators: [
        { address: ownableValidator.address, context: ownableValidator.initData },
        { address: smartSessionsValidator.address, context: smartSessionsValidator.initData },
      ],
    };

    safeAccount = await toSafeSmartAccount(erc7579Params);
  }

  const bundlerTransport = http(bundlerUrl);
  const paymasterClient = createPimlicoClient({
    transport: bundlerTransport,
    chain,
    entryPoint: { address: entryPoint07Address, version: '0.7' },
  });

  const smartAccount = createSmartAccountClient({
    chain,
    account: safeAccount,
    paymaster: paymasterClient,
    bundlerTransport,
    userOperation: {
      estimateFeesPerGas: async () => (await paymasterClient.getUserOperationGasPrice()).fast,
    },
  });

  return smartAccount as unknown as GeoWalletClient;
}
