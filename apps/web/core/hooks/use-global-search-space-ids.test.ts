import { describe, expect, it } from 'vitest';

import { MAX_SEARCH_ADDITIONAL_SPACE_IDS, buildGlobalSearchSpaceIds } from './global-search-space-ids';

describe('buildGlobalSearchSpaceIds', () => {
  it('deduplicates ids and keeps required spaces before member/editor spaces', () => {
    expect(
      buildGlobalSearchSpaceIds({
        rootSpaceId: 'root',
        currentSpaceId: 'current',
        personalSpaceId: 'personal',
        memberAndEditorSpaceIds: ['current', 'member-a', 'root', 'member-b'],
      })
    ).toEqual(['root', 'current', 'personal', 'member-a', 'member-b']);
  });

  it('caps additional search space ids at the API limit', () => {
    const ids = buildGlobalSearchSpaceIds({
      rootSpaceId: 'root',
      currentSpaceId: 'current',
      personalSpaceId: 'personal',
      memberAndEditorSpaceIds: Array.from({ length: 150 }, (_, index) => `space-${index}`),
    });

    expect(ids).toHaveLength(MAX_SEARCH_ADDITIONAL_SPACE_IDS);
    expect(ids.slice(0, 3)).toEqual(['root', 'current', 'personal']);
    expect(ids.at(-1)).toBe('space-96');
  });
});
