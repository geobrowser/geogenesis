import { describe, expect, it } from 'vitest';

import {
  type UserVotedEntityIdsCache,
  type VotedIdPage,
  addRemovedVotedId,
  clearRemovedVotedId,
  mergeVotedIdPages,
  removeEntityFromVotedIds,
} from './use-user-voted-entity-ids';

const ENTITY_ID = '4c81561d-1f95-4131-9cdd-dd20ab831ba2';

function cache(...pages: string[][]): UserVotedEntityIdsCache {
  return {
    pages: pages.map((objectIds, index) => ({
      objectIds,
      endCursor: `cursor-${index}`,
      hasNextPage: index < pages.length - 1,
    })),
    pageParams: pages.map((_, index) => (index === 0 ? null : `cursor-${index - 1}`)),
  };
}

describe('removeEntityFromVotedIds', () => {
  it('drops the entity from the page holding it and leaves the others alone', () => {
    const before = cache(['a', ENTITY_ID, 'b'], ['c']);

    const after = removeEntityFromVotedIds(before, ENTITY_ID);

    expect(after?.pages[0].objectIds).toEqual(['a', 'b']);
    expect(after?.pages[1]).toBe(before.pages[1]);
  });

  it('matches ids regardless of hyphens and case', () => {
    const after = removeEntityFromVotedIds(cache([ENTITY_ID.replace(/-/g, '').toUpperCase()]), ENTITY_ID);

    expect(after?.pages[0].objectIds).toEqual([]);
  });

  it('leaves the page cursors and pageParams untouched', () => {
    const before = cache(['a', ENTITY_ID], ['b']);

    const after = removeEntityFromVotedIds(before, ENTITY_ID);

    expect(after?.pages.map(page => page.endCursor)).toEqual(['cursor-0', 'cursor-1']);
    expect(after?.pages.map(page => page.hasNextPage)).toEqual([true, false]);
    expect(after?.pageParams).toEqual(before.pageParams);
  });

  it('returns the same cache when the entity is absent', () => {
    const before = cache(['a'], ['b']);

    expect(removeEntityFromVotedIds(before, ENTITY_ID)).toBe(before);
  });

  it('handles an unfetched list', () => {
    expect(removeEntityFromVotedIds(undefined, ENTITY_ID)).toBeUndefined();
  });
});

const page = (param: string | null, ...objectIds: string[]): VotedIdPage => ({ param, objectIds });

describe('mergeVotedIdPages', () => {
  it('appends pages the accumulation has not seen', () => {
    const merged = mergeVotedIdPages([page(null, 'a')], [page(null, 'a'), page('cursor-0', 'b')]);

    expect(merged).toEqual([page(null, 'a'), page('cursor-0', 'b')]);
  });

  // The point of the whole exercise: maxPages evicts the oldest page from the cache, and its ids
  // must not disappear from the list the viewer is looking at.
  it('keeps a page the cache has evicted, in its original position', () => {
    const accumulated = [page(null, 'a'), page('cursor-0', 'b')];

    // The cache now holds only the second page — the first slid out of the window.
    const merged = mergeVotedIdPages(accumulated, [page('cursor-0', 'b'), page('cursor-1', 'c')]);

    expect(merged).toEqual([page(null, 'a'), page('cursor-0', 'b'), page('cursor-1', 'c')]);
  });

  it('takes the cached copy of a page it already has', () => {
    const merged = mergeVotedIdPages([page(null, 'a', 'b')], [page(null, 'a')]);

    expect(merged).toEqual([page(null, 'a')]);
  });

  it('returns the same array when nothing moved', () => {
    const accumulated = [page(null, 'a'), page('cursor-0', 'b')];

    expect(mergeVotedIdPages(accumulated, [page('cursor-0', 'b')])).toBe(accumulated);
  });

  it('starts from empty', () => {
    expect(mergeVotedIdPages([], [page(null, 'a')])).toEqual([page(null, 'a')]);
  });
});

describe('vote suppression list', () => {
  it('adds an id once, however it is spelled', () => {
    const withId = addRemovedVotedId([], ENTITY_ID);

    expect(withId).toEqual([ENTITY_ID]);
    expect(addRemovedVotedId(withId, ENTITY_ID.replace(/-/g, '').toUpperCase())).toBe(withId);
  });

  it('clears an id when the entity rejoins the list', () => {
    expect(clearRemovedVotedId([ENTITY_ID, 'other'], ENTITY_ID)).toEqual(['other']);
  });

  it('returns the same array when there is nothing to clear', () => {
    const removed = ['other'];

    expect(clearRemovedVotedId(removed, ENTITY_ID)).toBe(removed);
  });
});
