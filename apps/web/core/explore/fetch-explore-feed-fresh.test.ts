import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { type DocumentNode, print } from 'graphql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { DEFAULT_FRESH_SLOT_CONFIG, type FreshSlotConfig } from './fresh-slot/fresh-slot-config';
import { FRESH_SLOT_AS_OF_STEP_MS, decodeFreshSlotCursor } from './fresh-slot/fresh-slot-cursor';

/**
 * GEO-3221. The fresh slot inside the real feed: Best's ranked windows from the by-type connection,
 * the Fresh list from New's connection, both served by the mocked `graphql` boundary. What these
 * pin is the part the pure merge cannot: that a whole scroll, page by page and window by window,
 * serves every Best row and every fresh item exactly once.
 */
const graph = vi.hoisted(() => ({
  best: [] as unknown[],
  fresh: [] as unknown[],
  freshCalls: [] as Record<string, unknown>[],
  freshQueries: [] as unknown[],
  bestCalls: 0,
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ query, variables }: { query: any; variables: Record<string, unknown> }) => {
    const operation =
      query.definitions.find((definition: any) => definition.kind === 'OperationDefinition')?.name?.value ?? '';
    if (operation === 'ExploreBestByTypeConnection') {
      graph.bestCalls += 1;
      const offset = Number(variables.offset);
      const first = Number(variables.first);
      const entities = graph.best.slice(offset, offset + first);
      return Effect.succeed({
        entities,
        endCursor: String(offset + entities.length),
        hasNextPage: offset + first < graph.best.length,
      });
    }
    if (operation === 'ExploreEntitiesConnection') {
      graph.freshCalls.push(variables);
      graph.freshQueries.push(query);
      return Effect.succeed({ entities: graph.fresh, endCursor: null, hasNextPage: false });
    }
    throw new Error(`unexpected operation ${operation}`);
  },
}));
vi.mock('~/core/io/subgraph', () => ({ fetchProfile: () => Effect.succeed(null) }));
vi.mock('~/core/io/subgraph/fetch-proposed-members', () => ({ fetchActiveMemberRequest: async () => null }));

const { FRESH_LIST_MAX_STALE_MS, fetchExploreFeed, warmSharedFreshList } = await import('./fetch-explore-feed');
const { encodeExploreWindowCursor } = await import('./explore-window-cursor');
const { setSharedFreshListStoreForTests } = await import('./fresh-slot/shared-fresh-list');
const { setRecentFreshScopeStoreForTests } = await import('./fresh-slot/recent-fresh-scopes');
const { resetRecordedScopesForTests } = await import('./fetch-explore-feed');

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const browse = {
  featured: [{ id: SPACE, name: 'Space', image: null }],
  editorOf: [],
  memberOf: [],
  documentationImage: null,
  personalSpaceId: null,
} as never;

function entity(id: string, typeId: string) {
  return {
    id,
    name: `entity-${id}`,
    description: null,
    spaces: [SPACE],
    types: [{ id: typeId, name: null }],
    values: [],
    relations: [
      {
        id: `rel-${id}`,
        spaceId: SPACE,
        type: { id: SystemIds.TYPES_PROPERTY },
        toEntity: { id: typeId, name: null, types: [], values: [] },
      },
    ],
    commentCount: 0,
    createdAt: '1780000000',
  } as never;
}

const id = (prefix: string, i: number) => `${prefix}${String(i).padStart(31 - prefix.length, '0')}${i % 10}`;
const bestIds = Array.from({ length: 150 }, (_, i) => id('b', i));
const freshIds = Array.from({ length: 12 }, (_, i) => id('f', i));

const ON: FreshSlotConfig = {
  ...DEFAULT_FRESH_SLOT_CONFIG,
  enabled: true,
  cadence: 4,
  firstPosition: 3,
  maxPerPage: 3,
  freshnessHours: 48,
};

let clock = 1_790_000_000_000;

