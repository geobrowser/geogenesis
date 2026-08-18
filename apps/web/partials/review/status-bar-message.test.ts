import { describe, expect, it } from 'vitest';

import { statusBarMessage } from './status-bar-message';

describe('statusBarMessage', () => {
  // Writing to your own space publishes outright, so the original wording still holds.
  it('says changes were published for a personal space', () => {
    expect(statusBarMessage({ reviewState: 'publish-complete', spaceGovernanceType: 'PERSONAL' })).toBe(
      'Changes published!'
    );
  });

  // A DAO edit is filed for the space to decide on. Calling that "published" claims the change is
  // live when it is still waiting on a vote.
  it('says a proposal was submitted for a DAO space', () => {
    expect(statusBarMessage({ reviewState: 'publish-complete', spaceGovernanceType: 'DAO' })).toBe(
      'Proposal submitted'
    );
  });

  // Nothing before the final state names a destination, so an unknown one keeps the old wording
  // rather than inventing a proposal.
  it('falls back to the published wording when the destination is unknown', () => {
    expect(statusBarMessage({ reviewState: 'publish-complete', spaceGovernanceType: null })).toBe('Changes published!');
  });

  it.each(['publishing-ipfs', 'signing-wallet', 'publishing-contract', 'publish-error'] as const)(
    'leaves the %s message alone whatever the destination',
    reviewState => {
      expect(statusBarMessage({ reviewState, spaceGovernanceType: 'DAO' })).toBe(
        statusBarMessage({ reviewState, spaceGovernanceType: 'PERSONAL' })
      );
    }
  );

  it('still reports progress states while publishing to a DAO space', () => {
    expect(statusBarMessage({ reviewState: 'signing-wallet', spaceGovernanceType: 'DAO' })).toBe(
      'Sign your transaction'
    );
  });
});
