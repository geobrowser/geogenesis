import { createGeoWalletClient, defineGeoNetworkConfig, GeoTestnetConfig } from '@geoprotocol/geo-sdk';
import { type Account, type Address, type Hex, createPublicClient, http } from 'viem';
import {
  type UserOperation,
  formatUserOperationRequest,
  getUserOperationError,
  getUserOperationHash,
} from 'viem/account-abstraction';

// Narrow interface capturing the surface every consumer in apps/web actually touches:
// `.account.address`, `.sendTransaction({to,data,value})`, `.sendUserOperation({calls})`.
export type GeoWalletClient = {
  account: { address: Address };
  /**
   * Resolves once the op is *included*. `onSubmitted`, where the implementation supports it, fires
   * earlier — the moment the bundler accepts the op — so a caller can stop blocking its UI on
   * inclusion while still learning the outcome from the promise. An implementation that cannot
   * tell the two apart may ignore it; callers must treat it as optional.
   */
  sendTransaction: (
    args: { to: Address; data: Hex; value?: bigint },
    options?: { onSubmitted?: (userOperationHash: Hex) => void }
  ) => Promise<Hex>;
  sendUserOperation: (args: { calls: ReadonlyArray<{ to: Address; data: Hex; value?: bigint }> }) => Promise<Hex>;
  /** `timeout` bounds a single wait so the caller — not viem's ~120s default — owns the total budget. */
  waitForUserOperationReceipt: (args: { hash: Hex; timeout?: number }) => Promise<{ success: boolean }>;
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

/**
 * A UserOperation that was included on-chain but reverted. Terminal by nature:
 * nothing landed, and re-submitting the identical op reverts identically.
 * Callers that wrap sends in a retry schedule MUST NOT retry this — see
 * `isRevertedUserOperationError`.
 */
export class RevertedUserOperationError extends Error {
  readonly hash: Hex;

  constructor(hash: Hex) {
    super(
      `UserOperation ${hash} was included on-chain but reverted — the transaction had no effect. ` +
        'Check permissions and proposal state before retrying.'
    );
    this.name = 'RevertedUserOperationError';
    this.hash = hash;
  }
}

/**
 * A bundler/paymaster rejecting an op because it reverted during simulation. The op
 * never left the client, so there is no hash and no `RevertedUserOperationError` — but
 * it is just as terminal: the same calldata simulates the same way every time.
 *
 * Matched on the message because the failure arrives as a generic viem
 * `RpcRequestError` from `zd_sponsorUserOperation`; the bundler gives us no typed
 * error to hold onto.
 */
const SIMULATION_REVERT_PATTERN = /reverted during simulation/i;

/**
 * Whether `error`, or anything in its `cause` chain, is a UserOperation that reverted
 * — either on-chain after inclusion, or during the bundler's pre-submission simulation.
 *
 * The chain walk matters: every send site wraps failures in its own error type
 * (TransactionWriteFailedError et al.), so the revert is never the outermost error by
 * the time a retry schedule inspects it.
 *
 * Both cases are terminal and must not be retried. Missing the simulation case cost us
 * seven identical submissions of a proposal that reverted `FastPathRestricted()` — a
 * deterministic permission failure that no amount of retrying could fix.
 */
export function isRevertedUserOperationError(error: unknown): boolean {
  // Bounded so a self-referential `cause` can't spin.
  for (let current = error, depth = 0; current != null && depth < 10; depth++) {
    if (current instanceof Error) {
      // Name check as well as instanceof: this class crosses a workspace package
      // boundary and a duplicated module instance would break identity.
      if (current.name === 'RevertedUserOperationError') return true;
      if (SIMULATION_REVERT_PATTERN.test(current.message)) return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

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

/**
 * Every UserOperation is submitted through the sponsorship endpoint (combined
 * bundler + paymaster). Without one there is no bundler to submit to at all, so
 * a network config missing it produces a client that can read but fails opaquely
 * on the first write. Fail at construction, where the message can name the fix.
 *
 * Deliberately checked here rather than at module load in geo-network.ts: an
 * unsponsored network should still serve read-only traffic.
 */
function assertSponsorshipConfigured(network: GeoNetworkConfig): void {
  if (!network.sponsorship?.rpcUrl) {
    throw new Error(
      `Network ${network.id ?? 'unknown'} (chain ${network.chain?.id ?? 'unknown'}) has no gas-sponsorship endpoint. ` +
        'UserOperations cannot be submitted without a bundler — set NEXT_PUBLIC_SPONSORSHIP_RPC_URL for this chain.'
    );
  }
}

/**
 * The property a failed `sendUserOperation` carries the ERC-4337 hash of the exact op it tried to
 * submit under. Read with `submittedUserOperationHash`.
 *
 * The hash is computed locally before submission, so it exists even when `eth_sendUserOperation`
 * never answered. That is the point: a bundler that says "already known" to a resubmission has
 * the op, and this hash is how the caller goes on to wait for its receipt instead of reporting a
 * publish that is about to land as failed.
 */
const SUBMITTED_HASH_KEY = 'userOperationHash';

/** The hash a failed `sendUserOperation` attached to its error (or anything in its `cause` chain). */
export function submittedUserOperationHash(error: unknown): Hex | undefined {
  for (let current = error, depth = 0; current != null && depth < 10; depth++) {
    const hash = (current as Record<string, unknown>)[SUBMITTED_HASH_KEY];
    if (typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash)) return hash as Hex;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export type KernelClient = Awaited<ReturnType<typeof createGeoWalletClient>>;

/**
 * viem's `sendUserOperation`, unrolled so the hash of the signed op is known before it is sent.
 *
 * Same steps in the same order — prepare (nonce, gas, sponsorship), sign, `eth_sendUserOperation`
 * with no transport retry, and the same error mapping — so behaviour on success and on rejection is
 * unchanged. The only addition is that a rejection carries the op's hash (see SUBMITTED_HASH_KEY).
 */
export async function sendUserOperationWithKnownHash(
  kernelClient: KernelClient,
  account: NonNullable<KernelClient['account']>,
  chainId: number,
  args: { calls: ReadonlyArray<{ to: Address; data: Hex; value?: bigint }> }
): Promise<Hex> {
  const calls = args.calls.map(call => ({ ...call }));

  const request = await kernelClient.prepareUserOperation({ account, calls });
  const signature = await account.signUserOperation(request as UserOperation<'0.7'>);
  const userOperation = { ...request, signature } as UserOperation<'0.7'>;
  const hash = getUserOperationHash({
    chainId,
    entryPointAddress: account.entryPoint.address,
    entryPointVersion: '0.7',
    userOperation,
  });

  let returned: Hex;
  try {
    returned = await kernelClient.request(
      {
        method: 'eth_sendUserOperation',
        params: [formatUserOperationRequest(userOperation), account.entryPoint.address],
      },
      { retryCount: 0 }
    );
  } catch (error) {
    const mapped = getUserOperationError(error as Parameters<typeof getUserOperationError>[0], {
      ...userOperation,
      calls,
    });
    Object.defineProperty(mapped, SUBMITTED_HASH_KEY, { value: hash, enumerable: false });
    throw mapped;
  }

  if (returned.toLowerCase() !== hash.toLowerCase()) {
    // Would mean the local hash is not the bundler's, and an "already known" recovery would wait
    // on a receipt that never comes (it times out rather than reporting a false success). Loud,
    // because nothing else would notice.
    console.error('[SMART-ACCOUNT] bundler returned a different UserOperation hash than computed', {
      computed: hash,
      returned,
    });
  }
  return returned;
}

export async function generateZeroDevAccount({
  signer,
  network,
}: GenerateZeroDevAccountParams): Promise<GeoWalletClient> {
  const resolvedNetwork = network ?? GeoTestnetConfig;

  assertSponsorshipConfigured(resolvedNetwork);

  if (resolvedNetwork.chain) {
    await assertRpcMatchesChain(resolvedNetwork.chain);
  }

  const kernelClient = await createGeoWalletClient({
    signer: signer as Parameters<typeof createGeoWalletClient>[0]['signer'],
    network: resolvedNetwork,
  });

  const account = kernelClient.account;
  const chainId = kernelClient.chain?.id;
  if (!account || chainId === undefined) {
    throw new Error('ZeroDev kernel client was created without an account or chain.');
  }
  if (account.entryPoint.version !== '0.7') {
    // sendUserOperationWithKnownHash hashes for EntryPoint 0.7; any other version would hash
    // wrongly and leave a caller waiting on a receipt that can never exist.
    throw new Error(`Unsupported EntryPoint version ${account.entryPoint.version}; expected 0.7.`);
  }

  const client: GeoWalletClient = {
    account,
    sendTransaction: args => kernelClient.sendTransaction(args as Parameters<KernelClient['sendTransaction']>[0]),
    sendUserOperation: args => sendUserOperationWithKnownHash(kernelClient, account, chainId, args),
    waitForUserOperationReceipt: args => kernelClient.waitForUserOperationReceipt(args),
  };
  return client;
}