beforeEach(() => {
  graph.best = bestIds.map((value, i) => entity(value, i % 3 === 0 ? DEBATE_TYPE_ID : CLAIM_TYPE_ID));
  // Two of the fresh items are also in Best: one in the first window, one in the second.
  graph.fresh = [
    ...freshIds.map((value, i) => entity(value, i % 2 === 0 ? CLAIM_TYPE_ID : DEBATE_TYPE_ID)),
    entity(bestIds[5]!, CLAIM_TYPE_ID),
    entity(bestIds[100]!, CLAIM_TYPE_ID),
  ];
  graph.freshCalls = [];
  graph.freshQueries = [];
  graph.bestCalls = 0;
  // A different instant per test, so the module's Fresh list cache never carries between tests.
  clock += 10_000_000;
});

async function scroll(
  freshSlot: { config: FreshSlotConfig; revision: number } | undefined,
  first: string | null = null
) {
  const pages: Awaited<ReturnType<typeof fetchExploreFeed>>[] = [];
  let cursor = first;
  for (let i = 0; i < 30; i += 1) {
    // The clock moves on between pages, as it does for a reader; the cursor's pin must hold.
    const now = clock + i * 3_600_000;
    const page = await fetchExploreFeed({
      browse,
      sort: 'best',
      time: 'all',
      spaceFilterIds: null,
      cursor,
      memberOrEditorSpaceIds: [],
      typeIds: [DEBATE_TYPE_ID, CLAIM_TYPE_ID],
      freshSlot: freshSlot ? { ...freshSlot, now } : undefined,
    });
    pages.push(page);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return pages;
}

describe('a whole scroll with the fresh slot on', () => {
  it('serves every Best row and every fresh item exactly once, across pages and windows', async () => {
    const pages = await scroll({ config: ON, revision: 7 });
    const served = pages.flatMap(page => page.items.map(item => item.entityId));

    expect(new Set(served).size).toBe(served.length);
    expect(new Set(served)).toEqual(new Set([...bestIds, ...freshIds]));
    // Spans more than one Best window, which is where a skip or a repeat would come from.
    expect(graph.bestCalls).toBeGreaterThan(pages.length / 3);
  });

  it('places fresh items at P, P+N, ... and at most K per page', async () => {
    const pages = await scroll({ config: ON, revision: 7 });
    const positions = pages.map(page =>
      page.items.flatMap((item, index) => (item.ranking?.slot === 'fresh' ? [index + 1] : []))
    );
    expect(positions[0]).toEqual([3, 7, 11]);
    for (const page of positions) expect(page.length).toBeLessThanOrEqual(3);
    expect(positions.flat()).toHaveLength(freshIds.length);
  });

  it('marks fresh cards and versions the page with the config revision', async () => {
    const [page] = await scroll({ config: ON, revision: 7 });
    expect(page?.feed).toEqual({ name: 'best', version: 'best-1+fresh.7' });
    const fresh = page!.items.filter(item => item.ranking?.slot === 'fresh');
    expect(fresh.map(item => item.ranking)).toEqual(fresh.map(() => ({ version: 'best-1+fresh.7', slot: 'fresh' })));
  });

  it('shows an item that is already in Best from Best', async () => {
    const pages = await scroll({ config: ON, revision: 1 });
    const items = pages.flatMap(page => page.items);
    expect(items.find(item => item.entityId === bestIds[5])?.ranking?.slot).toBeUndefined();
  });

  it('applies the per-type cap', async () => {
    const pages = await scroll({ config: { ...ON, perTypeCaps: { [DEBATE_TYPE_ID]: 1 } }, revision: 1 });
    for (const page of pages) {
      const freshDebates = page.items.filter(
        item => item.ranking?.slot === 'fresh' && item.types.some(type => type.id === DEBATE_TYPE_ID)
      );
      expect(freshDebates.length).toBeLessThanOrEqual(1);
    }
  });

  it('asks for items created inside the freshness window, pinned for the whole scroll', async () => {
    await scroll({ config: { ...ON, freshnessHours: 24 }, revision: 1 });
    const ranges = graph.freshCalls.map(variables => JSON.stringify(variables.filter));
    // GEO-3279: the scroll is pinned to the start of the minute it began in.
    const asOf = Math.floor(clock / FRESH_SLOT_AS_OF_STEP_MS) * (FRESH_SLOT_AS_OF_STEP_MS / 1000);
    expect(ranges[0]).toContain(
      `"createdAt":{"greaterThanOrEqualTo":"${asOf - 24 * 3600}","lessThanOrEqualTo":"${asOf}"}`
    );
    // Later pages ran hours later and still asked for the same range (or were served from cache).
    expect(new Set(ranges).size).toBe(1);
  });

  it('asks for the Fresh list without hasNextPage, which re-runs the whole filter', async () => {
    await scroll({ config: { ...ON, freshnessHours: 24 }, revision: 1 });
    expect(graph.freshQueries.length).toBeGreaterThan(0);
    for (const query of graph.freshQueries) expect(print(query as DocumentNode)).not.toContain('hasNextPage');
  });
});

// GEO-3279. A new scroll starts from the newest Fresh list this instance holds, and the current
// minute's list loads behind the response for the next one.
describe('a new scroll while an older Fresh list is held', () => {
  const minute = (at: number) => Math.floor(at / FRESH_SLOT_AS_OF_STEP_MS) * FRESH_SLOT_AS_OF_STEP_MS;
  const firstPage = (now: number) =>
    fetchExploreFeed({
      browse,
      sort: 'best',
      time: 'all',
      spaceFilterIds: null,
      cursor: null,
      memberOrEditorSpaceIds: [],
      typeIds: [DEBATE_TYPE_ID, CLAIM_TYPE_ID],
      freshSlot: { config: ON, revision: 1, now },
    });
  const freshItems = (page: Awaited<ReturnType<typeof fetchExploreFeed>>) =>
    page.items.filter(item => item.ranking?.slot === 'fresh').map(item => item.entityId);
  const pinOf = (page: Awaited<ReturnType<typeof fetchExploreFeed>>) =>
    decodeFreshSlotCursor(page.nextCursor, 0).asOfMs;
  const upperBounds = () =>
    graph.freshCalls.map(variables => JSON.stringify(variables.filter).match(/"lessThanOrEqualTo":"(\d+)"/)?.[1]);

  it('serves the held list at once, pins the scroll to it, and refreshes behind the response', async () => {
    const before = await firstPage(clock);
    expect(upperBounds()).toEqual([String(minute(clock) / 1000)]);

    // An item created since: the held list does not have it.
    const newest = id('n', 1);
    graph.fresh = [entity(newest, CLAIM_TYPE_ID), ...graph.fresh];
    const later = clock + 5 * FRESH_SLOT_AS_OF_STEP_MS;

    const served = await firstPage(later);
    expect(freshItems(served)).toEqual(freshItems(before));
    expect(freshItems(served)).not.toContain(newest);
    expect(pinOf(served)).toBe(minute(clock));

    await vi.waitFor(() => expect(upperBounds()).toEqual([minute(clock), minute(later)].map(ms => String(ms / 1000))));
    // Let the background load settle before the next scroll reads what it left.
    await new Promise(resolve => setTimeout(resolve, 0));

    const next = await firstPage(later + 1_000);
    expect(freshItems(next)).toContain(newest);
    expect(pinOf(next)).toBe(minute(later));
    expect(graph.freshCalls).toHaveLength(2);
  });

  it('waits for a new list when the held one is too old', async () => {
    await firstPage(clock);
    const later = clock + FRESH_LIST_MAX_STALE_MS + FRESH_SLOT_AS_OF_STEP_MS;
    const page = await firstPage(later);
    expect(pinOf(page)).toBe(minute(later));
    expect(upperBounds()).toEqual([minute(clock), minute(later)].map(ms => String(ms / 1000)));
  });
});

// GEO-3279. A cold instance holds no Fresh list of its own; it starts from one another instance
// shared through Upstash, instead of paying the Fresh query in front of its first response.
describe('a Fresh list shared between instances', () => {
  const minute = (at: number) => Math.floor(at / FRESH_SLOT_AS_OF_STEP_MS) * FRESH_SLOT_AS_OF_STEP_MS;
  const shared = new Map<string, string>();
  const writes: { value: string; ttlMs: number }[] = [];
  const page = (now: number, cursor: string | null = null) =>
    fetchExploreFeed({
      browse,
      sort: 'best',
      time: 'all',
      spaceFilterIds: null,
      cursor,
      memberOrEditorSpaceIds: [],
      typeIds: [DEBATE_TYPE_ID, CLAIM_TYPE_ID],
      freshSlot: { config: ON, revision: 1, now },
    });
  const freshItems = (served: Awaited<ReturnType<typeof fetchExploreFeed>>) =>
    served.items.filter(item => item.ranking?.slot === 'fresh').map(item => item.entityId);
  /** What another instance would have shared: a list pinned at `asOfMs` with only `ids` in it. */
  const shareFromElsewhere = (asOfMs: number, ids: string[]) => {
    const [key] = [...shared.keys()];
    shared.set(
      key!,
      JSON.stringify({
        asOfMs,
        page: { entities: ids.map(value => entity(value, CLAIM_TYPE_ID)), endCursor: null, hasNextPage: false },
      })
    );
  };

  beforeEach(() => {
    shared.clear();
    writes.length = 0;
    setSharedFreshListStoreForTests({
      read: async key => shared.get(key) ?? null,
      write: async (key, value, ttlMs) => {
        shared.set(key, value);
        writes.push({ value, ttlMs });
      },
    });
    return () => setSharedFreshListStoreForTests(null);
  });

  it('shares the list it built, for as long as a scroll may start from it', async () => {
    await page(clock);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.parse(writes[0]!.value).asOfMs).toBe(minute(clock));
    expect(writes[0]!.ttlMs).toBe(FRESH_LIST_MAX_STALE_MS);
  });

  it('starts a scroll from a shared list without querying, and pins the scroll to it', async () => {
    // Learn the scope's key, then stand in for another instance's newer list. This instance's own
    // list is too old to serve, so only the shared one can answer without a query.
    await page(clock);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const later = clock + FRESH_LIST_MAX_STALE_MS + 10 * FRESH_SLOT_AS_OF_STEP_MS;
    const elsewhere = [id('s', 1), id('s', 2), id('s', 3)];
    shareFromElsewhere(minute(later - 2 * FRESH_SLOT_AS_OF_STEP_MS), elsewhere);
    graph.freshCalls = [];

    const served = await page(later);
    expect(freshItems(served)).toEqual(elsewhere);
    expect(decodeFreshSlotCursor(served.nextCursor, 0).asOfMs).toBe(minute(later - 2 * FRESH_SLOT_AS_OF_STEP_MS));
    // The current minute's list loads behind the response, as for a list held locally.
    await vi.waitFor(() => expect(graph.freshCalls).toHaveLength(1));
  });

  it('ignores a shared list too old to start from', async () => {
    await page(clock);
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    const later = clock + 2 * FRESH_LIST_MAX_STALE_MS;
    shareFromElsewhere(minute(later) - FRESH_LIST_MAX_STALE_MS - FRESH_SLOT_AS_OF_STEP_MS, [id('s', 1)]);
    graph.freshCalls = [];

    const served = await page(later);
    expect(decodeFreshSlotCursor(served.nextCursor, 0).asOfMs).toBe(minute(later));
    expect(graph.freshCalls).toHaveLength(1);
  });

  // GEO-3308. The scheduled warm-up builds the list the request path would, under the same key.
  describe('warmed by the schedule', () => {
    const warm = (now: number) =>
      warmSharedFreshList({
        spaceIds: [SPACE],
        time: 'all',
        typeIds: [DEBATE_TYPE_ID, CLAIM_TYPE_ID],
        freshnessHours: ON.freshnessHours,
        now,
      });

    it("shares this minute's list before it returns", async () => {
      await warm(clock);
      expect(writes).toHaveLength(1);
      expect(JSON.parse(writes[0]!.value).asOfMs).toBe(minute(clock));
      expect(writes[0]!.ttlMs).toBe(FRESH_LIST_MAX_STALE_MS);
      expect(graph.freshCalls).toHaveLength(1);
    });

    it('leaves a first page that follows nothing to refresh, under the key the request path reads', async () => {
      await warm(clock);
      const [warmedKey] = [...shared.keys()];
      graph.freshCalls = [];

      const served = await page(clock + 5_000);
      expect(freshItems(served).length).toBeGreaterThan(0);
      expect(graph.freshCalls).toHaveLength(0);
      expect([...shared.keys()]).toEqual([warmedKey]);
      expect(writes).toHaveLength(1);
    });
  });

  it('queries as before when the shared store fails', async () => {
    setSharedFreshListStoreForTests({
      read: async () => {
        throw new Error('upstash down');
      },
      write: async () => {
        throw new Error('upstash down');
      },
    });
    const served = await page(clock);
    expect(freshItems(served).length).toBeGreaterThan(0);
    expect(graph.freshCalls).toHaveLength(1);
  });
});

