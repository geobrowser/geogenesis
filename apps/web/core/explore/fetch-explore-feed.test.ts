import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { NEWS_STORY_TYPE_ID } from './explore-constants';
import { claimsRequireDebateTagFilter } from './explore-debate-tag-filter';

/**
 * The graph is mocked at `graphql()` — the single boundary every sort's fetcher goes through —
 * so a test can hand the feed an exact sequence of windows. `graphql` resolves to whatever its
 * `decoder` would have produced, which is the page shape below, so the mock returns that directly.
 */
const windows = vi.hoisted(() => ({
  queue: [] as unknown[],
  calls: 0,
  /**
   * What each call actually asked the graph for. Kept because the interesting half of this module
   * is what it *sends*: a mock that only feeds rows back cannot tell whether the debate-tag clause
   * still reaches the query, so every one of these tests would go on passing if the gate silently
   * stopped being forwarded.
   */
  variables: [] as Record<string, unknown>[],
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ variables }: { variables: Record<string, unknown> }) => {
    const next = windows.queue[Math.min(windows.calls, windows.queue.length - 1)];
    windows.calls += 1;
    windows.variables.push(variables);
    return Effect.succeed(next);
  },
}));

// Only reached when a wallet is passed, which these cases do not do; mocked so the module graph
// does not pull the subgraph client in.
vi.mock('~/core/io/subgraph', () => ({ fetchProfile: () => Effect.succeed(null) }));
vi.mock('~/core/io/subgraph/fetch-proposed-members', () => ({ fetchActiveMemberRequest: async () => null }));

const { fetchExploreFeed } = await import('./fetch-explore-feed');

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const browse = {
  featured: [{ id: SPACE, name: 'Space', image: null }],
  editorOf: [],
  memberOf: [],
  documentationImage: null,
  personalSpaceId: null,
} as never;

/**
 * One card-shaped entity carrying a single type. Cast rather than fully built: `Entity` has a
 * dozen fields the feed never reads for this, and spelling them out would obscure the one thing
 * each fixture is about — which type the row lands on.
 */
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

function windowOf(entities: unknown[], opts: { hasNextPage: boolean; endCursor: string | null }) {
  return { entities, endCursor: opts.endCursor, hasNextPage: opts.hasNextPage };
}

const feedArgs = {
  browse,
  sort: 'best' as const,
  time: 'all' as const,
  spaceFilterIds: null,
  cursor: null,
  memberOrEditorSpaceIds: [],
  typeIds: [CLAIM_TYPE_ID],
  requireDebateTagOnClaims: true,
};

beforeEach(() => {
  windows.queue = [];
  windows.calls = 0;
  windows.variables = [];
});

/**
 * The clause has to survive the trip into every sort's query, and each sort composes it
 * differently — Best sends it as the whole `filter`, while New and Top spread it into the one
 * `buildFeedFilter` builds. The `or` key is the part that is the gate, so that is what these
 * compare, and it is the same assertion for all three.
 *
 * Worth pinning rather than reading: `buildFeedFilter(args)` picks the flag off the args object it
 * is handed, so a sort that forgets to pass it through fails silently and completely — the feed
 * just goes back to serving every claim.
 */
