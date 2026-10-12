import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { NEWS_STORY_TYPE_ID } from '~/core/explore/explore-constants';
import { exploreItemTypeKey } from '~/core/explore/explore-diversity';

import { applySeenDemotion, demoteSeenInPage } from './demote-seen';
import type { SeenEntry } from './seen-store';

const NOW = 1_800_000_000;
const CONFIG = { minViews: 2, days: 3 };
const TYPE = { D: DEBATE_TYPE_ID, C: CLAIM_TYPE_ID, N: NEWS_STORY_TYPE_ID } as const;

/** A real Best window, rank order, captured 2026-09-17 (see the explore-feed-composition note). */
const RECORDED_WINDOW = 'DDDDDDDDCNDCCNNCNNNCNCDCCNNCDCNCCCCCNCCNNCNNDNNCNNCDCCCCCNNNNNNNCC';

const id = (n: number) => n.toString(16).padStart(32, '0');

function item(n: number, type: keyof typeof TYPE, extra: Partial<ExploreFeedItem> = {}): ExploreFeedItem {
  return {
    entityId: id(n),
    spaceId: 'space',
    spaceName: 'Space',
    spaceImage: null,
    types: [{ id: TYPE[type], name: type }],
    createdAtSec: 0,
    title: `item ${n}`,
    description: null,
    imageUrl: null,
    recordingUrls: [],
    debateVideoUrls: [],
    debateClaim: null,
    commentCount: 0,
    isMemberOrEditor: false,
    hasPendingMembershipRequest: false,
    ranking: { version: 'best-1' },
    ...extra,
  };
}

function window(pattern = RECORDED_WINDOW): ExploreFeedItem[] {
  return [...pattern].map((type, n) => item(n, type as keyof typeof TYPE));
}

function snapshotOf(seen: number[], engaged: number[] = []): Map<string, SeenEntry> {
  const entries = new Map<string, SeenEntry>();
  for (const n of seen) entries.set(id(n), { views: [NOW - 7_200, NOW - 3_600], engagedAt: null });
  for (const n of engaged) entries.set(id(n), { views: [NOW - 7_200, NOW - 3_600], engagedAt: NOW - 60 });
  return entries;
}

const ids = (items: readonly ExploreFeedItem[]) => items.map(entry => parseInt(entry.entityId, 16));
const types = (items: readonly ExploreFeedItem[]) => items.map(exploreItemTypeKey);

function demote(items: ExploreFeedItem[], seen: number[], options: { firstPage?: boolean; engaged?: number[] } = {}) {
  return applySeenDemotion(items, {
    config: CONFIG,
    snapshot: snapshotOf(seen, options.engaged),
    firstPage: options.firstPage ?? false,
    nowSec: NOW,
  });
}

describe('demoteSeenInPage', () => {
  it('moves seen cards after the unseen cards of their type, keeping relative order', () => {
    const page = [0, 1, 2, 3, 4, 5];
    const result = demoteSeenInPage(page, {
      isDemoted: n => n === 0 || n === 2,
      typeOf: () => 'x',
      isPinned: () => false,
      hasLead: false,
      canLead: () => false,
    });
    expect(result.items).toEqual([1, 3, 4, 5, 0, 2]);
    expect([...result.demoted].sort()).toEqual([4, 5]);
  });

  it('is the identity when nothing is seen', () => {
    const page = [0, 1, 2];
    expect(
      demoteSeenInPage(page, {
        isDemoted: () => false,
        typeOf: () => 'x',
        isPinned: () => false,
        hasLead: false,
        canLead: () => false,
      }).items
    ).toEqual(page);
  });

  it('never drops a card when a pinned card sits where the lead would', () => {
    const page = [0, 1, 2, 3];
    const result = demoteSeenInPage(page, {
      isDemoted: n => n === 0,
      typeOf: () => 'x',
      isPinned: n => n === 0,
      hasLead: true,
      canLead: () => true,
    });
    expect(result.items).toEqual(page);
  });
});