// GEO-3308. A signed-in reader's scope holds their own spaces; it is recorded so the cron can warm it.
describe('recording the scopes readers request', () => {
  const OTHER = 'cccccccccccccccccccccccccccccccc';
  const members: { member: string; scoreMs: number }[] = [];
  const shared = new Map<string, string>();
  const sharedKeys: string[] = [];
  const signedIn = {
    ...(browse as object),
    memberOf: [{ id: OTHER, name: 'Mine', image: null }],
  } as never;
  const firstPage = (now: number) =>
    fetchExploreFeed({
      browse: signedIn,
      sort: 'best',
      time: 'all',
      spaceFilterIds: null,
      cursor: null,
      memberOrEditorSpaceIds: [OTHER],
      typeIds: [DEBATE_TYPE_ID, CLAIM_TYPE_ID],
      freshSlot: { config: ON, revision: 1, now },
    });

  beforeEach(() => {
    members.length = 0;
    shared.clear();
    sharedKeys.length = 0;
    resetRecordedScopesForTests();
    setRecentFreshScopeStoreForTests({
      add: async (member, scoreMs) => {
        members.push({ member, scoreMs });
      },
      newest: async () => [],
      trim: async () => {},
    });
    setSharedFreshListStoreForTests({
      read: async key => shared.get(key) ?? null,
      write: async (key, value) => {
        shared.set(key, value);
        sharedKeys.push(key);
      },
    });
    return () => {
      setRecentFreshScopeStoreForTests(null);
      setSharedFreshListStoreForTests(null);
    };
  });

  it('records the scope inputs only, once per minute', async () => {
    await firstPage(clock);
    await vi.waitFor(() => expect(members).toHaveLength(1));
    expect(JSON.parse(members[0]!.member)).toEqual({
      spaceIds: [SPACE, OTHER].sort(),
      typeIds: [DEBATE_TYPE_ID, CLAIM_TYPE_ID].sort(),
      time: 'all',
      requireName: null,
      requireDebateTagOnClaims: null,
      freshnessHours: ON.freshnessHours,
    });
    await firstPage(clock + 1_000);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(members).toHaveLength(1);
  });

  it('serves the page when recording fails', async () => {
    setRecentFreshScopeStoreForTests({
      add: async () => {
        throw new Error('upstash down');
      },
      newest: async () => [],
      trim: async () => {},
    });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const served = await firstPage(clock);
    expect(served.items.some(item => item.ranking?.slot === 'fresh')).toBe(true);
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    error.mockRestore();
  });

  it('warms under exactly the key the request path wrote, from the recorded inputs', async () => {
    await firstPage(clock);
    await vi.waitFor(() => expect(members).toHaveLength(1));
    await vi.waitFor(() => expect(sharedKeys).toHaveLength(1));
    const recorded = JSON.parse(members[0]!.member);

    await warmSharedFreshList({ ...recorded, now: clock + 120_000 });
    expect(sharedKeys).toHaveLength(2);
    expect(sharedKeys[1]).toBe(sharedKeys[0]);
  });
});

