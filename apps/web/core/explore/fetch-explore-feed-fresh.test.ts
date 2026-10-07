import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

import { DEFAULT_FRESH_SLOT_CONFIG, type FreshSlotConfig } from './fresh-slot/fresh-slot-config';

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
      return Effect.succeed({ entities: graph.fresh, endCursor: null, hasNextPage: false });
    }
    throw new Error(`unexpected operation ${operation}`);
  },
}));
vi.mock('~/core/io/subgraph', () => ({ fetchProfile: () => Effect.succeed(null) }));
vi.mock('~/core/io/subgraph/fetch-proposed-members', () => ({ fetchActiveMemberRequest: async () => null }));

const { fetchExploreFeed } = await import('./fetch-explore-feed');
const { encodeExploreWindowCursor } = await import('./explore-window-cursor');

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
    const asOf = Math.floor(clock / 1000);
    expect(ranges[0]).toContain(
      `"createdAt":{"greaterThanOrEqualTo":"${asOf - 24 * 3600}","lessThanOrEqualTo":"${asOf}"}`
    );
    // Later pages ran hours later and still asked for the same range (or were served from cache).
    expect(new Set(ranges).size).toBe(1);
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
