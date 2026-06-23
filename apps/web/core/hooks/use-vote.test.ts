import { describe, expect, it } from 'vitest';

import { getStaleProposalVoteToastMessage } from './use-vote';

// A stale vote (the proposal already closed, or the membership change already
// applied via a duplicate request) reverts on-chain. That must route to a toast
// + refresh, not the retry error modal that re-fires the same reverting tx.
// Genuine failures, and any decoded-but-not-stale revert, must still surface.
describe('getStaleProposalVoteToastMessage', () => {
  const canNotVote = new Error('Vote failed', { cause: new Error('CanNotVote()') });
  const canNotVoteBySelector = new Error('Vote failed', { cause: new Error('reverted: 0x543ffef7') });
  const actionReverted = new Error('Vote failed', { cause: new Error('ActionReverted()') });
  const actionRevertedBySelector = new Error('Vote failed', { cause: new Error('reverted: 0x24c05f9a') });
  const genuineFailure = new Error('Vote failed', { cause: new Error('insufficient funds for gas') });
  // A revert we decode (InvalidFromSpace) but that is NOT stale must still
  // surface — decoding an error for a better message must never swallow it.
  const decodedButNotStale = new Error('Vote failed', { cause: new Error('InvalidFromSpace()') });

  it('treats CanNotVote as stale for any proposal type', () => {
    expect(getStaleProposalVoteToastMessage(canNotVote, 'ADD_EDITOR')).not.toBeNull();
    expect(getStaleProposalVoteToastMessage(canNotVoteBySelector, 'ADD_EDIT')).not.toBeNull();
  });

  it('treats an ActionReverted revert on a membership request as stale', () => {
    expect(getStaleProposalVoteToastMessage(actionReverted, 'ADD_EDITOR')).not.toBeNull();
    expect(getStaleProposalVoteToastMessage(actionRevertedBySelector, 'ADD_MEMBER')).not.toBeNull();
  });

  it('does not treat content-proposal ActionReverted as stale (only membership)', () => {
    expect(getStaleProposalVoteToastMessage(actionReverted, 'ADD_EDIT')).toBeNull();
  });

  it('surfaces a genuine failure (not stale)', () => {
    expect(getStaleProposalVoteToastMessage(genuineFailure, 'ADD_EDITOR')).toBeNull();
  });

  it('surfaces a decoded-but-not-stale revert instead of swallowing it', () => {
    expect(getStaleProposalVoteToastMessage(decodedButNotStale, 'ADD_EDITOR')).toBeNull();
  });
});