describe('when the fresh slot is off or does not apply', () => {
  it('serves exactly Best, with no fresh query', async () => {
    const plain = await scroll(undefined);
    const disabled = await scroll({ config: DEFAULT_FRESH_SLOT_CONFIG, revision: 3 });
    expect(disabled.map(page => page.items.map(item => item.entityId))).toEqual(
      plain.map(page => page.items.map(item => item.entityId))
    );
    expect(disabled.map(page => page.nextCursor)).toEqual(plain.map(page => page.nextCursor));
    expect(disabled[0]?.feed).toEqual({ name: 'best', version: 'best-1' });
    expect(graph.freshCalls).toHaveLength(0);
  });

  it('leaves a scroll that began without it as it was', async () => {
    const pages = await scroll({ config: ON, revision: 1 }, encodeExploreWindowCursor({ after: null, offset: 22 }));
    expect(pages.flatMap(page => page.items).some(item => item.ranking?.slot === 'fresh')).toBe(false);
    expect(graph.freshCalls).toHaveLength(0);
  });

  it('pages on without it when it is switched off mid-scroll', async () => {
    const [first] = await scroll({ config: ON, revision: 1 });
    graph.freshCalls = [];
    const rest = await scroll(undefined, first!.nextCursor);
    expect(rest[0]?.items.length).toBeGreaterThan(0);
    expect(graph.freshCalls).toHaveLength(0);
  });

  it('serves Best when the fresh list fails', async () => {
    graph.fresh = null as never;
    const [page] = await scroll({ config: ON, revision: 1 });
    expect(page?.items.length).toBe(22);
    expect(page?.items.some(item => item.ranking?.slot === 'fresh')).toBe(false);
  });
});

