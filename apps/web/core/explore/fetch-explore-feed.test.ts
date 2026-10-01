import { SystemIds } from '@geoprotocol/geo-sdk/lite';

import * as Effect from 'effect/Effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';
import { DEBATE_TYPE_ID } from '~/core/debates/ontology';

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
  operations: [] as string[],
  responder: null as null | ((operation: string, variables: Record<string, unknown>) => unknown),
}));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: ({ query, variables }: { query: any; variables: Record<string, unknown> }) => {
    const operation =
      query.definitions.find((definition: any) => definition.kind === 'OperationDefinition')?.name?.value ?? '';
    windows.operations.push(operation);
    if (windows.responder) {
      windows.calls += 1;
      windows.variables.push(variables);
      return Effect.succeed(windows.responder(operation, variables));
    }
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

const { ExploreSpaceScopeUnresolvedError, fetchCompleteExplorePopulationIndex, fetchExploreFeed } =
  await import('./fetch-explore-feed');
const { encodeExploreForYouCursor } = await import('./explore-window-cursor');

const SPACE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const browse = {
  featured: [{ id: SPACE, name: 'Space', image: null }],
  editorOf: [],
  memberOf: [],
  documentationImage: null,
  personalSpaceId: null,
} as never;

/**
 * One card-shaped entity carrying the given types. Cast rather than fully built: `Entity` has a
 * dozen fields the feed never reads for this, and spelling them out would obscure the one thing
 * each fixture is about — which types the row lands on.
 */
function entity(id: string, ...typeIds: string[]) {
  return {
    id,
    name: `entity-${id}`,
    description: null,
    spaces: [SPACE],
    types: typeIds.map(typeId => ({ id: typeId, name: null })),
    values: [],
    relations: typeIds.map(typeId => ({
      id: `rel-${id}-${typeId}`,
      spaceId: SPACE,
      type: { id: SystemIds.TYPES_PROPERTY },
      toEntity: { id: typeId, name: null, types: [], values: [] },
    })),
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
  windows.operations = [];
  windows.responder = null;
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
/**
 * The type selection matches an entity carrying *any* selected type, so it cannot keep out a Claim
 * that is also a News story. The exclusion drops those rows in every sort, after the query.
 */
describe('an excluded type', () => {
  it.each(['best', 'new', 'top'] as const)('drops an entity carrying it on %s, whatever else it is', async sort => {
    windows.queue = [
      windowOf([entity('c1', CLAIM_TYPE_ID, NEWS_STORY_TYPE_ID), entity('c2', CLAIM_TYPE_ID)], {
        hasNextPage: false,
        endCursor: null,
      }),
    ];

    const result = await fetchExploreFeed({ ...feedArgs, sort, excludeTypeIds: [NEWS_STORY_TYPE_ID] });

    expect(result.items.map(i => i.entityId)).toEqual(['c2']);
  });

  it('keeps every row when nothing is excluded', async () => {
    windows.queue = [
      windowOf([entity('c1', CLAIM_TYPE_ID, NEWS_STORY_TYPE_ID), entity('c2', CLAIM_TYPE_ID)], {
        hasNextPage: false,
        endCursor: null,
      }),
    ];

    const result = await fetchExploreFeed({ ...feedArgs, sort: 'new' });

    expect(result.items.map(i => i.entityId).sort()).toEqual(['c1', 'c2']);
  });
});

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
  it('exhausts relation pages, deduplicates source entities, and preserves all feed guards', async () => {
    windows.queue = [
      {
        nodes: [
          { fromEntity: { id: 'relation-ranked', rankingScore: '10', createdAt: '1' } },
          { fromEntity: null },
          null,
        ],
        pageInfo: { hasNextPage: true, endCursor: 'next-relation-page' },
      },
      {
        nodes: [
          { fromEntity: { id: 'relation-ranked', rankingScore: '10', createdAt: '1' } },
          { fromEntity: { id: 'relation-unscored', rankingScore: null, createdAt: '2' } },
        ],
        pageInfo: { hasNextPage: false },
      },
    ];
    const relationFilter = { typeId: { is: 'topics-property' }, toEntityId: { is: 'page-topic' } };
    const entityFilter = { relations: { some: { toEntityId: { is: 'selected-topic' } } } };
    const args = {
      spaceIds: [SPACE],
      sort: 'best' as const,
      time: 'all' as const,
      typeIds: [CLAIM_TYPE_ID],
      requireName: true,
      scopes: [{ typeIds: [CLAIM_TYPE_ID], entityFilter, relationFilter }],
    };
    const rows = await fetchCompleteExplorePopulationIndex(args);
    expect(rows.map(row => row.id)).toEqual(['relation-ranked', 'relation-unscored']);
    expect(windows.operations).toEqual(['ExploreRelationIndex', 'ExploreRelationIndex']);
    expect(windows.variables[1]?.after).toBe('next-relation-page');
    const filter = windows.variables[0]?.filter as any;
    expect(filter.and[0]).toEqual(relationFilter);
    expect(filter.and[1].fromEntity.and[1]).toEqual(entityFilter);
    expect(filter.and[1].fromEntity.and[0]).toMatchObject({
      typeIds: { overlaps: [CLAIM_TYPE_ID] },
      spaceIds: { overlaps: [SPACE] },
      values: { some: { spaceId: { in: [SPACE] }, text: { isNull: false, isNot: '' } } },
      relations: { none: { or: expect.any(Array) } },
    });
    expect(await fetchCompleteExplorePopulationIndex(args)).toEqual(rows);
    expect(windows.calls).toBe(2);

    windows.calls = 0;
    const newest = await fetchCompleteExplorePopulationIndex({ ...args, sort: 'new' });
    expect(newest.map(row => row.id)).toEqual(['relation-unscored', 'relation-ranked']);
  });

  it.each([
    { relation: true, endCursor: null, message: 'no end cursor', failedCalls: 1 },
    { relation: true, endCursor: 'repeated', message: 'repeated its end cursor', failedCalls: 2 },
    { relation: false, endCursor: null, message: 'no end cursor', failedCalls: 1 },
    { relation: false, endCursor: 'repeated', message: 'repeated its end cursor', failedCalls: 2 },
  ])('rejects invalid cursor chains and evicts the failed population: %j', async scenario => {
    const id = `cursor-contract-${scenario.relation}-${scenario.endCursor}`;
    const node = { id, rankingScore: '1', createdAt: '1' };
    const nodes = scenario.relation ? [{ fromEntity: node }] : [node];
    windows.responder = () => ({ nodes, pageInfo: { hasNextPage: true, endCursor: scenario.endCursor } });
    const args = {
      spaceIds: [SPACE],
      sort: 'best' as const,
      time: 'all' as const,
      typeIds: [CLAIM_TYPE_ID],
      scopes: [
        {
          typeIds: [CLAIM_TYPE_ID],
          entityFilter: { id: { is: id } },
          ...(scenario.relation ? { relationFilter: { toEntityId: { is: id } } } : {}),
        },
      ],
    };

    await expect(fetchCompleteExplorePopulationIndex(args)).rejects.toThrow(scenario.message);
    expect(windows.calls).toBe(scenario.failedCalls);
    windows.responder = () => ({ nodes, pageInfo: { hasNextPage: false, endCursor: null } });
    await expect(fetchCompleteExplorePopulationIndex(args)).resolves.toEqual([node]);
    expect(windows.calls).toBe(scenario.failedCalls + 1);
  });

  it('shares one compact population when equivalent space filters arrive in a different order', async () => {
    const secondSpace = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    windows.responder = operation =>
      operation === 'ExploreCompleteIndex'
        ? {
            nodes: [{ id: 'cache-order', typeIds: [CLAIM_TYPE_ID], rankingScore: '1', createdAt: '1' }],
            pageInfo: { hasNextPage: false, endCursor: null },
          }
        : windowOf([], { hasNextPage: false, endCursor: null });
    const args = {
      spaceIds: [SPACE, secondSpace],
      sort: 'best' as const,
      time: 'all' as const,
      typeIds: [CLAIM_TYPE_ID],
      requireName: true,
      scopes: [{ typeIds: [CLAIM_TYPE_ID], entityFilter: { id: { is: 'cache-order' } } }],
    };

    await fetchCompleteExplorePopulationIndex(args);
    await fetchCompleteExplorePopulationIndex({ ...args, spaceIds: [secondSpace, SPACE] });

    expect(windows.operations.filter(operation => operation === 'ExploreCompleteIndex')).toHaveLength(1);
  });

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

  it('reuses the ordered compact population when infinite scroll advances', async () => {
    const rows = Array.from({ length: 31 }, (_, index) => ({
      id: `entity-${index.toString().padStart(2, '0')}`,
      rankingScore: String(31 - index),
      createdAt: String(1_800_000_000 - index),
    }));
    windows.responder = operation =>
      operation === 'ExploreCompleteIndex'
        ? { nodes: rows, pageInfo: { hasNextPage: false, endCursor: null } }
        : windowOf(
            rows.map(row => entity(row.id, CLAIM_TYPE_ID)),
            { hasNextPage: false, endCursor: null }
          );

    const args = {
      ...feedArgs,
      requireDebateTagOnClaims: false,
      completePopulationScopes: [{ typeIds: [CLAIM_TYPE_ID], entityFilter: { id: { in: rows.map(row => row.id) } } }],
    };
    const first = await fetchExploreFeed(args);
    expect(first.nextCursor).not.toBeNull();

    await fetchExploreFeed({ ...args, cursor: first.nextCursor });

    expect(windows.operations.filter(operation => operation === 'ExploreCompleteIndex')).toHaveLength(1);
    expect(windows.operations.filter(operation => operation === 'ExploreEntitiesConnection')).toHaveLength(2);
  });
});

/**
 * The signed-out reader's whole visible scope is the Featured list, so these two cases — which
 * produce byte-identical empty pages today — are the difference between "nothing matched" and
 * "Explore is broken".
 */
describe('a visible space scope with nothing in it', () => {
  it('serves an empty page when the scope resolved and simply holds no space', async () => {
    const result = await fetchExploreFeed({
      ...feedArgs,
      browse: { featured: [], editorOf: [], memberOf: [], documentationImage: null, personalSpaceId: null } as never,
    });

    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('fails instead when the scope is empty because the Featured traversal failed', async () => {
    await expect(
      fetchExploreFeed({
        ...feedArgs,
        browse: {
          featured: [],
          editorOf: [],
          memberOf: [],
          documentationImage: null,
          personalSpaceId: null,
          featuredError: true,
        } as never,
      })
    ).rejects.toThrow(ExploreSpaceScopeUnresolvedError);
  });

  // A reader who *is* signed in still has their own spaces, which is why this bug only ever showed
  // itself logged out — and why a failed Featured list must not take their feed down with it.
  it('still serves the feed when Featured failed but the reader has spaces of their own', async () => {
    windows.queue = [windowOf([entity('a', CLAIM_TYPE_ID)], { hasNextPage: false, endCursor: null })];

    const result = await fetchExploreFeed({
      ...feedArgs,
      browse: {
        featured: [],
        editorOf: [{ id: SPACE, name: 'Space', image: null }],
        memberOf: [],
        documentationImage: null,
        personalSpaceId: null,
        featuredError: true,
      } as never,
    });

    expect(result.items.map(item => item.entityId)).toEqual(['a']);
  });
});

// GEO-3070. Explore's Best opens on the highest-ranked debate whose video plays.
describe('leading Best with a playable debate', () => {
  // Debate entity ids are geo-chat debate ids, so they are real 32-hex ids here.
  const D1 = 'd1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1';
  const D2 = 'd2d2d2d2d2d2d2d2d2d2d2d2d2d2d2d2';
  const uuid = (hex: string) =>
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const mediaAsked: string[] = [];

  const withMedia = (processed: Record<string, boolean>) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        mediaAsked.push(url);
        const id = Object.keys(processed).find(hex => url.includes(`/debates/${uuid(hex)}/media`));
        const artifacts = id && processed[id] ? [{ kind: 'final_video' }] : [];
        return new Response(JSON.stringify({ artifacts }), { status: 200 });
      })
    );

  const leadArgs = { ...feedArgs, typeIds: [CLAIM_TYPE_ID, DEBATE_TYPE_ID], leadWithPlayableDebate: true };
  const rankedWindow = () =>
    windowOf(
      [
        entity('c1', CLAIM_TYPE_ID),
        entity('c2', CLAIM_TYPE_ID),
        entity(D1, DEBATE_TYPE_ID),
        entity(D2, DEBATE_TYPE_ID),
      ],
      { hasNextPage: true, endCursor: 'next' }
    );

  beforeEach(() => {
    mediaAsked.length = 0;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('puts the highest-ranked playable debate first, once', async () => {
    windows.queue = [rankedWindow()];
    withMedia({ [D1]: false, [D2]: true });

    const result = await fetchExploreFeed(leadArgs);
    const served = result.items.map(i => i.entityId);

    expect(served[0]).toBe(D2);
    expect(served.filter(id => id === D2)).toHaveLength(1);
    expect(served).toContain(D1);
  });

  it('serves the ranked order when no debate plays', async () => {
    windows.queue = [rankedWindow()];
    withMedia({ [D1]: false, [D2]: false });
    const ranked = (await fetchExploreFeed({ ...leadArgs, leadWithPlayableDebate: false })).items.map(i => i.entityId);

    windows.calls = 0;
    const result = await fetchExploreFeed(leadArgs);

    expect(result.items.map(i => i.entityId)).toEqual(ranked);
  });

  it('only reorders when asked: other feeds keep their ranked order and ask geo-chat nothing', async () => {
    windows.queue = [rankedWindow()];
    withMedia({ [D2]: true });

    await fetchExploreFeed({ ...leadArgs, leadWithPlayableDebate: false });
    await fetchExploreFeed({ ...leadArgs, sort: 'new' });

    expect(mediaAsked).toEqual([]);
  });

  it('leaves windows past the first alone', async () => {
    windows.queue = [rankedWindow()];
    withMedia({ [D2]: true });

    await fetchExploreFeed({ ...leadArgs, cursor: 'w1:0:next' });

    expect(mediaAsked).toEqual([]);
  });
});

/** GEO-3083. For you: the followed-topic stream mixed 3:1 with Best, both under Best's rules. */
describe('For you', () => {
  const TOPIC_A = '11111111111111111111111111111111';
  const TOPIC_B = '22222222222222222222222222222222';
  const forYouArgs = { ...feedArgs, typeIds: [CLAIM_TYPE_ID, DEBATE_TYPE_ID], forYouTopicIds: [TOPIC_A, TOPIC_B] };

  function claims(prefix: string, count: number) {
    return Array.from({ length: count }, (_, i) => entity(`${prefix}${i}`, CLAIM_TYPE_ID));
  }

  /** Stream pages as the decoder returns them. `gaps` are node indices that failed to decode. */
  function respond(
    topicEntities: unknown[],
    bestEntities: unknown[],
    topicOf: (id: string) => string = () => TOPIC_A,
    gaps: { topics?: number[]; best?: number[] } = {}
  ) {
    const followed = new Set((topicEntities as Array<{ id: string }>).map(e => e.id));
    const page = (
      all: unknown[],
      offset: number,
      first: number,
      gapAt: number[] = [],
      tagged: (id: string) => boolean
    ) => {
      const nodes = (all as Array<{ id: string }>).slice(offset, offset + first);
      const kept = nodes.map((e, i) => ({ e, i })).filter(({ i }) => !gapAt.includes(offset + i));
      return {
        entities: kept.map(({ e }) => e),
        rawIndex: kept.map(({ i }) => i),
        matchedTopicIds: new Map(kept.map(({ e }) => [e.id, tagged(e.id) ? [topicOf(e.id)] : []])),
        fetched: nodes.length,
      };
    };
    windows.responder = (operation, variables) => {
      const offset = Number(variables.offset ?? 0);
      const first = Number(variables.first);
      if (operation === 'ExploreForYouConnection') return page(topicEntities, offset, first, gaps.topics, () => true);
      if (operation === 'ExploreForYouBestConnection') {
        return page(bestEntities, offset, first, gaps.best, id => followed.has(id));
      }
      return page(bestEntities, offset, first, gaps.best, () => false);
    };
  }

  const opsOf = (name: string) => windows.variables.filter((_, i) => windows.operations[i] === name);

  it('asks for both streams under the same scope, with maxPerTopic at offset + first', async () => {
    respond(claims('t', 5), claims('b', 5));

    await fetchExploreFeed(forYouArgs);

    const [topic] = opsOf('ExploreForYouConnection');
    const [best] = opsOf('ExploreForYouBestConnection');
    expect(topic).toMatchObject({ topicIds: [TOPIC_A, TOPIC_B], offset: 0, first: 66, maxPerTopic: 66 });
    expect(best).toMatchObject({ offset: 0, first: 66, maxPerType: 66, topicIds: [TOPIC_A, TOPIC_B] });
    expect(topic.typeIds).toEqual(best.typeIds);
    expect((topic.filter as { or?: unknown }).or).toEqual(claimsRequireDebateTagFilter([SPACE]).or);
  });

  it('serves three followed items then one Best item', async () => {
    respond(claims('t', 30), claims('b', 30));

    const { items } = await fetchExploreFeed(forYouArgs);

    expect(items.slice(0, 8).map(item => item.entityId)).toEqual(['t0', 't1', 't2', 'b0', 't3', 't4', 't5', 'b1']);
  });

  it('is exactly Best when nothing is followed', async () => {
    respond(claims('t', 30), claims('b', 30));

    await fetchExploreFeed({ ...forYouArgs, forYouTopicIds: [] });

    expect(windows.operations).not.toContain('ExploreForYouConnection');
  });

  it('holds one topic to the cap while another can fill in', async () => {
    // Shaped like testnet following 10 topics, where one topic held 59 of 66. Three topics, because
    // at 6 per page two cannot fill a page between them and the cap has to give.
    const TOPIC_C = '33333333333333333333333333333333';
    const topicEntities = [...claims('a', 40), ...claims('c', 13), ...claims('d', 13)];
    respond(topicEntities, claims('b', 30), id =>
      id.startsWith('a') ? TOPIC_A : id.startsWith('c') ? TOPIC_B : TOPIC_C
    );

    const { items } = await fetchExploreFeed(forYouArgs);

    expect(items.filter(item => item.entityId.startsWith('a')).length).toBeLessThanOrEqual(6);
  });

  it('pages both streams with no repeats and full pages, moving each past what it served', async () => {
    respond(claims('t', 100), claims('b', 100));

    const pages: string[][] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 5; i += 1) {
      const result = await fetchExploreFeed({ ...forYouArgs, cursor });
      pages.push(result.items.map(item => item.entityId));
      cursor = result.nextCursor;
    }

    const served = pages.flat();
    expect(new Set(served).size).toBe(served.length);
    expect(pages.every(page => page.length === 22)).toBe(true);
    // Each stream moves past what it served, and maxPerTopic keeps up with the offset.
    const offsets = opsOf('ExploreForYouConnection').map(v => Number(v.offset));
    expect(offsets).toEqual([...offsets].sort((x, y) => x - y));
    expect(offsets.at(-1)).toBeGreaterThan(0);
    for (const v of opsOf('ExploreForYouConnection')) expect(v.maxPerTopic).toBe(Number(v.offset) + 66);
    expect(served.filter(id => id.startsWith('b')).length).toBeGreaterThanOrEqual(5 * 5);
  });

  it('becomes Best once the followed topics run out, and ends when Best does', async () => {
    respond(claims('t', 3), claims('b', 40));

    const pages: string[][] = [];
    let cursor: string | null = null;
    do {
      const result = await fetchExploreFeed({ ...forYouArgs, cursor });
      pages.push(result.items.map(item => item.entityId));
      cursor = result.nextCursor;
    } while (cursor !== null && pages.length < 10);

    expect(pages[0].slice(0, 5)).toEqual(['t0', 't1', 't2', 'b0', 'b1']);
    expect(pages.flat()).toEqual(['t0', 't1', 't2', ...claims('b', 40).map((_, i) => `b${i}`)]);
    expect(pages.slice(0, -1).every(page => page.length === 22)).toBe(true);
    // The topic stream ran out on the first page, so it isn't asked again.
    expect(opsOf('ExploreForYouConnection')).toHaveLength(1);
    expect(cursor).toBeNull();
  });

  it('serves an item matching a follow from the topic stream only, so pages never repeat it', async () => {
    // Best ranks t0-t9 too; they are followed, so only the topic stream may serve them.
    respond(claims('t', 10), [...claims('t', 10), ...claims('b', 80)]);

    const pages: string[][] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 4; i += 1) {
      const result = await fetchExploreFeed({ ...forYouArgs, cursor });
      pages.push(result.items.map(item => item.entityId));
      cursor = result.nextCursor;
    }

    const served = pages.flat();
    expect(new Set(served).size).toBe(served.length);
    expect(pages.every(page => page.length === 22)).toBe(true);
    expect(served.filter(id => id.startsWith('t'))).toHaveLength(10);
  });

  it('falls back to Best for a page when the topic query fails, instead of failing it', async () => {
    respond([], claims('b', 100));
    const inner = windows.responder!;
    windows.responder = (operation, variables) => {
      if (operation === 'ExploreForYouConnection') throw new Error('Unknown argument "maxPerTopic"');
      return inner(operation, variables);
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const first = await fetchExploreFeed(forYouArgs);
    const second = await fetchExploreFeed({ ...forYouArgs, cursor: first.nextCursor });

    expect(first.items.map(item => item.entityId)).toEqual(claims('b', 22).map((_, i) => `b${i}`));
    expect(second.items[0]?.entityId).toBe('b22');
    // Each page tries the topic stream again, so a transient failure costs one page of mixing.
    expect(opsOf('ExploreForYouConnection')).toHaveLength(2);
    error.mockRestore();
  });

  it('loses nothing to a transient topic failure', async () => {
    const tagged = claims('t', 40);
    respond(tagged, [...tagged, ...claims('b', 120)]);
    const inner = windows.responder!;
    let topicCalls = 0;
    windows.responder = (operation, variables) => {
      if (operation === 'ExploreForYouConnection' && ++topicCalls === 2) throw new Error('timeout');
      return inner(operation, variables);
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const served: string[] = [];
    let cursor: string | null = null;
    do {
      const result = await fetchExploreFeed({ ...forYouArgs, cursor });
      served.push(...result.items.map(item => item.entityId));
      cursor = result.nextCursor;
    } while (cursor !== null && served.length < 400);

    expect(new Set(served)).toEqual(new Set([...tagged, ...claims('b', 120)].map(e => (e as { id: string }).id)));
    error.mockRestore();
  });

  it('keeps its place when a node fails to decode', async () => {
    respond(claims('t', 30), claims('b', 90), () => TOPIC_A, { topics: [0], best: [0, 5] });

    const served: string[] = [];
    let cursor: string | null = null;
    do {
      const result = await fetchExploreFeed({ ...forYouArgs, cursor });
      served.push(...result.items.map(item => item.entityId));
      cursor = result.nextCursor;
    } while (cursor !== null && served.length < 200);

    const expected = [...claims('t', 30), ...claims('b', 90)]
      .map(e => (e as { id: string }).id)
      .filter(id => !['t0', 'b0', 'b5'].includes(id));
    expect(served).toHaveLength(expected.length);
    expect(new Set(served)).toEqual(new Set(expected));
  });

  it('remembers a Best row it served from deep in the stream when the next page reads less', async () => {
    // Page 1 reads two chunks of Best and takes the debate at raw index 128; page 2 reads one.
    const tagged = claims('t', 56);
    const followed = [...tagged, ...claims('u', 40)];
    const best = [
      ...claims('c', 4),
      ...tagged,
      ...claims('y', 66),
      ...claims('w', 2),
      entity('d0', DEBATE_TYPE_ID),
      ...claims('z', 60),
    ];
    respond(followed, best, id => [TOPIC_A, TOPIC_B, '33333333333333333333333333333333'][Number(id.slice(1)) % 3]);

    const served: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 8 && (i === 0 || cursor !== null); i += 1) {
      const result = await fetchExploreFeed({ ...forYouArgs, cursor });
      served.push(...result.items.map(item => item.entityId));
      cursor = result.nextCursor;
    }

    expect(served.filter(id => id === 'd0')).toHaveLength(1);
    expect(new Set(served).size).toBe(served.length);
  });

  it('reads further into the topic stream when most of its next rows were already served', async () => {
    // The state a long scroll reaches: Best has run out, and the per-topic cap served 49 of the
    // next 66 topic rows ahead of the frontier.
    respond(claims('t', 400), []);
    const served = new Set(Array.from({ length: 49 }, (_, i) => i + 1));
    const cursor = encodeExploreForYouCursor({ topic: { offset: 100, served }, best: null });

    const { items, nextCursor } = await fetchExploreFeed({ ...forYouArgs, cursor });

    expect(items).toHaveLength(22);
    expect(items.map(item => item.entityId)).not.toContain('t101');
    expect(nextCursor).not.toBeNull();
  });

  it('fetches further into Best when most of it matches a follow, to keep the Best share', async () => {
    // 95% of Best's first rows are followed items, which only the topic stream serves.
    const tagged = claims('t', 120);
    const best = [...tagged.slice(0, 63), ...claims('b', 3), ...tagged.slice(63), ...claims('x', 40)];
    respond(tagged, best);

    const { items } = await fetchExploreFeed(forYouArgs);

    const bestItems = items.filter(item => !item.entityId.startsWith('t'));
    expect(bestItems.length).toBeGreaterThanOrEqual(5);
    expect(opsOf('ExploreForYouBestConnection').length).toBeGreaterThan(1);
  });
});