describe('the debate-tag clause reaching the query', () => {
  const sorts = ['best', 'new', 'top'] as const;

  function sentFilter() {
    return windows.variables[0]?.filter as { or?: unknown } | undefined;
  }

  it.each(sorts)('is sent for the %s sort when the caller asks for it', async sort => {
    windows.queue = [windowOf([entity('c1', CLAIM_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    await fetchExploreFeed({ ...feedArgs, sort });

    // Compared against the module that builds it, so the space-scoping travels too: a clause that
    // arrived unscoped would be an open gate, which is the thing the scoping exists to prevent.
    expect(sentFilter()?.or).toEqual(claimsRequireDebateTagFilter([SPACE]).or);
  });

  it.each(sorts)('is absent for the %s sort when it is not asked for', async sort => {
    windows.queue = [windowOf([entity('c1', CLAIM_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    await fetchExploreFeed({ ...feedArgs, sort, requireDebateTagOnClaims: false });

    // The activity feed shares this fetcher and must keep seeing untagged claims.
    expect(sentFilter()?.or).toBeUndefined();
  });
});

describe('a contextual entity scope', () => {
  const sorts = ['best', 'new', 'top'] as const;
  const entityFilter = { id: { is: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } };

  it.each(sorts)('is composed into the %s query', async sort => {
    windows.queue = [windowOf([entity('c1', CLAIM_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    await fetchExploreFeed({ ...feedArgs, sort, entityFilter });

    const filter = windows.variables[0]?.filter as { and?: unknown[] } | undefined;
    expect(filter?.and).toContainEqual(entityFilter);
  });
});

/**
 * GEO-2835 review. Best cannot filter by type in the query (GEO-2793), so it filters the window
 * here — and with the debate-tag gate applied, a Claim-only selection can match nothing in a
 * window while the connection still reports another page.
 *
 * An empty page that carries a cursor is not a pause: the client's sentinel has an 8000px
 * rootMargin, so with nothing rendered it stays intersecting and refires as soon as the request
 * settles. That is an unbounded loop of round trips that get slower with depth.
 */
describe('a window with nothing servable in it', () => {
  it('scans on rather than returning an empty page', async () => {
    windows.queue = [
      // Nothing a Claim-only selection can use...
      windowOf([entity('n1', NEWS_STORY_TYPE_ID)], { hasNextPage: true, endCursor: 'c1' }),
      windowOf([entity('n2', NEWS_STORY_TYPE_ID)], { hasNextPage: true, endCursor: 'c2' }),
      // ...until this one.
      windowOf([entity('c3', CLAIM_TYPE_ID)], { hasNextPage: true, endCursor: 'c3' }),
    ];

    const result = await fetchExploreFeed(feedArgs);

    expect(result.items.map(i => i.entityId)).toEqual(['c3']);
    expect(windows.calls).toBe(3);
  });

  it('never hands back a cursor on an empty page, which is what made it spin', async () => {
    // Every window is unusable and the connection always claims another page — the shape the
    // ranked feed really produces past the last tagged claim.
    windows.queue = [windowOf([entity('n1', NEWS_STORY_TYPE_ID)], { hasNextPage: true, endCursor: 'c1' })];

    const result = await fetchExploreFeed(feedArgs);

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('bounds how many windows one request will look at', async () => {
    windows.queue = [windowOf([entity('n1', NEWS_STORY_TYPE_ID)], { hasNextPage: true, endCursor: 'c1' })];

    await fetchExploreFeed(feedArgs);

    // The first window plus the scan budget's worth, and no more. Without a bound this is the
    // request that ran for 81 seconds.
    expect(windows.calls).toBeLessThanOrEqual(7);
  });

  it('stops at a genuine end of feed without spending the budget', async () => {
    windows.queue = [windowOf([entity('n1', NEWS_STORY_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    const result = await fetchExploreFeed(feedArgs);

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    // `hasNextPage: false` is the connection saying there is nothing further; scanning past that
    // would be asking a question already answered.
    expect(windows.calls).toBe(1);
  });
});

describe('a window that does have rows', () => {
  it('serves them and keeps paging, without extra fetches', async () => {
    windows.queue = [
      windowOf([entity('c1', CLAIM_TYPE_ID), entity('c2', CLAIM_TYPE_ID)], {
        hasNextPage: true,
        endCursor: 'next',
      }),
    ];

    const result = await fetchExploreFeed(feedArgs);

    expect(result.items.map(i => i.entityId)).toEqual(['c1', 'c2']);
    expect(result.nextCursor).not.toBeNull();
    expect(windows.calls).toBe(1);
  });
});

/**
 * GEO-2885. Best used to filter by type in this module, on whatever the window happened to
 * contain. Measured on production, Best's 66-row window holds Claim 47 / Debate 15 /
 * News story 3 / Bounty 1 — so a News-story-only page yielded 3 of the 22 it wanted. With
 * gaia #933 the server can do it exactly, so a type selection now goes to the by-type
 * connection.
 */
describe('a type selection filters server-side (GEO-2885)', () => {
  const sent = () => windows.variables[0] ?? {};

  it('sends the selected types, rather than filtering the window here', async () => {
    windows.queue = [windowOf([entity('c1', CLAIM_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    await fetchExploreFeed({ ...feedArgs, sort: 'best', typeIds: [CLAIM_TYPE_ID] });

    expect(sent().typeIds).toEqual([CLAIM_TYPE_ID]);
  });

  it('caps each type at offset + first, the smallest provably exact value', async () => {
    windows.queue = [windowOf([entity('c1', CLAIM_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    await fetchExploreFeed({ ...feedArgs, sort: 'best', typeIds: [CLAIM_TYPE_ID] });

    // Anything smaller truncates a type's candidate list before the global ordering and the
    // page silently returns short — the same class of bug this path exists to remove.
    expect(sent().maxPerType).toBe((sent().offset as number) + (sent().first as number));
  });

  it('grows the cap as it pages deeper', async () => {
    windows.queue = [windowOf([entity('c1', CLAIM_TYPE_ID)], { hasNextPage: true, endCursor: '66' })];

    // Second window: the cursor carries the server offset, so the cap must move with it. A
    // fixed cap would be exact on page one and short on every page after it, which is the
    // failure mode most likely to ship unnoticed.
    await fetchExploreFeed({ ...feedArgs, sort: 'best', typeIds: [CLAIM_TYPE_ID], cursor: 'w1:0:66' });

    expect(sent().offset).toBe(66);
    expect(sent().maxPerType).toBe(66 + (sent().first as number));
  });

  it('keeps the untyped walk when nothing is ticked', async () => {
    windows.queue = [windowOf([entity('c1', CLAIM_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    await fetchExploreFeed({ ...feedArgs, sort: 'best', typeIds: [] });

    // The by-type connection matches nothing without `typeIds`, and with no type argument the
    // untyped ranked walk is the right plan anyway (GEO-2793).
    expect(sent().typeIds).toBeUndefined();
    expect(sent().maxPerType).toBeUndefined();
    expect(sent()).toHaveProperty('after');
  });

  it('still forwards the debate-tag gate on the type-filtered path', async () => {
    windows.queue = [windowOf([entity('c1', CLAIM_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    await fetchExploreFeed({ ...feedArgs, sort: 'best', typeIds: [CLAIM_TYPE_ID] });

    // Easy to lose when swapping the document: the gate is an argument, not part of the
    // connection, so nothing would fail loudly if it stopped being sent.
    expect((sent().filter as { or?: unknown } | undefined)?.or).toEqual(claimsRequireDebateTagFilter([SPACE]).or);
  });
});

describe('a complete contextual population', () => {
  it('keeps entities omitted by the denormalized candidates and places unscored entities last', async () => {
    windows.queue = [
      {
        nodes: [
          { id: 'unscored', rankingScore: null },
          { id: 'ranked', rankingScore: '42.5' },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      windowOf([entity('unscored', CLAIM_TYPE_ID), entity('ranked', CLAIM_TYPE_ID)], {
        hasNextPage: false,
        endCursor: null,
      }),
    ];

    const scopeFilter = { id: { in: ['ranked', 'unscored'] } };
    const result = await fetchExploreFeed({
      ...feedArgs,
      requireDebateTagOnClaims: false,
      completePopulationScopes: [{ typeIds: [CLAIM_TYPE_ID], entityFilter: scopeFilter }],
    });

    expect(result.items.map(item => item.entityId)).toEqual(['ranked', 'unscored']);
    expect(windows.calls).toBe(2);
    expect((windows.variables[0]?.filter as { and?: unknown[] }).and).toContainEqual(scopeFilter);
    expect(windows.variables[1]?.filter).toEqual(
      expect.objectContaining({ and: expect.arrayContaining([{ id: { in: ['ranked', 'unscored'] } }]) })
    );
  });

  it('uses the same compact population for New and orders it by creation time', async () => {
    windows.queue = [
      {
        nodes: [
          { id: 'older-high-rank', rankingScore: '100', createdAt: '1700000000' },
          { id: 'newer-low-rank', rankingScore: '1', createdAt: '1800000000' },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
      windowOf([entity('older-high-rank', CLAIM_TYPE_ID), entity('newer-low-rank', CLAIM_TYPE_ID)], {
        hasNextPage: false,
        endCursor: null,
      }),
    ];

    const result = await fetchExploreFeed({
      ...feedArgs,
      sort: 'new',
      requireDebateTagOnClaims: false,
      completePopulationScopes: [
        { typeIds: [CLAIM_TYPE_ID], entityFilter: { id: { in: ['older-high-rank', 'newer-low-rank'] } } },
      ],
    });

    expect(result.items.map(item => item.entityId)).toEqual(['newer-low-rank', 'older-high-rank']);
    expect(windows.calls).toBe(2);
  });
});
