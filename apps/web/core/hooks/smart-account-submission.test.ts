import { RevertedUserOperationError } from '@geogenesis/auth/account';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sendTransactionReportingSubmission } from './smart-account-submission';

const { reportError, reportEvent } = vi.hoisted(() => ({ reportError: vi.fn(), reportEvent: vi.fn() }));
vi.mock('~/core/telemetry/logger', () => ({ reportError, reportEvent }));

const HASH = `0x${'ab'.repeat(32)}` as const;
const TX = { to: '0x0000000000000000000000000000000000000001', data: '0xabcd' } as const;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
};

function client(receipt: Promise<{ success: boolean }> = Promise.resolve({ success: true })) {
  return {
    sendUserOperation: vi.fn(
      async (_args: { calls: ReadonlyArray<{ to: string; data: string; value?: bigint }> }) => HASH
    ),
    waitForUserOperationReceipt: vi.fn((_args: { hash: `0x${string}`; timeout?: number }) => receipt),
  };
}

beforeEach(() => {
  reportError.mockReset();
  reportEvent.mockReset();
});

describe('sendTransactionReportingSubmission (GEO-2889)', () => {
  it('reports the submission before inclusion, and settles on inclusion', async () => {
    const receipt = deferred<{ success: boolean }>();
    const account = client(receipt.promise);
    const onSubmitted = vi.fn();

    let settled = false;
    const sending = sendTransactionReportingSubmission(account, TX, onSubmitted).then(hash => {
      settled = true;
      return hash;
    });
    await vi.waitFor(() => expect(onSubmitted).toHaveBeenCalledWith(HASH));
    expect(settled).toBe(false);

    receipt.resolve({ success: true });
    await expect(sending).resolves.toBe(HASH);
  });

  it('sends the same single-call op the kernel would, and waits with the default timeout', async () => {
    const account = client();
    await sendTransactionReportingSubmission(account, TX, () => {});

    expect(account.sendUserOperation).toHaveBeenCalledTimes(1);
    expect(account.sendUserOperation).toHaveBeenCalledWith({ calls: [{ ...TX, value: 0n }] });
    // No `timeout`: the kernel's own wait uses viem's default, and a shorter one would fail the slow
    // tail of ops that go on to land.
    expect(account.waitForUserOperationReceipt).toHaveBeenCalledWith({ hash: HASH });
  });

  it('fails a reverted op rather than reporting it as made', async () => {
    const account = client(Promise.resolve({ success: false }));
    await expect(sendTransactionReportingSubmission(account, TX, () => {})).rejects.toBeInstanceOf(
      RevertedUserOperationError
    );
  });

  it('does not report a send the bundler refused as submitted', async () => {
    const account = client();
    account.sendUserOperation.mockRejectedValueOnce(new Error('paymaster refused'));
    const onSubmitted = vi.fn();

    await expect(sendTransactionReportingSubmission(account, TX, onSubmitted)).rejects.toThrow('paymaster refused');
    expect(onSubmitted).not.toHaveBeenCalled();
    expect(account.waitForUserOperationReceipt).not.toHaveBeenCalled();
  });

  it('never re-sends after submission, even when the receipt wait fails', async () => {
    const account = client(Promise.reject(new Error('rpc blip')));

    await expect(sendTransactionReportingSubmission(account, TX, () => {})).rejects.toThrow('rpc blip');
    expect(account.sendUserOperation).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting when the listener throws, so a submitted op is not reported as failed', async () => {
    const account = client();
    await expect(
      sendTransactionReportingSubmission(account, TX, () => {
        throw new Error('listener bug');
      })
    ).resolves.toBe(HASH);
    expect(reportError).toHaveBeenCalledOnce();
  });
});
