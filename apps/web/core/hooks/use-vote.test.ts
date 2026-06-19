import { describe, expect, it } from 'vitest';

import { getStaleProposalExecuteToastMessage } from './use-vote';

// GEO-2207: executing a stale editor/member request (the target was already
// added via a duplicate request) reverts on-chain with ActionReverted. That
// must route to a toast + refresh, not the retry error modal that re-fires the
// same reverting tx. Genuine execution failures must still surface as errors.
describe('getStaleProposalExecuteToastMessage', () => {
  const actionReverted = new Error('Execute failed', { cause: new Error('ActionReverted()') });
  const actionRevertedBySelector = new Error('Execute failed', { cause: new Error('reverted: 0x24c05f9a') });
  const canNotExecute = new Error('Execute failed', { cause: new Error('CanNotExecute()') });
  const canNotExecuteBySelector = new Error('Execute failed', { cause: new Error('reverted: 0xdf322356') });
  const genuineFailure = new Error('Execute failed', { cause: new Error('insufficient funds for gas') });
  // A revert we decode (InvalidFromSpace) but that is NOT stale must still
  // surface — decoding an error for a better message must never swallow it.
  const decodedButNotStale = new Error('Execute failed', { cause: new Error('InvalidFromSpace()') });

  it('treats an ActionReverted revert on an editor request as stale', () => {
    expect(getStaleProposalExecuteToastMessage(actionReverted, 'ADD_EDITOR')).not.toBeNull();
    expect(getStaleProposalExecuteToastMessage(actionRevertedBySelector, 'ADD_MEMBER')).not.toBeNull();
  });

  // CanNotExecute means already-executed / not-executable: stale for EVERY type
  // (incl. content proposals) and even without a known proposalType — otherwise
  // a double-execute or indexer lag loops the retry modal forever.
  it('treats CanNotExecute as stale for any proposal type', () => {
    expect(getStaleProposalExecuteToastMessage(canNotExecute, 'ADD_EDITOR')).not.toBeNull();
    expect(getStaleProposalExecuteToastMessage(canNotExecute, 'ADD_EDIT')).not.toBeNull();
    expect(getStaleProposalExecuteToastMessage(canNotExecuteBySelector, undefined)).not.toBeNull();
  });

  it('surfaces a genuine execution failure (not stale)', () => {
    expect(getStaleProposalExecuteToastMessage(genuineFailure, 'ADD_EDITOR')).toBeNull();
  });

  it('surfaces a decoded-but-not-stale revert instead of swallowing it', () => {
    expect(getStaleProposalExecuteToastMessage(decodedButNotStale, 'ADD_EDITOR')).toBeNull();
  });

  it('does not treat content-proposal ActionReverted as stale (only membership)', () => {
    expect(getStaleProposalExecuteToastMessage(actionReverted, 'ADD_EDIT')).toBeNull();
  });

  it('skips the membership ActionReverted case when proposalType is unknown', () => {
    expect(getStaleProposalExecuteToastMessage(actionReverted, undefined)).toBeNull();
  });
});