// GEO-3234. The browser may replace a lead its visitor has seen only with a debate the server
// verified, so Best marks them, and only while seen demotion is on.
describe('playable lead marks', () => {
  async function firstPage(markPlayableLeads: boolean, stills: string[] = []) {
    const playable = new Set([bestIds[3], bestIds[6]]);
    vi.stubGlobal('fetch', async (url: string) => {
      const debateId = url.split('/debates/')[1]?.split('/')[0]?.replace(/-/g, '');
      const ok = playable.has(debateId);
      const artifacts = ok ? [{ kind: 'final_video' }, ...stills.map(kind => ({ kind }))] : [];
      return new Response(JSON.stringify({ artifacts }), { status: 200 });
    });
    try {
      return await fetchExploreFeed({
        browse,
        sort: 'best',
        time: 'all',
        spaceFilterIds: null,
        cursor: null,
        memberOrEditorSpaceIds: [],
        typeIds: [DEBATE_TYPE_ID, CLAIM_TYPE_ID],
        leadWithPlayableDebate: true,
        markPlayableLeads,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it('marks the verified debates on the page, the lead first', async () => {
    const page = await firstPage(true);
    expect(page.items[0]?.entityId).toBe(bestIds[3]);
    expect(page.items.filter(item => item.playableLead).map(item => item.entityId)).toEqual([bestIds[3], bestIds[6]]);
  });

  it('marks nothing while seen demotion is off', async () => {
    const page = await firstPage(false);
    expect(page.items[0]?.entityId).toBe(bestIds[3]);
    expect(page.items.some(item => 'playableLead' in item)).toBe(false);
  });

  // GEO-3280. The browser opens a first visit on the newest verified debate, so its stills are the
  // ones the page paints first.
  const STILLS = ['speaker_still_slot_1', 'speaker_still_slot_2'];
  const postered = (page: { items: { entityId: string; debatePosters?: unknown }[] }) =>
    page.items.filter(item => item.debatePosters).map(item => item.entityId);

  it('hands the stills to the newest verified debate, the one a first visit opens on', async () => {
    graph.best[6] = { ...(graph.best[6] as object), createdAt: '1790000000' } as never;
    const page = await firstPage(true, STILLS);
    expect(page.items[0]?.entityId).toBe(bestIds[3]);
    expect(postered(page)).toEqual([bestIds[6]]);
    expect(page.items.find(item => item.entityId === bestIds[6])?.debatePosters).toEqual({
      slot1: expect.stringMatching(new RegExp(`/debates/${bestIds[6]}/media/artifacts/speaker_still_slot_1/content$`)),
      slot2: expect.stringMatching(new RegExp(`/debates/${bestIds[6]}/media/artifacts/speaker_still_slot_2/content$`)),
    });
  });

  it('keeps the stills on the lead when it is the newest', async () => {
    const page = await firstPage(true, STILLS);
    expect(postered(page)).toEqual([bestIds[3]]);
  });

  it('keeps the stills on the lead while seen demotion is off', async () => {
    graph.best[6] = { ...(graph.best[6] as object), createdAt: '1790000000' } as never;
    const page = await firstPage(false, STILLS);
    expect(postered(page)).toEqual([bestIds[3]]);
  });
});