describe('applySeenDemotion', () => {
  it('keeps the type at every position, so the mix holds', () => {
    const page = window().slice(0, 22);
    const result = demote(page, [1, 2, 8, 9, 11]);

    expect(types(result)).toEqual(types(page));
    // Debates 1 and 2 go after the page's other debates; claims 8 and 11 after its other claims.
    expect(ids(result).filter(n => page[n]!.types[0]!.id === DEBATE_TYPE_ID)).toEqual([0, 3, 4, 5, 6, 7, 10, 1, 2]);
    expect(ids(result).filter(n => page[n]!.types[0]!.id === CLAIM_TYPE_ID)).toEqual([12, 15, 19, 21, 8, 11]);
  });

  it('does not demote a card the visitor engaged with', () => {
    const page = window().slice(0, 22);
    expect(ids(demote(page, [], { engaged: [0, 1, 2] }))).toEqual(ids(page));
  });

  it('marks the cards it demoted and suffixes every card version', () => {
    const page = window().slice(0, 22);
    const result = demote(page, [1]);

    expect(result.every(entry => entry.ranking?.version === 'best-1+seen.1')).toBe(true);
    expect(result.filter(entry => entry.ranking?.seenDemoted).map(entry => parseInt(entry.entityId, 16))).toEqual([1]);
  });

  it('keeps fresh-slot cards where the fresh slot put them', () => {
    const page = window().slice(0, 22);
    page[2] = item(500, 'D', { ranking: { version: 'best-1+fresh.3', slot: 'fresh' } });
    page[6] = item(501, 'C', { ranking: { version: 'best-1+fresh.3', slot: 'fresh' } });

    const result = demote(page, [0, 1, 500, 501]);

    expect(ids(result)[2]).toBe(500);
    expect(ids(result)[6]).toBe(501);
    expect(result[2]!.ranking).toEqual({ version: 'best-1+fresh.3+seen.1', slot: 'fresh' });
  });

  describe('the lead debate (GEO-3070)', () => {
    const firstPage = () => {
      const page = window().slice(0, 22);
      for (const n of [0, 3, 5]) page[n] = { ...page[n]!, playableLead: true };
      return page;
    };

    it('stays first while the visitor has not seen it', () => {
      expect(ids(demote(firstPage(), [1, 2], { firstPage: true }))[0]).toBe(0);
    });

    it('is replaced by the highest unseen playable debate once seen', () => {
      const result = demote(firstPage(), [0, 3], { firstPage: true });

      expect(ids(result)[0]).toBe(5);
      expect(result[0]!.ranking?.seenDemoted).toBeUndefined();
      // The old lead and debate 3 now trail the page's debates.
      expect(ids(result).filter(n => n < 11 && n !== 8 && n !== 9)).toEqual([5, 1, 2, 4, 6, 7, 10, 0, 3]);
      expect(types(result)).toEqual(types(firstPage()));
    });

    it('stays first, unmarked, when no other playable debate is unseen', () => {
      const result = demote(firstPage(), [0, 3, 5], { firstPage: true });

      expect(ids(result)[0]).toBe(0);
      expect(result[0]!.ranking?.seenDemoted).toBeUndefined();
    });

    it('is an ordinary card when the server marked no lead', () => {
      const page = window().slice(0, 22);
      expect(ids(demote(page, [0], { firstPage: true }))[0]).toBe(1);
    });

    it('only leads the first page', () => {
      expect(ids(demote(firstPage(), [0], { firstPage: false }))[0]).toBe(1);
    });
  });

  it('pages a whole window with nothing repeated or skipped', () => {
    const rows = window();
    const pages = [rows.slice(0, 22), rows.slice(22, 44), rows.slice(44, 66)];
    const seen = Array.from({ length: 22 }, (_, n) => n * 3);

    const served = pages.flatMap((page, index) => [...demote(page, seen, { firstPage: index === 0 })]);

    expect(served).toHaveLength(rows.length);
    expect(new Set(ids(served)).size).toBe(rows.length);
    expect(types(served)).toEqual(types(rows));
    for (const [index, page] of pages.entries()) {
      expect(ids(served.slice(index * 22, index * 22 + 22)).sort((a, b) => a - b)).toEqual(ids(page));
    }
  });

  it('returns the page untouched when off', () => {
    const page = window().slice(0, 22);
    expect(applySeenDemotion(page, { config: null, snapshot: snapshotOf([0, 1]), firstPage: true, nowSec: NOW })).toBe(
      page
    );
  });

  it('returns the page untouched when storage is unavailable', () => {
    const page = window().slice(0, 22);
    expect(applySeenDemotion(page, { config: CONFIG, snapshot: null, firstPage: true, nowSec: NOW })).toBe(page);
  });
});
