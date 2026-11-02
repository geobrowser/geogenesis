import { describe, expect, it } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';
import type { ExploreFeedItem } from '~/core/explore/explore-card-item';
import { exploreItemTypeKey } from '~/core/explore/explore-diversity';

import { composeSeenPages } from './hide-seen';
import type { SeenEntry } from './seen-store';

const NOW = 1_800_000_000;
const CONFIG = { minViews: 2, days: 3 };
const TYPE = { D: DEBATE_TYPE_ID, C: CLAIM_TYPE_ID } as const;
const id = (n: number) => n.toString(16).padStart(32, '0');

function item(n: number, type: keyof typeof TYPE, extra: Partial<ExploreFeedItem> = {}): ExploreFeedItem {
  return {
    entityId: id(n),
    spaceId: 'space',
    spaceName: 'Space',
    spaceImage: null,
    types: [{ id: TYPE[type], name: type }],
    createdAtSec: n,
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

/** Items numbered from `start`, one per letter of the pattern. */
const run = (pattern: string, start = 0, extra: Partial<ExploreFeedItem> = {}) =>
  [...pattern].map((type, i) => item(start + i, type as keyof typeof TYPE, extra));

function snapshotOf(seen: number[], engaged: number[] = [], once: number[] = []) {
  const entries = new Map<string, SeenEntry>();
  for (const n of seen) entries.set(id(n), { views: [NOW - 7_200, NOW - 3_600], engagedAt: null });
  for (const n of engaged) entries.set(id(n), { views: [NOW - 7_200, NOW - 3_600], engagedAt: NOW - 60 });
  for (const n of once) entries.set(id(n), { views: [NOW - 3_600], engagedAt: null });
  return entries;
}

const compose = (
  pages: { items: ExploreFeedItem[]; reserve?: ExploreFeedItem[] }[],
  snapshot: Map<string, SeenEntry> | null
) =>
  composeSeenPages(
    pages.map(p => ({ ...p, config: CONFIG })),
    { snapshot, nowSec: NOW }
  );
const ids = (items: readonly ExploreFeedItem[]) => items.map(entry => parseInt(entry.entityId, 16));
const types = (items: readonly ExploreFeedItem[]) => items.map(entry => exploreItemTypeKey(entry));

describe('hide threshold', () => {
  it('hides a card seen N times and keeps one seen fewer times', () => {
    const items = run('CCCC');
    const out = compose([{ items }], snapshotOf([1], [], [2]));
    expect(ids(out)).toEqual([0, 2, 3]);
  });

  it('does not hide views older than D days', () => {
    const old = new Map<string, SeenEntry>([
      [id(1), { views: [NOW - 5 * 86_400, NOW - 5 * 86_400 + 60], engagedAt: null }],
    ]);
    expect(ids(compose([{ items: run('CCC') }], old))).toEqual([0, 1, 2]);
  });
});

describe('engaged cards', () => {
  it('are never hidden', () => {
    const out = compose([{ items: run('CCC') }], snapshotOf([], [1]));
    expect(ids(out)).toEqual([0, 1, 2]);
  });
});

describe('filling', () => {
  it('fills a hidden claim slot from the reserve with a claim, keeping the type mix', () => {
    const items = run('CDCC');
    const reserve = run('DCC', 10);
    const out = compose([{ items, reserve }], snapshotOf([0, 2]));
    expect(types(out)).toEqual(types(items));
    expect(ids(out)).toEqual([3, 1, 11, 12]);
  });

  it('comes up short, not mixed differently, when the reserve has no card of the type', () => {
    const out = compose([{ items: run('CDC'), reserve: run('D', 10) }], snapshotOf([0, 2]));
    expect(types(out)).toEqual([types(run('D'))[0]]);
  });

  it('counts the hidden cards on every card of the page', () => {
    const out = compose([{ items: run('CCC') }], snapshotOf([1]));
    expect(out.every(entry => entry.ranking?.version === 'best-1+seen.2' && entry.ranking.seenHidden === 1)).toBe(true);
  });
});

describe('debates', () => {
  it('are hidden while an unseen debate remains on offer', () => {
    const out = compose([{ items: run('DDC'), reserve: run('D', 10) }], snapshotOf([0, 1]));
    expect(ids(out)).toEqual([10, 2]);
  });

  it('show in plain Best order once every debate on offer has been seen', () => {
    const out = compose([{ items: run('DDC'), reserve: run('D', 10) }], snapshotOf([0, 1, 10]));
    expect(ids(out)).toEqual([0, 1, 2]);
  });
});

describe('lead debate', () => {
  const lead = (n: number, extra: Partial<ExploreFeedItem> = {}) => item(n, 'D', { playableLead: true, ...extra });

  it('is the newest unseen playable debate', () => {
    const items = [lead(0, { createdAtSec: 100 }), item(1, 'C'), lead(2, { createdAtSec: 300 }), item(3, 'D')];
    const out = compose([{ items }], snapshotOf([]));
    expect(ids(out)[0]).toBe(2);
    expect(ids(out)).toEqual([2, 1, 0, 3]);
  });

  it('skips a seen lead for an unseen playable one, even from the reserve', () => {
    const out = compose([{ items: [lead(0), item(1, 'C')], reserve: [lead(10)] }], snapshotOf([0]));
    expect(ids(out)).toEqual([10, 1]);
  });

  it('stays the server lead when every playable debate is seen', () => {
    const out = compose([{ items: [lead(0), item(1, 'C'), item(2, 'D')], reserve: [] }], snapshotOf([0, 2]));
    expect(ids(out)).toEqual([0, 1, 2]);
  });

  it('applies to the first page only', () => {
    const second = [lead(5, { createdAtSec: 1 }), lead(6, { createdAtSec: 999 })];
    const out = compose([{ items: [item(0, 'C')] }, { items: second }], snapshotOf([]));
    expect(ids(out)).toEqual([0, 5, 6]);
  });
});

describe('paging', () => {
  it('shows no card twice when a reserve is the next page', () => {
    const all = run('CDCCDCCDCCDC');
    const page1 = { items: all.slice(0, 4), reserve: all.slice(4, 8) };
    const page2 = { items: all.slice(4, 8), reserve: all.slice(8, 12) };
    const page3 = { items: all.slice(8, 12), reserve: [] };
    const out = compose([page1, page2, page3], snapshotOf([0, 2, 5]));
    const seenIds = ids(out);
    expect(new Set(seenIds).size).toBe(seenIds.length);
    expect(seenIds).not.toContain(0);
    expect(seenIds).not.toContain(2);
  });

  it('is the same every time it is composed', () => {
    const pages = [
      { items: run('CDCC'), reserve: run('CCD', 10) },
      { items: run('CCD', 10), reserve: [] },
    ];
    const snap = snapshotOf([0, 11]);
    expect(ids(compose(pages, snap))).toEqual(ids(compose(pages, snap)));
  });
});

describe('storage unavailable', () => {
  it('changes nothing, hides nothing and marks nothing', () => {
    const items = run('CDC');
    const out = compose([{ items, reserve: run('C', 10) }], null);
    expect(out).toEqual(items);
  });

  it('leaves a page without a config alone', () => {
    const items = run('CC');
    expect(composeSeenPages([{ items, config: null }], { snapshot: snapshotOf([0, 1]), nowSec: NOW })).toEqual(items);
  });
});
