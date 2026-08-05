import { RevertedUserOperationError, isRevertedUserOperationError } from '@geogenesis/auth/account';
import { describe, expect, it } from 'vitest';

import { TransactionWriteFailedError } from '~/core/errors';

const HASH = `0x${'ab'.repeat(32)}` as const;

/**
 * Retry schedules consult this to decide whether a failed write is worth re-sending.
 * A false negative is expensive: it re-submits calldata that cannot succeed, burning
 * sponsored operations and, for governance actions, spamming the chain.
 */
describe('isRevertedUserOperationError', () => {
  it('detects an on-chain revert', () => {
    expect(isRevertedUserOperationError(new RevertedUserOperationError(HASH))).toBe(true);
  });

  it('detects a revert wrapped by a call site', () => {
    // The real shape: every send site wraps failures in its own error type, so the
    // revert is never the outermost error by the time a schedule inspects it.
    const wrapped = new TransactionWriteFailedError('Failed to submit the proposal.', {
      cause: new RevertedUserOperationError(HASH),
    });

    expect(isRevertedUserOperationError(wrapped)).toBe(true);
  });

  it('detects a bundler simulation revert', () => {
    // FastPathRestricted() from a new member: rejected by zd_sponsorUserOperation
    // before submission, so there is no hash and no RevertedUserOperationError —
    // just a generic viem RpcRequestError. Retrying it produced seven identical
    // submissions during the 2026-07-30 e2e run.
    const simulationRevert = new Error(
      'RPC Request failed.\nDetails: UserOperation reverted during simulation with reason: 0x3a9c66d4'
    );

    expect(isRevertedUserOperationError(simulationRevert)).toBe(true);
  });

  it('detects a simulation revert nested in a cause chain', () => {
    const wrapped = new TransactionWriteFailedError('Publish failed', {
      cause: new Error('UserOperation reverted during simulation with reason: 0x3a9c66d4'),
    });

    expect(isRevertedUserOperationError(wrapped)).toBe(true);
  });

  it('does not match transient failures that should be retried', () => {
    expect(isRevertedUserOperationError(new Error('fetch failed'))).toBe(false);
    expect(isRevertedUserOperationError(new Error('AA25 invalid account nonce'))).toBe(false);
    expect(isRevertedUserOperationError(new Error('request timed out'))).toBe(false);
  });

  it('handles non-errors and empty cause chains', () => {
    expect(isRevertedUserOperationError(undefined)).toBe(false);
    expect(isRevertedUserOperationError(null)).toBe(false);
    expect(isRevertedUserOperationError('reverted during simulation')).toBe(false);
  });

  it('terminates on a self-referential cause chain', () => {
    const looping = new Error('boom') as Error & { cause?: unknown };
    looping.cause = looping;

    expect(isRevertedUserOperationError(looping)).toBe(false);
  });
});
