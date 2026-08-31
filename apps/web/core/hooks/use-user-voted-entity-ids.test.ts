import { describe, expect, it } from 'vitest';

import {
  EMPTY_PENDING_VOTED_OVERRIDES,
  type UserVotedEntityIdsCache,
  type VotedIdPage,
  clearPendingVotedEntity,
  mergeVotedIdPages,
  removeEntityFromVotedIds,
  restorePendingVotedEntry,
  sortVotedIdsByVotedAtDesc,
  suppressVotedId,
} from './use-user-voted-entity-ids';

const ENTITY_ID = '4c81561d-1f95-4131-9cdd-dd20ab831ba2';
const PAGE_SIZE = 50;

function cache(...pages: string[][]): UserVotedEntityIdsCache {
  return {
    pages: pages.map((objectIds, index) => ({
      objectIds,
      voteKindByObjectId: {},
      votedAtByObjectId: {},
      nextOffset: (index + 1) * PAGE_SIZE,
      hasNextPage: index < pages.length - 1,
    })),
    pageParams: pages.map((_, index) => index * PAGE_SIZE),
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

  it('leaves the page offsets and pageParams untouched', () => {
    const before = cache(['a', ENTITY_ID], ['b']);

    const after = removeEntityFromVotedIds(before, ENTITY_ID);

    expect(after?.pages.map(page => page.nextOffset)).toEqual([PAGE_SIZE, PAGE_SIZE * 2]);
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

const page = (param: number, ...objectIds: string[]): VotedIdPage => ({
  param,
  objectIds,
  voteKindByObjectId: {},
  votedAtByObjectId: {},
});

describe('mergeVotedIdPages', () => {
  it('appends pages the accumulation has not seen', () => {
    const merged = mergeVotedIdPages([page(0, 'a')], [page(0, 'a'), page(50, 'b')]);

    expect(merged).toEqual([page(0, 'a'), page(50, 'b')]);
  });

  // The point of the whole exercise: maxPages evicts the oldest page from the cache, and its ids
  // must not disappear from the list the viewer is looking at.
  it('keeps a page the cache has evicted, in its original position', () => {
    const accumulated = [page(0, 'a'), page(50, 'b')];

    // The cache now holds only the second page — the first slid out of the window.
    const merged = mergeVotedIdPages(accumulated, [page(50, 'b'), page(100, 'c')]);

    expect(merged).toEqual([page(0, 'a'), page(50, 'b'), page(100, 'c')]);
  });

  it('takes the cached copy of a page it already has', () => {
    const merged = mergeVotedIdPages([page(0, 'a', 'b')], [page(0, 'a')]);

    expect(merged).toEqual([page(0, 'a')]);
  });

  it('returns the same array when nothing moved', () => {
    const accumulated = [page(0, 'a'), page(50, 'b')];

    expect(mergeVotedIdPages(accumulated, [page(50, 'b')])).toBe(accumulated);
  });

  it('starts from empty', () => {
    expect(mergeVotedIdPages([], [page(0, 'a')])).toEqual([page(0, 'a')]);
  });

  // Offset pagination keys pages by position, and offset 0 is falsy — a page
  // identity check that tested truthiness would treat the first page as new
  // every time and append a duplicate.
  it('recognises the first page by its zero offset rather than appending it twice', () => {
    const accumulated = [page(0, 'a')];

    expect(mergeVotedIdPages(accumulated, [page(0, 'a')])).toBe(accumulated);
  });
});

describe('sortVotedIdsByVotedAtDesc', () => {
  it('orders newest votes first among the accumulated ids', () => {
    expect(
      sortVotedIdsByVotedAtDesc(['a', 'b', 'c'], {
        a: '2026-01-01T00:00:00Z',
        b: '2026-03-01T00:00:00Z',
        c: '2026-02-01T00:00:00Z',
      })
    ).toEqual(['b', 'c', 'a']);
  });

  it('ties break on id so the order is stable', () => {
    expect(
      sortVotedIdsByVotedAtDesc(['b', 'a'], {
        a: '2026-01-01T00:00:00Z',
        b: '2026-01-01T00:00:00Z',
      })
    ).toEqual(['a', 'b']);
  });
});

const VOTED_AT = '2026-08-26T00:00:00Z';
const entry = (entityId: string, voteKind = 0, votedAt = VOTED_AT) => ({ entityId, voteKind, votedAt });

describe('pending voted overrides', () => {
  it('suppresses an id once, however it is spelled', () => {
    const suppressed = suppressVotedId(EMPTY_PENDING_VOTED_OVERRIDES, ENTITY_ID);

    expect(suppressed.removed).toEqual([ENTITY_ID]);
    expect(suppressVotedId(suppressed, ENTITY_ID.replace(/-/g, '').toUpperCase())).toBe(suppressed);
  });

  it('drops a pending add when the same entity leaves the list', () => {
    const added = restorePendingVotedEntry(EMPTY_PENDING_VOTED_OVERRIDES, entry(ENTITY_ID));

    const suppressed = suppressVotedId(added, ENTITY_ID);

    expect(suppressed.added).toEqual([]);
    expect(suppressed.removed).toEqual([ENTITY_ID]);
  });

  it('clears the suppression when the entity rejoins the list', () => {
    const suppressed = suppressVotedId(EMPTY_PENDING_VOTED_OVERRIDES, ENTITY_ID);

    const restored = restorePendingVotedEntry(suppressed, entry(ENTITY_ID, 2));

    expect(restored.removed).toEqual([]);
    expect(restored.added).toEqual([entry(ENTITY_ID, 2)]);
  });

  it('keeps only the newest pending vote for an entity, at the front', () => {
    const overrides = restorePendingVotedEntry(
      restorePendingVotedEntry(EMPTY_PENDING_VOTED_OVERRIDES, entry(ENTITY_ID, 0, '2026-08-01T00:00:00Z')),
      entry('other')
    );

    const restored = restorePendingVotedEntry(overrides, entry(ENTITY_ID, 1));

    expect(restored.added).toEqual([entry(ENTITY_ID, 1), entry('other')]);
  });

  // Indexing caught up, so the server list owns this entity again.
  it('clears both halves of the override once the vote is indexed', () => {
    const overrides = suppressVotedId(
      restorePendingVotedEntry(EMPTY_PENDING_VOTED_OVERRIDES, entry(ENTITY_ID)),
      'other'
    );

    expect(clearPendingVotedEntity(overrides, ENTITY_ID).added).toEqual([]);
    expect(clearPendingVotedEntity(overrides, 'other').removed).toEqual([]);
  });

  it('returns the same overrides when there is nothing to clear', () => {
    const overrides = suppressVotedId(EMPTY_PENDING_VOTED_OVERRIDES, 'other');

    expect(clearPendingVotedEntity(overrides, ENTITY_ID)).toBe(overrides);
  });
});
