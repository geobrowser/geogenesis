import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import {
  EPISODE_TYPE_ID,
  EXPLORE_PAGE_SIZE,
  NEWS_STORY_TYPE_ID,
  TWEET_TYPE_ID,
} from './explore-constants';
import {
  EXPLORE_DIVERSITY_MAX_RUN,
  EXPLORE_DIVERSITY_WINDOW_SIZE,
  applyDiversityCap,
  exploreItemTypeKey,
  longestTypeRun,
} from './explore-diversity';
import {
  decodeExploreWindowCursor,
  encodeExploreWindowCursor,
  nextExploreWindowCursor,
} from './explore-window-cursor';

type Item = { id: string; types: { id: string }[] };

const item = (id: string, ...typeIds: string[]): Item => ({ id, types: typeIds.map(t => ({ id: t })) });

const key = exploreItemTypeKey;
const ids = (items: readonly Item[]) => items.map(i => i.id);

/**
 * The measured production mix, Best sort (GEO-2690): claims own ranks 1-30 outright, then
 * news stories run about 30% of the way down. Reproduced positionally rather than as a
 * ratio, because the whole problem is *where* the off-type items sit, not how many exist.
 */
function measuredProductionWindow(size: number): Item[] {
  const items: Item[] = [];
  for (let rank = 0; rank < size; rank++) {
    const isNews = rank >= 30 && rank % 3 === 0;
    items.push(item(`${isNews ? 'news' : 'claim'}-${rank}`, isNews ? NEWS_STORY_TYPE_ID : CLAIM_TYPE_ID));
  }
  return items;
}

describe('exploreItemTypeKey', () => {
  it('is stable across relation order', () => {
    // `types` comes from relations, whose order is not meaningful. Two identical entities
    // must not land in different diversity buckets because the rows came back swapped.
    expect(key(item('a', CLAIM_TYPE_ID, NEWS_STORY_TYPE_ID))).toBe(
      key(item('b', NEWS_STORY_TYPE_ID, CLAIM_TYPE_ID))
    );
  });

  it('classifies a multi-typed claim as its more specific type', () => {
    // Claim is declared last in EXPLORE_ENTITY_TYPES, so it loses every tie. That is the
    // useful direction: such an item can break a claim run instead of extending one.
    expect(key(item('a', CLAIM_TYPE_ID, EPISODE_TYPE_ID))).not.toBe(key(item('b', CLAIM_TYPE_ID)));
    expect(key(item('a', CLAIM_TYPE_ID, EPISODE_TYPE_ID))).toBe(key(item('c', EPISODE_TYPE_ID)));
  });

  it('is case- and hyphen-insensitive, matching the ids the feed actually returns', () => {
    const hyphenated = CLAIM_TYPE_ID.replace(/^(.{8})(.{4})/, '$1-$2').toUpperCase();
    expect(key(item('a', hyphenated))).toBe(key(item('b', CLAIM_TYPE_ID)));
  });

  it('buckets untyped entities together rather than treating each as unique', () => {
    // The activity feed sends no type whitelist. If untyped items each got their own key
    // the cap would consider a wall of them perfectly diverse.
    expect(key(item('a'))).toBe(key(item('b')));
  });

  it('keeps a stable key for types outside the explore whitelist', () => {
    const offList = 'ffffffffffffffffffffffffffffffff';
    expect(key(item('a', offList))).toBe(offList);
  });
});

