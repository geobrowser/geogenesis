import { describe, expect, it } from 'vitest';

import { CLAIM_RECORD_PAGE_SIZE, claimExploreRowPages } from './use-claim-explore-rows';

describe('claimExploreRowPages', () => {
  const ids = Array.from({ length: CLAIM_RECORD_PAGE_SIZE * 2 + 1 }, (_, index) => `id-${index}`);

  it('bounds every hydration request while preserving order', () => {
    const pages = claimExploreRowPages(ids);

    expect(pages.map(page => page.length)).toEqual([CLAIM_RECORD_PAGE_SIZE, CLAIM_RECORD_PAGE_SIZE, 1]);
    expect(pages.flat()).toEqual(ids);
  });

  it('returns no requests for an empty record', () => {
    expect(claimExploreRowPages([])).toEqual([]);
  });
});
