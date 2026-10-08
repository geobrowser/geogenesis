import { describe, expect, it } from 'vitest';

import { savePromptReasonAfterVote } from './save-votes-prompt';

describe('savePromptReasonAfterVote', () => {
  it('asks on the second vote in a feed', () => {
    expect(savePromptReasonAfterVote({ count: 1, surface: 'feed', shownCount: 0 })).toBeNull();
    expect(savePromptReasonAfterVote({ count: 2, surface: 'feed', shownCount: 0 })).toBe('threshold');
  });

  it('asks on the first vote where the claim stands alone', () => {
    expect(savePromptReasonAfterVote({ count: 1, surface: 'single', shownCount: 0 })).toBe('single_claim');
  });

  it('asks once more at five votes, then stops asking on its own', () => {
    expect(savePromptReasonAfterVote({ count: 3, surface: 'feed', shownCount: 1 })).toBeNull();
    expect(savePromptReasonAfterVote({ count: 5, surface: 'feed', shownCount: 1 })).toBe('repeat');
    expect(savePromptReasonAfterVote({ count: 9, surface: 'feed', shownCount: 2 })).toBeNull();
  });
});