describe('applyDiversityCap', () => {
  it('breaks up the measured production window on the first screen', () => {
    const window = measuredProductionWindow(EXPLORE_DIVERSITY_WINDOW_SIZE);

    // Before: the first screen is 100% claims and nothing else appears at all.
    const firstScreenBefore = window.slice(0, EXPLORE_PAGE_SIZE);
    expect(firstScreenBefore.every(i => i.id.startsWith('claim'))).toBe(true);

    const firstScreenAfter = applyDiversityCap(window, key).slice(0, EXPLORE_PAGE_SIZE);
    const news = firstScreenAfter.filter(i => i.id.startsWith('news'));

    expect(longestTypeRun(firstScreenAfter, key)).toBeLessThanOrEqual(EXPLORE_DIVERSITY_MAX_RUN);
    // A full screen holds floor(22 / (3 + 1)) = 5 breaks: five runs of three claims each
    // separated by one off-type item, then a short trailing run with nothing to separate
    // it from. So 5 news / 17 claims is the cap working exactly, not falling short.
    const expectedBreaks = Math.floor(EXPLORE_PAGE_SIZE / (EXPLORE_DIVERSITY_MAX_RUN + 1));
    expect(expectedBreaks).toBe(5);
    expect(news.length).toBeGreaterThanOrEqual(expectedBreaks);
    // The measured 100% is now at most 77%, which is the floor a run cap alone can reach.
    expect(firstScreenAfter.length - news.length).toBeLessThanOrEqual(
      EXPLORE_PAGE_SIZE - expectedBreaks
    );
  });

  it('caps runs across the whole window, not just the first page', () => {
    const ordered = applyDiversityCap(measuredProductionWindow(EXPLORE_DIVERSITY_WINDOW_SIZE), key);
    // The window's own tail is all claims once the news is spent, so the run cap can only
    // hold while off-type items remain — assert it holds for as long as they do.
    let lastNews = -1;
    ordered.forEach((entry, index) => {
      if (entry.id.startsWith('news')) lastNews = index;
    });
    expect(lastNews).toBeGreaterThan(EXPLORE_PAGE_SIZE);
    expect(longestTypeRun(ordered.slice(0, lastNews + 1), key)).toBeLessThanOrEqual(EXPLORE_DIVERSITY_MAX_RUN);
  });

  it('never drops or duplicates an item', () => {
    const window = measuredProductionWindow(EXPLORE_DIVERSITY_WINDOW_SIZE);
    const ordered = applyDiversityCap(window, key);
    expect(ordered).toHaveLength(window.length);
    expect(new Set(ids(ordered)).size).toBe(window.length);
    expect(ids(ordered).sort()).toEqual(ids(window).sort());
  });

  it('extends a run rather than truncating when nothing else is left', () => {
    // A single-type feed (type filter narrowed to one) must come back whole and in order.
    const claims = Array.from({ length: 10 }, (_, i) => item(`claim-${i}`, CLAIM_TYPE_ID));
    expect(ids(applyDiversityCap(claims, key))).toEqual(ids(claims));
  });

  it('promotes the highest-ranked off-type item, so demotions are minimal', () => {
    const window = [
      item('c1', CLAIM_TYPE_ID),
      item('c2', CLAIM_TYPE_ID),
      item('c3', CLAIM_TYPE_ID),
      item('c4', CLAIM_TYPE_ID),
      item('n1', NEWS_STORY_TYPE_ID),
      item('t1', TWEET_TYPE_ID),
    ];
    // n1 is the next non-claim by rank, so it — not t1 — fills the gap after c3.
    expect(ids(applyDiversityCap(window, key))).toEqual(['c1', 'c2', 'c3', 'n1', 'c4', 't1']);
  });

  it('leaves an already-diverse list untouched', () => {
    const window = [
      item('n1', NEWS_STORY_TYPE_ID),
      item('c1', CLAIM_TYPE_ID),
      item('t1', TWEET_TYPE_ID),
      item('c2', CLAIM_TYPE_ID),
    ];
    expect(ids(applyDiversityCap(window, key))).toEqual(ids(window));
  });

  it('is a pure function of its input, which is what makes the window pageable', () => {
    // The window is re-derived on each request and sliced deeper; if the reorder were not
    // deterministic, items would repeat or vanish between pages.
    const window = measuredProductionWindow(EXPLORE_DIVERSITY_WINDOW_SIZE);
    expect(ids(applyDiversityCap(window, key))).toEqual(ids(applyDiversityCap(window, key)));
    expect(ids(window)).toEqual(ids(measuredProductionWindow(EXPLORE_DIVERSITY_WINDOW_SIZE)));
  });

  it('treats a non-positive cap as off', () => {
    const window = measuredProductionWindow(12);
    expect(ids(applyDiversityCap(window, key, 0))).toEqual(ids(window));
  });
});

