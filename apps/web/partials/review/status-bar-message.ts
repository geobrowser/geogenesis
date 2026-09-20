import type { ReviewState, SpaceGovernanceType } from '~/core/types';

const message: Record<ReviewState, string> = {
  idle: '',
  reviewing: '',
  'publishing-ipfs': 'Uploading changes to IPFS',
  'signing-wallet': 'Sign your transaction',
  'publishing-contract': 'Adding your changes to The Graph',
  'publish-complete': 'Changes published!',
  'publish-error': 'An error has occurred',
};

/**
 * Writing to your own space publishes the changes outright. Writing to a DAO space files a
 * proposal for the space to decide on, so saying "published" there claims something that hasn't
 * happened yet — the edit is submitted, not live.
 *
 * An unknown destination keeps the original wording rather than inventing a proposal.
 */
export function statusBarMessage(state: {
  reviewState: ReviewState;
  spaceGovernanceType: SpaceGovernanceType | null;
}): string {
  if (state.reviewState === 'publish-complete' && state.spaceGovernanceType === 'DAO') {
    return 'Proposal submitted';
  }

  return message[state.reviewState];
}
