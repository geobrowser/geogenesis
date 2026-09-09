import { SystemIds } from '@geoprotocol/geo-sdk/lite';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as Effect from 'effect/Effect';

import { CLAIM_TYPE_ID } from '~/core/claims/ontology';

import { NEWS_STORY_TYPE_ID } from './explore-constants';

/**
 * The graph is mocked at `graphql()` — the single boundary every sort's fetcher goes through —
 * so a test can hand the feed an exact sequence of windows. `graphql` resolves to whatever its
 * `decoder` would have produced, which is the page shape below, so the mock returns that directly.
 */
const windows = vi.hoisted(() => ({ queue: [] as unknown[], calls: 0 }));

vi.mock('~/core/io/graphql-client', () => ({
  graphql: () => {
    const next = windows.queue[Math.min(windows.calls, windows.queue.length - 1)];
    windows.calls += 1;
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
