import { RpcRequestError, type Hex } from 'viem';
import { type UserOperation, getUserOperationHash } from 'viem/account-abstraction';
import { describe, expect, it, vi } from 'vitest';

import { type KernelClient, sendUserOperationWithKnownHash, submittedUserOperationHash } from './account';

const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const;
const CHAIN_ID = 19411;

const prepared = {
  sender: '0x0a77fd6b00000000000000000000000000000001',
  nonce: 1336n,
  callData: '0xdeadbeef',
  callGasLimit: 100_000n,
  verificationGasLimit: 200_000n,
  preVerificationGas: 50_000n,
  maxFeePerGas: 1_000_000n,
  maxPriorityFeePerGas: 1_000n,
  paymaster: '0x0000000000000000000000000000000000000abc',
  paymasterVerificationGasLimit: 30_000n,
  paymasterPostOpGasLimit: 0n,
  paymasterData: '0x1234',
} as const;
const signature = `0x${'ab'.repeat(65)}` as Hex;

const expectedHash = getUserOperationHash({
  chainId: CHAIN_ID,
  entryPointAddress: ENTRY_POINT,
  entryPointVersion: '0.7',
  userOperation: { ...prepared, signature } as UserOperation<'0.7'>,
});

const fakeKernel = (request: (...args: unknown[]) => Promise<unknown>) => {
  const account = {
    entryPoint: { address: ENTRY_POINT, version: '0.7' },
    signUserOperation: vi.fn(async () => signature),
  };
  const kernelClient = {
    prepareUserOperation: vi.fn(async () => ({ ...prepared })),
    request: vi.fn(request),
  };
  return {
    kernelClient: kernelClient as unknown as KernelClient,
    account: account as unknown as NonNullable<KernelClient['account']>,
    raw: kernelClient,
  };
};

const calls = [{ to: '0x0000000000000000000000000000000000000def' as const, data: '0x01' as const, value: 0n }];

describe('sendUserOperationWithKnownHash', () => {
  it('submits the signed op once, with no transport retry, and returns the bundler hash', async () => {
    const { kernelClient, account, raw } = fakeKernel(async () => expectedHash);

    await expect(sendUserOperationWithKnownHash(kernelClient, account, CHAIN_ID, { calls })).resolves.toBe(
      expectedHash
    );
    expect(raw.request).toHaveBeenCalledTimes(1);
    const [body, options] = raw.request.mock.calls[0] as [{ method: string; params: unknown[] }, unknown];
    expect(body.method).toBe('eth_sendUserOperation');
    expect(body.params[1]).toBe(ENTRY_POINT);
    expect(options).toEqual({ retryCount: 0 });
  });

  // 2026-09-30: the bundler answered a resubmission "Already known" and the publish reported
  // failure for a proposal that landed a minute later. The rejection must carry the hash of the
  // exact op so the caller can wait for it.
  it('attaches the locally computed hash to a bundler rejection, keeping viem’s error shape', async () => {
    const { kernelClient, account } = fakeKernel(async () => {
      throw new RpcRequestError({
        body: {},
        url: 'https://bundler.example',
        error: { code: -32602, message: 'Already known' },
      });
    });

    const error = await sendUserOperationWithKnownHash(kernelClient, account, CHAIN_ID, { calls }).catch(e => e);

    expect(error.name).toBe('UserOperationExecutionError');
    expect(error.message).toContain('Invalid fields set on User Operation');
    expect(error.message).toContain('Already known');
    expect(submittedUserOperationHash(error)).toBe(expectedHash);
    // Also through a wrapping error's cause chain, the way every send site wraps failures.
    expect(submittedUserOperationHash(new Error('Publish failed', { cause: error }))).toBe(expectedHash);
  });

  it('attaches nothing to errors thrown before submission', async () => {
    const { kernelClient, account, raw } = fakeKernel(async () => expectedHash);
    raw.prepareUserOperation.mockRejectedValueOnce(new Error('sponsorship refused'));

    const error = await sendUserOperationWithKnownHash(kernelClient, account, CHAIN_ID, { calls }).catch(e => e);
    expect(error.message).toBe('sponsorship refused');
    expect(submittedUserOperationHash(error)).toBeUndefined();
    expect(raw.request).not.toHaveBeenCalled();
  });
});