describe('longestTypeRun', () => {
  it('counts consecutive same-type items, not totals', () => {
    const window = [
      item('c1', CLAIM_TYPE_ID),
      item('c2', CLAIM_TYPE_ID),
      item('n1', NEWS_STORY_TYPE_ID),
      item('c3', CLAIM_TYPE_ID),
    ];
    expect(longestTypeRun(window, key)).toBe(2);
    expect(longestTypeRun([], key)).toBe(0);
  });
});

describe('explore window cursor', () => {
  it('round-trips', () => {
    for (const cursor of [
      { after: null, offset: 0 },
      { after: 'WyJuYXR1cmFsIiwgNjZd', offset: 22 },
      { after: 'a+b/c=', offset: 44 },
    ]) {
      expect(decodeExploreWindowCursor(encodeExploreWindowCursor(cursor))).toEqual(cursor);
    }
  });

  it('reads a bare server cursor as the start of a window', () => {
    // Clients mid-scroll when this ships still hold plain cursors.
    expect(decodeExploreWindowCursor('WyJuYXR1cmFsIiwgMzBd')).toEqual({
      after: 'WyJuYXR1cmFsIiwgMzBd',
      offset: 0,
    });
    expect(decodeExploreWindowCursor(null)).toEqual({ after: null, offset: 0 });
  });

  it('falls back to the first window on anything malformed', () => {
    expect(decodeExploreWindowCursor('w1:')).toEqual({ after: null, offset: 0 });
    expect(decodeExploreWindowCursor('w1:abc:xyz')).toEqual({ after: 'xyz', offset: 0 });
    expect(decodeExploreWindowCursor('w1:-4:xyz')).toEqual({ after: 'xyz', offset: 0 });
  });

  it('walks the window before stepping to the next one', () => {
    const window = { windowLength: 66, hasNextPage: true, endCursor: 'END' };
    expect(nextExploreWindowCursor({ ...window, after: null, offset: 0, served: 22 })).toBe('w1:22:');
    expect(nextExploreWindowCursor({ ...window, after: null, offset: 22, served: 22 })).toBe('w1:44:');
    expect(nextExploreWindowCursor({ ...window, after: null, offset: 44, served: 22 })).toBe('w1:0:END');
  });

  it('keeps the window start while paging within it', () => {
    expect(
      nextExploreWindowCursor({
        after: 'START',
        offset: 22,
        served: 22,
        windowLength: 66,
        hasNextPage: true,
        endCursor: 'END',
      })
    ).toBe('w1:44:START');
  });

  it('ends the feed when the last window is exhausted', () => {
    expect(
      nextExploreWindowCursor({
        after: 'START',
        offset: 44,
        served: 10,
        windowLength: 54,
        hasNextPage: false,
        endCursor: 'END',
      })
    ).toBeNull();
  });

  it('ends the feed rather than restarting it when the server offers no cursor', () => {
    // hasNextPage with a null endCursor would re-encode `after: null`, i.e. window one —
    // an infinite scroll that never leaves the first screen.
    expect(
      nextExploreWindowCursor({
        after: 'START',
        offset: 44,
        served: 22,
        windowLength: 66,
        hasNextPage: true,
        endCursor: null,
      })
    ).toBeNull();
  });

  it('advances past a window that came back shorter than the offset', () => {
    // Rows shift under a reader mid-scroll; this must move on, not serve nothing forever.
    expect(
      nextExploreWindowCursor({
        after: 'START',
        offset: 44,
        served: 0,
        windowLength: 12,
        hasNextPage: true,
        endCursor: 'END',
      })
    ).toBe('w1:0:END');
  });
});

describe('paging the reordered window end to end', () => {
  it('serves every item exactly once, in the reordered order', () => {
    const window = applyDiversityCap(measuredProductionWindow(EXPLORE_DIVERSITY_WINDOW_SIZE), key);

    const served: Item[] = [];
    let cursor: string | null = null;
    for (let request = 0; request < 10; request++) {
      const { offset } = decodeExploreWindowCursor(cursor);
      const slice = window.slice(offset, offset + EXPLORE_PAGE_SIZE);
      served.push(...slice);
      cursor = nextExploreWindowCursor({
        after: null,
        offset,
        served: slice.length,
        windowLength: window.length,
        hasNextPage: false,
        endCursor: null,
      });
      if (cursor === null) break;
    }

    expect(cursor).toBeNull();
    expect(ids(served)).toEqual(ids(window));
  });
});
